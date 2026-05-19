import { RtkQuality } from "./types";

export interface ParsedNmeaSample {
  sentenceType: string;
  latitude?: number;
  longitude?: number;
  fixType?: RtkQuality["fixType"];
  satellites?: number;
  hdop?: number;
  altitudeMeters?: number;
  correctionAgeSeconds?: number | null;
  nmeaQualityCode?: number;
}

export function parseNmeaSentence(sentence: string): ParsedNmeaSample | null {
  const trimmed = sentence.trim();
  if (!trimmed.startsWith("$")) return null;

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
      hdop: parseOptionalNumber(fields[16]) ?? undefined,
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
