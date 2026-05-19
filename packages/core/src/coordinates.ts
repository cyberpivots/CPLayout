import proj4 from "proj4";

import type { LonLat, XY } from "./types";
import { assertProjectedCrs } from "./units";

export const COORDINATE_FORMATS = [
  "decimal_degrees",
  "degrees_decimal_minutes",
  "degrees_minutes_seconds",
  "projected_local",
] as const;

export type CoordinateDisplayFormat = typeof COORDINATE_FORMATS[number];

export const COORDINATE_FORMAT_LABELS: Record<CoordinateDisplayFormat, string> = {
  decimal_degrees: "Decimal degrees",
  degrees_decimal_minutes: "Deg decimal min",
  degrees_minutes_seconds: "Deg min sec",
  projected_local: "Projected / local",
};

export interface CanonicalCoordinate {
  projected: XY;
  projectCrs: string;
  wgs84?: LonLat;
}

export type CoordinateParseResult =
  | { ok: true; coordinate: CanonicalCoordinate }
  | { ok: false; error: string };

interface AngularParts {
  degrees: number;
  minutes: number;
  seconds: number;
  hemisphere?: "N" | "S" | "E" | "W";
}

export function parseCoordinateInput(input: string, format: CoordinateDisplayFormat, projectCrs: string): CoordinateParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a coordinate before applying it." };
  }

  if (format === "projected_local") {
    const numbers = extractNumbers(trimmed);
    if (numbers.length < 2) {
      return { ok: false, error: "Projected coordinates need X and Y values." };
    }
    return {
      ok: true,
      coordinate: {
        projected: { x: numbers[0], y: numbers[1] },
        projectCrs,
      },
    };
  }

  const wgs84 = parseWgs84Input(trimmed, format);
  if (!wgs84.ok) return wgs84;

  try {
    return {
      ok: true,
      coordinate: {
        projected: projectLonLatToXy(wgs84.coordinate, projectCrs),
        projectCrs,
        wgs84: wgs84.coordinate,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not project WGS84 coordinate into the project CRS.",
    };
  }
}

