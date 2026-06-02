import {
  gpsFixMeetsThreshold,
  projectLonLatToXy,
  type AppSettings,
  type RtkQuality,
  type SurveyPoint,
} from "@cplayout/core";

export interface ParsedNmeaSample {
  sentenceType: string;
  latitude?: number;
  longitude?: number;
  fixType?: RtkQuality["fixType"];
  satellites?: number;
  hdop?: number;
  vdop?: number;
  pdop?: number;
  altitudeMeters?: number;
  correctionAgeSeconds?: number | null;
  horizontalAccuracyMeters?: number;
  verticalAccuracyMeters?: number;
  nmeaQualityCode?: number;
}

export interface RtkQualityGateResult {
  accepted: boolean;
  reasons: string[];
  quality: RtkQuality;
}

export interface NmeaStreamAccumulator {
  carry: string;
}

export interface NmeaChunkParseResult {
  accumulator: NmeaStreamAccumulator;
  lines: string[];
  samples: ParsedNmeaSample[];
}

export function parseNmeaSentence(sentence: string): ParsedNmeaSample | null {
  const trimmed = sentence.trim();
  if (!trimmed.startsWith("$")) return null;
  if (!nmeaChecksumValid(trimmed)) return null;

  const withoutChecksum = trimmed.slice(1).split("*")[0];
  const fields = withoutChecksum.split(",");
  const sentenceType = fields[0].slice(-3);

  if (sentenceType === "GGA") {
    const qualityCode = parseOptionalNumber(fields[6]);
    return {
      sentenceType,
      latitude: parseNmeaCoordinate(fields[2], fields[3]),
      longitude: parseNmeaCoordinate(fields[4], fields[5]),
      fixType: mapGgaQuality(qualityCode),
      satellites: parseOptionalNumber(fields[7]) ?? undefined,
      hdop: parseOptionalNumber(fields[8]) ?? undefined,
      altitudeMeters: parseOptionalNumber(fields[9]) ?? undefined,
      correctionAgeSeconds: parseOptionalNumber(fields[13]),
      nmeaQualityCode: qualityCode ?? undefined,
    };
  }

  if (sentenceType === "GSA") {
    return {
      sentenceType,
      pdop: parseOptionalNumber(fields[15]) ?? undefined,
      hdop: parseOptionalNumber(fields[16]) ?? undefined,
      vdop: parseOptionalNumber(fields[17]) ?? undefined,
    };
  }

  if (sentenceType === "GST") {
    const latitudeStdDev = parseOptionalNumber(fields[6]);
    const longitudeStdDev = parseOptionalNumber(fields[7]);
    return {
      sentenceType,
      horizontalAccuracyMeters: maxNullable(latitudeStdDev, longitudeStdDev) ?? undefined,
      verticalAccuracyMeters: parseOptionalNumber(fields[8]) ?? undefined,
    };
  }

  if (sentenceType === "RMC") {
    return {
      sentenceType,
      latitude: parseNmeaCoordinate(fields[3], fields[4]),
      longitude: parseNmeaCoordinate(fields[5], fields[6]),
    };
  }

  return { sentenceType };
}

export function mapGgaQuality(code: number | null | undefined): RtkQuality["fixType"] {
  switch (code) {
    case 0:
      return "invalid";
    case 1:
      return "autonomous";
    case 2:
      return "dgps";
    case 4:
      return "rtk_fixed";
    case 5:
      return "rtk_float";
    case 6:
      return "autonomous";
    default:
      return "unknown";
  }
}

export function parseNmeaLog(input: string | Iterable<string>): ParsedNmeaSample[] {
  const lines = typeof input === "string" ? input.split(/\r?\n/) : Array.from(input);
  return lines
    .map((line) => parseNmeaSentence(line))
    .filter((sample): sample is ParsedNmeaSample => Boolean(sample));
}

export function createNmeaStreamAccumulator(carry = ""): NmeaStreamAccumulator {
  return { carry };
}

export function parseNmeaStreamChunk(accumulator: NmeaStreamAccumulator, chunk: string): NmeaChunkParseResult {
  const combined = `${accumulator.carry}${chunk}`.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = combined.split("\n");
  const carry = parts.pop() ?? "";
  const lines = parts.map((line) => line.trim()).filter((line) => line.length > 0);
  return {
    accumulator: { carry },
    lines,
    samples: parseNmeaLog(lines),
  };
}

