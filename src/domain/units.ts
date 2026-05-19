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

export function assertProjectedCrs(crs: string): void {
  const normalized = crs.trim().toUpperCase();
  if (normalized === "EPSG:4326" || normalized.includes("WGS84") || normalized.includes("WGS 84")) {
    throw new Error("Projected CRS required for acreage, radius, buffer, and clearance calculations.");
  }
}
