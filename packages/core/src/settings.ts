import { z } from "zod";

import { COORDINATE_FORMATS, type CoordinateDisplayFormat } from "./coordinates";
import type { UnitSystem } from "./types";

export const MAP_STYLES = ["field_light", "high_contrast", "imagery_package", "topographic"] as const;
export type MapStyle = typeof MAP_STYLES[number];

export const OFFLINE_PACKAGE_TYPES = ["pmtiles", "mbtiles", "raster_tiles"] as const;
export type OfflinePackageType = typeof OFFLINE_PACKAGE_TYPES[number];

export const GPS_FIX_ORDER = ["invalid", "autonomous", "dgps", "rtk_float", "rtk_fixed", "ppp"] as const;
export type MinimumGpsFixType = typeof GPS_FIX_ORDER[number];

export interface DrawingSettings {
  vertexSnapToleranceMeters: number;
  featureSnapToleranceMeters: number;
  selectionTolerancePixels: number;
  panStepMeters: number;
  zoomStepFactor: number;
}

export interface GpsQualityThresholds {
  minimumFixType: MinimumGpsFixType;
  minSatellites: number;
  maxHdop: number;
  maxHorizontalAccuracyMeters: number;
  maxCorrectionAgeSeconds: number;
}

export interface OfflineMapPreferences {
  preferredPackageType: OfflinePackageType;
  requireAttribution: true;
  allowNetworkTiles: false;
  packageDirectory: string;
}

export interface AppSettings {
  unitSystem: UnitSystem;
  coordinateDisplayFormat: CoordinateDisplayFormat;
  defaultZoomLevel: number;
  mapStyle: MapStyle;
  drawing: DrawingSettings;
  gpsQuality: GpsQualityThresholds;
  offlineMaps: OfflineMapPreferences;
}

export type ProjectSettings = Omit<AppSettings, "offlineMaps"> & {
  offlineMaps: Omit<OfflineMapPreferences, "packageDirectory">;
};

export type DeepPartialSettings = {
  [K in keyof AppSettings]?: AppSettings[K] extends object ? Partial<AppSettings[K]> : AppSettings[K];
};

const UnitSystemSchema = z.enum(["metric", "us_survey_feet"]);
const CoordinateDisplayFormatSchema = z.enum(COORDINATE_FORMATS);
const MapStyleSchema = z.enum(MAP_STYLES);
const OfflinePackageTypeSchema = z.enum(OFFLINE_PACKAGE_TYPES);
const MinimumGpsFixTypeSchema = z.enum(GPS_FIX_ORDER);

export const DrawingSettingsSchema = z.object({
  vertexSnapToleranceMeters: z.number().min(0.01).max(50),
  featureSnapToleranceMeters: z.number().min(0.01).max(100),
  selectionTolerancePixels: z.number().min(4).max(80),
  panStepMeters: z.number().min(1).max(5000),
  zoomStepFactor: z.number().min(1.05).max(4),
});

export const GpsQualityThresholdsSchema = z.object({
  minimumFixType: MinimumGpsFixTypeSchema,
  minSatellites: z.number().int().min(0).max(80),
  maxHdop: z.number().min(0.1).max(99),
  maxHorizontalAccuracyMeters: z.number().min(0.001).max(100),
  maxCorrectionAgeSeconds: z.number().min(0).max(3600),
});

export const OfflineMapPreferencesSchema = z.object({
  preferredPackageType: OfflinePackageTypeSchema,
  requireAttribution: z.literal(true),
  allowNetworkTiles: z.literal(false),
  packageDirectory: z.string().min(1),
});

export const AppSettingsSchema = z.object({
  unitSystem: UnitSystemSchema,
  coordinateDisplayFormat: CoordinateDisplayFormatSchema,
  defaultZoomLevel: z.number().min(0.25).max(12),
  mapStyle: MapStyleSchema,
  drawing: DrawingSettingsSchema,
  gpsQuality: GpsQualityThresholdsSchema,
  offlineMaps: OfflineMapPreferencesSchema,
});

export const ProjectSettingsSchema = AppSettingsSchema.omit({ offlineMaps: true }).extend({
  offlineMaps: OfflineMapPreferencesSchema.omit({ packageDirectory: true }),
});

export function defaultAppSettings(): AppSettings {
  return {
    unitSystem: "us_survey_feet",
    coordinateDisplayFormat: "decimal_degrees",
    defaultZoomLevel: 1,
    mapStyle: "field_light",
    drawing: {
      vertexSnapToleranceMeters: 1,
      featureSnapToleranceMeters: 3,
      selectionTolerancePixels: 18,
      panStepMeters: 120,
      zoomStepFactor: 1.35,
    },
    gpsQuality: {
      minimumFixType: "rtk_fixed",
      minSatellites: 12,
      maxHdop: 1.2,
      maxHorizontalAccuracyMeters: 0.05,
      maxCorrectionAgeSeconds: 3,
    },
    offlineMaps: {
      preferredPackageType: "pmtiles",
      requireAttribution: true,
      allowNetworkTiles: false,
      packageDirectory: "offline-map-packages",
    },
  };
}

export function defaultProjectSettings(): ProjectSettings {
  return projectSettingsFromApp(defaultAppSettings());
}

export function mergeAppSettings(settings?: DeepPartialSettings | ProjectSettings): AppSettings {
  const defaults = defaultAppSettings();
  return AppSettingsSchema.parse(deepMerge(defaults, settings ?? {}));
}

export function parseAppSettings(value: unknown): AppSettings {
  return AppSettingsSchema.parse(value);
}

export function projectSettingsFromApp(settings: AppSettings): ProjectSettings {
  return ProjectSettingsSchema.parse({
    unitSystem: settings.unitSystem,
    coordinateDisplayFormat: settings.coordinateDisplayFormat,
    defaultZoomLevel: settings.defaultZoomLevel,
    mapStyle: settings.mapStyle,
    drawing: settings.drawing,
    gpsQuality: settings.gpsQuality,
    offlineMaps: {
      preferredPackageType: settings.offlineMaps.preferredPackageType,
      requireAttribution: true,
      allowNetworkTiles: false,
    },
  });
}

export function gpsFixMeetsThreshold(fixType: MinimumGpsFixType | "unknown", minimumFixType: MinimumGpsFixType): boolean {
  if (fixType === "unknown") return false;
  return GPS_FIX_ORDER.indexOf(fixType) >= GPS_FIX_ORDER.indexOf(minimumFixType);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) return (override === undefined ? base : override) as T;
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    output[key] = isRecord(value) && isRecord(output[key])
      ? deepMerge(output[key], value)
      : value;
  }
  return output as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