export function rtkQualityFromNmeaSamples(samples: ParsedNmeaSample[]): RtkQuality {
  const quality: RtkQuality = {
    fixType: "unknown",
    satellites: null,
    hdop: null,
    vdop: null,
    pdop: null,
    correctionAgeSeconds: null,
    horizontalAccuracyMeters: null,
    verticalAccuracyMeters: null,
  };

  for (const sample of samples) {
    if (sample.fixType) quality.fixType = sample.fixType;
    if (sample.satellites !== undefined) quality.satellites = sample.satellites;
    if (sample.hdop !== undefined) quality.hdop = sample.hdop;
    if (sample.vdop !== undefined) quality.vdop = sample.vdop;
    if (sample.pdop !== undefined) quality.pdop = sample.pdop;
    if (sample.correctionAgeSeconds !== undefined) quality.correctionAgeSeconds = sample.correctionAgeSeconds;
    if (sample.horizontalAccuracyMeters !== undefined) quality.horizontalAccuracyMeters = sample.horizontalAccuracyMeters;
    if (sample.verticalAccuracyMeters !== undefined) quality.verticalAccuracyMeters = sample.verticalAccuracyMeters;
    if (sample.nmeaQualityCode !== undefined) quality.nmeaQualityCode = sample.nmeaQualityCode;
  }
  return quality;
}

export function latestPositionFromNmeaSamples(samples: ParsedNmeaSample[]): { latitude: number; longitude: number } | null {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    if (sample.latitude !== undefined && sample.longitude !== undefined) {
      return { latitude: sample.latitude, longitude: sample.longitude };
    }
  }
  return null;
}

export function evaluateRtkQualityGate(quality: RtkQuality, thresholds: AppSettings["gpsQuality"]): RtkQualityGateResult {
  const reasons: string[] = [];
  if (!gpsFixMeetsThreshold(quality.fixType, thresholds.minimumFixType)) {
    reasons.push(`fix ${quality.fixType} is below required ${thresholds.minimumFixType}`);
  }
  if ((quality.hdop ?? Number.POSITIVE_INFINITY) > thresholds.maxHdop) {
    reasons.push(`HDOP ${quality.hdop ?? "unknown"} exceeds ${thresholds.maxHdop}`);
  }
  if ((quality.satellites ?? -1) < thresholds.minSatellites) {
    reasons.push(`satellites ${quality.satellites ?? "unknown"} below required ${thresholds.minSatellites}`);
  }
  if ((quality.horizontalAccuracyMeters ?? Number.POSITIVE_INFINITY) > thresholds.maxHorizontalAccuracyMeters) {
    reasons.push(`horizontal accuracy ${quality.horizontalAccuracyMeters ?? "unknown"} m exceeds ${thresholds.maxHorizontalAccuracyMeters} m`);
  }
  if ((quality.correctionAgeSeconds ?? Number.POSITIVE_INFINITY) > thresholds.maxCorrectionAgeSeconds) {
    reasons.push(`correction age ${quality.correctionAgeSeconds ?? "unknown"} s exceeds ${thresholds.maxCorrectionAgeSeconds} s`);
  }
  return { accepted: reasons.length === 0, reasons, quality };
}

export function surveyPointFromNmeaSamples(input: {
  samples: ParsedNmeaSample[];
  projectCrs: string;
  id: string;
  label: string;
  role?: SurveyPoint["role"];
  observedAt: string;
}): SurveyPoint {
  const position = latestPositionFromNmeaSamples(input.samples);
  if (!position) throw new Error("NMEA replay did not contain a latitude/longitude fix.");
  const quality = rtkQualityFromNmeaSamples(input.samples);
  return {
    id: input.id,
    label: input.label,
    role: input.role ?? "control",
    projected: projectLonLatToXy({ longitude: position.longitude, latitude: position.latitude }, input.projectCrs),
    wgs84: { longitude: position.longitude, latitude: position.latitude },
    observedAt: input.observedAt,
    source: "external_gnss",
    confidence: quality.fixType === "rtk_fixed" ? "rtk_fixed" : quality.fixType === "rtk_float" ? "rtk_float" : "autonomous_gps",
    rtk: quality,
  };
}

export function nmeaChecksumValid(sentence: string): boolean {
  const trimmed = sentence.trim();
  const checksumMarker = trimmed.lastIndexOf("*");
  if (checksumMarker === -1) return true;
  if (!trimmed.startsWith("$") || checksumMarker <= 1 || checksumMarker + 3 !== trimmed.length) return false;
  const expected = trimmed.slice(checksumMarker + 1).toUpperCase();
  if (!/^[0-9A-F]{2}$/.test(expected)) return false;
  let checksum = 0;
  for (const character of trimmed.slice(1, checksumMarker)) {
    checksum ^= character.charCodeAt(0);
  }
  return expected === checksum.toString(16).toUpperCase().padStart(2, "0");
}

function parseNmeaCoordinate(value: string | undefined, hemisphere: string | undefined): number | undefined {
  if (!value || !hemisphere) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;

  const degrees = Math.floor(numeric / 100);
  const minutes = numeric - degrees * 100;
  const signed = degrees + minutes / 60;
  return hemisphere === "S" || hemisphere === "W" ? -signed : signed;
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
