import type { UnitSystem } from "./types";

export const SQUARE_METERS_PER_ACRE = 4046.8564224;
export const SQUARE_METERS_PER_HECTARE = 10000;
export const FEET_PER_METER = 3.280839895;

export function squareMetersToAcres(squareMeters: number): number {
  return squareMeters / SQUARE_METERS_PER_ACRE;
}

export function metersToFeet(meters: number): number {
  return meters * FEET_PER_METER;
}

export function feetToMeters(feet: number): number {
  return feet / FEET_PER_METER;
}

export function formatAcres(acres: number): string {
  return `${acres.toFixed(1)} ac`;
}

export function formatMeters(meters: number): string {
  return `${meters.toFixed(1)} m`;
}

export function formatAreaFromAcres(acres: number, unitSystem: UnitSystem): string {
  if (unitSystem === "metric") {
    return `${((acres * SQUARE_METERS_PER_ACRE) / SQUARE_METERS_PER_HECTARE).toFixed(1)} ha`;
  }
  return formatAcres(acres);
}

export function formatDistance(meters: number, unitSystem: UnitSystem): string {
  if (unitSystem === "metric") return formatMeters(meters);
  return `${metersToFeet(meters).toFixed(1)} ft`;
}

export function formatDistanceInputValue(meters: number, unitSystem: UnitSystem): string {
  if (unitSystem === "metric") return trimFixed(meters, 2);
  return trimFixed(metersToFeet(meters), 2);
}

export function parseDistanceInput(value: string, unitSystem: UnitSystem, label: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (unitSystem === "metric") return parseMetricDistance(trimmed, label);
  return parseUsSurveyDistance(trimmed, label);
}

export function formatFeetInches(meters: number): string {
  const totalInches = Math.round(metersToFeet(meters) * 12);
  const sign = totalInches < 0 ? "-" : "";
  const absoluteInches = Math.abs(totalInches);
  const feet = Math.floor(absoluteInches / 12);
  const inches = absoluteInches % 12;
  return `${sign}${feet}' ${inches}"`;
}

function parseMetricDistance(value: string, label: string): number {
  const normalized = value.toLowerCase().replace(/\s*m(?:eters?)?$/, "").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite metric distance.`);
  return parsed;
}

function parseUsSurveyDistance(value: string, label: string): number {
  const feetInches = /^\s*([+-]?\d+(?:\.\d+)?)\s*(?:'|ft|feet)?(?:\s+(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?\s*$/i.exec(value);
  if (!feetInches) throw new Error(`${label} must be feet or feet/inches.`);
  const feet = Number(feetInches[1]);
  const inches = feetInches[2] === undefined ? 0 : Number(feetInches[2]);
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) throw new Error(`${label} must be a finite feet/inches distance.`);
  if (inches < 0 || inches >= 12) throw new Error(`${label} inches must be between 0 and 12.`);
  const sign = feet < 0 ? -1 : 1;
  return feetToMeters(feet + sign * (inches / 12));
}

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function normalizeCrsName(crs: string): string {
  return crs.trim().toUpperCase().replace(/\s+/g, "");
}

export function isSupportedProjectedCrs(crs: string): boolean {
  const normalized = normalizeCrsName(crs);
  if (normalized === "EPSG:3857" || normalized === "EPSG:900913") return true;
  if (normalized === "LOCAL" || normalized.startsWith("LOCAL:")) return true;

  const epsg = /^EPSG:(\d+)$/.exec(normalized);
  if (!epsg) return false;
  const code = Number(epsg[1]);
  const utmZone = code % 100;
  return (
    ((code >= 32601 && code <= 32660)
      || (code >= 32701 && code <= 32760)
      || (code >= 26901 && code <= 26960)
      || (code >= 26701 && code <= 26760))
    && utmZone >= 1
    && utmZone <= 60
  );
}

export function assertProjectedCrs(crs: string): void {
  const normalized = normalizeCrsName(crs);
  const epsg = /^EPSG:(\d+)$/.exec(normalized);
  const epsgCode = epsg ? Number(epsg[1]) : null;
  if (
    normalized === "EPSG:4326"
    || normalized === "CRS:84"
    || normalized === "OGC:CRS84"
    || normalized.includes("WGS84")
    || normalized.includes("+PROJ=LONGLAT")
    || normalized.includes("LONGITUDE")
    || normalized.includes("LATITUDE")
    || normalized.includes("GEOGCS")
    || normalized.includes("GEOGRAPHIC")
    || (epsgCode !== null && epsgCode >= 4000 && epsgCode < 5000)
  ) {
    throw new Error("Projected CRS required for acreage, radius, buffer, and clearance calculations.");
  }
  if (!isSupportedProjectedCrs(normalized)) {
    throw new Error("Supported projected CRS required. Use a supported UTM/Web Mercator EPSG code or an explicit LOCAL CRS.");
  }
}
