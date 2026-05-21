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