export function parseWgs84Input(
  input: string,
  format: Exclude<CoordinateDisplayFormat, "projected_local">,
): { ok: true; coordinate: LonLat } | { ok: false; error: string } {
  if (format === "decimal_degrees") {
    const numbers = extractNumbers(input);
    if (numbers.length < 2) {
      return { ok: false, error: "Decimal degrees need latitude and longitude." };
    }
    const latitude = applyHemisphere(numbers[0], input, "latitude");
    const longitude = applyHemisphere(numbers[1], input, "longitude");
    return validateLonLat({ latitude, longitude });
  }

  const latitude = parseAxis(input, "latitude", format);
  const longitude = parseAxis(input, "longitude", format);
  if (latitude && longitude) {
    try {
      return validateLonLat({
        latitude: angularPartsToDecimal(latitude, "latitude"),
        longitude: angularPartsToDecimal(longitude, "longitude"),
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Invalid angular coordinate." };
    }
  }

  const numbers = extractNumbers(input);
  const required = format === "degrees_decimal_minutes" ? 4 : 6;
  if (numbers.length < required) {
    return {
      ok: false,
      error: format === "degrees_decimal_minutes"
        ? "Degrees decimal minutes need latitude degrees/minutes and longitude degrees/minutes."
        : "Degrees minutes seconds need latitude degrees/minutes/seconds and longitude degrees/minutes/seconds.",
    };
  }

  const fallbackLatitude: AngularParts = {
    degrees: numbers[0],
    minutes: numbers[1],
    seconds: format === "degrees_minutes_seconds" ? numbers[2] : 0,
  };
  const fallbackLongitudeOffset = format === "degrees_minutes_seconds" ? 3 : 2;
  const fallbackLongitude: AngularParts = {
    degrees: numbers[fallbackLongitudeOffset],
    minutes: numbers[fallbackLongitudeOffset + 1],
    seconds: format === "degrees_minutes_seconds" ? numbers[fallbackLongitudeOffset + 2] : 0,
  };

  try {
    return validateLonLat({
      latitude: angularPartsToDecimal(fallbackLatitude, "latitude"),
      longitude: angularPartsToDecimal(fallbackLongitude, "longitude"),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid angular coordinate." };
  }
}

export function formatCoordinate(
  coordinate: CanonicalCoordinate,
  format: CoordinateDisplayFormat,
  precision = 6,
): string {
  if (format === "projected_local") {
    return `X ${coordinate.projected.x.toFixed(2)}, Y ${coordinate.projected.y.toFixed(2)} (${coordinate.projectCrs})`;
  }

  const wgs84 = coordinate.wgs84 ?? projectXyToLonLat(coordinate.projected, coordinate.projectCrs);
  if (format === "decimal_degrees") {
    return `${wgs84.latitude.toFixed(precision)}, ${wgs84.longitude.toFixed(precision)}`;
  }
  if (format === "degrees_decimal_minutes") {
    return `${formatDdm(wgs84.latitude, "latitude")} ${formatDdm(wgs84.longitude, "longitude")}`;
  }
  return `${formatDms(wgs84.latitude, "latitude")} ${formatDms(wgs84.longitude, "longitude")}`;
}

export function projectLonLatToXy(coordinate: LonLat, projectCrs: string): XY {
  assertProjectedCrs(projectCrs);
  const [x, y] = proj4("EPSG:4326", projectCrs, [coordinate.longitude, coordinate.latitude]);
  assertFinitePair(x, y, "Projection returned invalid coordinates.");
  return { x, y };
}

export function projectXyToLonLat(point: XY, projectCrs: string): LonLat {
  assertProjectedCrs(projectCrs);
  const [longitude, latitude] = proj4(projectCrs, "EPSG:4326", [point.x, point.y]);
  assertFinitePair(longitude, latitude, "Inverse projection returned invalid coordinates.");
  return { longitude, latitude };
}

export function coordinateExample(format: CoordinateDisplayFormat): string {
  switch (format) {
    case "decimal_degrees":
      return "40.7102367, -104.9878583";
    case "degrees_decimal_minutes":
      return "40 42.6142 N, 104 59.2715 W";
    case "degrees_minutes_seconds":
      return "40 42 36.852 N, 104 59 16.290 W";
    case "projected_local":
      return "410.00, 360.00";
  }
}

function parseAxis(
  input: string,
  axis: "latitude" | "longitude",
  format: Exclude<CoordinateDisplayFormat, "decimal_degrees" | "projected_local">,
): AngularParts | null {
  const hemispheres = axis === "latitude" ? "NS" : "EW";
  const number = "([+-]?\\d+(?:\\.\\d+)?)";
  const separator = "[^0-9+\\-.NSEW]+";
  const beforeHemisphere = "[^0-9+\\-.NSEW]*";
  const suffix = new RegExp(
    `${number}${separator}${number}(?:${separator}${number})?${beforeHemisphere}([${hemispheres}])\\b`,
    "i",
  );
  const prefix = new RegExp(
    `\\b([${hemispheres}])${beforeHemisphere}${number}${separator}${number}(?:${separator}${number})?`,
    "i",
  );

  const suffixMatch = input.match(suffix);
  if (suffixMatch) {
    return {
      degrees: Number(suffixMatch[1]),
      minutes: Number(suffixMatch[2]),
      seconds: format === "degrees_minutes_seconds" ? Number(suffixMatch[3] ?? 0) : 0,
      hemisphere: suffixMatch[4].toUpperCase() as AngularParts["hemisphere"],
    };
  }

  const prefixMatch = input.match(prefix);
  if (prefixMatch) {
    return {
      degrees: Number(prefixMatch[2]),
      minutes: Number(prefixMatch[3]),
      seconds: format === "degrees_minutes_seconds" ? Number(prefixMatch[4] ?? 0) : 0,
      hemisphere: prefixMatch[1].toUpperCase() as AngularParts["hemisphere"],
    };
  }

  return null;
}

function angularPartsToDecimal(parts: AngularParts, axis: "latitude" | "longitude"): number {
  if (!Number.isFinite(parts.degrees) || !Number.isFinite(parts.minutes) || !Number.isFinite(parts.seconds)) {
    throw new Error("Coordinate contains a non-numeric angle component.");
  }
  if (Math.abs(parts.minutes) >= 60 || parts.minutes < 0) {
    throw new Error("Coordinate minutes must be between 0 and 60.");
  }
  if (Math.abs(parts.seconds) >= 60 || parts.seconds < 0) {
    throw new Error("Coordinate seconds must be between 0 and 60.");
  }

  const signFromHemisphere = parts.hemisphere === "S" || parts.hemisphere === "W" ? -1 : 1;
  const signFromDegree = parts.degrees < 0 ? -1 : 1;
  const sign = parts.hemisphere ? signFromHemisphere : signFromDegree;
  const value = Math.abs(parts.degrees) + parts.minutes / 60 + parts.seconds / 3600;
  const decimal = sign * value;
  const limit = axis === "latitude" ? 90 : 180;
  if (Math.abs(decimal) > limit) {
    throw new Error(`${axis === "latitude" ? "Latitude" : "Longitude"} is outside its valid range.`);
  }
  return decimal;
}

function validateLonLat(coordinate: LonLat): { ok: true; coordinate: LonLat } | { ok: false; error: string } {
  if (!Number.isFinite(coordinate.latitude) || coordinate.latitude < -90 || coordinate.latitude > 90) {
    return { ok: false, error: "Latitude must be between -90 and 90 degrees." };
  }
  if (!Number.isFinite(coordinate.longitude) || coordinate.longitude < -180 || coordinate.longitude > 180) {
    return { ok: false, error: "Longitude must be between -180 and 180 degrees." };
  }
  return { ok: true, coordinate };
}

function applyHemisphere(value: number, input: string, axis: "latitude" | "longitude"): number {
  const positive = axis === "latitude" ? "N" : "E";
  const negative = axis === "latitude" ? "S" : "W";
  if (containsHemisphere(input, negative)) return -Math.abs(value);
  if (containsHemisphere(input, positive)) return Math.abs(value);
  return value;
}

function containsHemisphere(input: string, hemisphere: string): boolean {
  return new RegExp(`(^|[^A-Z])${hemisphere}([^A-Z]|$)`, "i").test(input);
}

function extractNumbers(input: string): number[] {
  return (input.match(/[+-]?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

function formatDdm(value: number, axis: "latitude" | "longitude"): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${degrees}° ${minutes.toFixed(4)}' ${hemisphereFor(value, axis)}`;
}

function formatDms(value: number, axis: "latitude" | "longitude"): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minuteFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minuteFloat);
  const seconds = (minuteFloat - minutes) * 60;
  return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${hemisphereFor(value, axis)}`;
}

function hemisphereFor(value: number, axis: "latitude" | "longitude"): "N" | "S" | "E" | "W" {
  if (axis === "latitude") return value < 0 ? "S" : "N";
  return value < 0 ? "W" : "E";
}

function assertFinitePair(a: number, b: number, message: string): void {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error(message);
  }
}
