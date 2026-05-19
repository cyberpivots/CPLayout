import type { ProjectSettings } from "./settings";

export type UnitSystem = "metric" | "us_survey_feet";

export type SourceConfidence =
  | "rtk_fixed"
  | "rtk_float"
  | "dgps"
  | "autonomous_gps"
  | "imagery_digitized"
  | "imported_cad"
  | "user_estimated"
  | "optimized";

export interface XY {
  x: number;
  y: number;
}

export interface LonLat {
  longitude: number;
  latitude: number;
}

export interface RtkQuality {
  fixType:
    | "invalid"
    | "autonomous"
    | "dgps"
    | "rtk_float"
    | "rtk_fixed"
    | "ppp"
    | "unknown";
  satellites: number | null;
  hdop: number | null;
  vdop: number | null;
  pdop: number | null;
  correctionAgeSeconds: number | null;
  horizontalAccuracyMeters: number | null;
  verticalAccuracyMeters: number | null;
  baseStationId?: string;
  roverId?: string;
  nmeaQualityCode?: number;
}

export interface SurveyPoint {
  id: string;
  label: string;
  role:
    | "boundary"
    | "pivot_center"
    | "water_source"
    | "power_source"
    | "obstacle"
    | "control"
    | "note";
  projected: XY;
  wgs84?: LonLat;
  observedAt: string;
  source: "device_gps" | "external_gnss" | "imported" | "manual";
  confidence: SourceConfidence;
  rtk?: RtkQuality;
  notes?: string;
}

export interface FullCircleSweep {
  mode: "full_circle";
}

export interface PartialCircleSweep {
  mode: "partial_circle";
  startAngleDegrees: number;
  stopAngleDegrees: number;
  direction: "clockwise" | "counterclockwise";
}

export type PivotSweep = FullCircleSweep | PartialCircleSweep;

export interface PivotMachine {
  id: string;
  name: string;
  spanLengthsMeters: number[];
  overhangMeters: number;
  endGunThrowMeters: number;
  towerClearanceBufferMeters: number;
  machineClearanceBufferMeters: number;
  sweep: PivotSweep;
}

export interface ObstacleZone {
  id: string;
  name: string;
  kind: "road" | "ditch" | "fence" | "building" | "canal" | "tree" | "exclusion";
  polygon: XY[];
  bufferMeters: number;
  hardConflict: boolean;
  noSpray: boolean;
  confidence: SourceConfidence;
}

export interface PivotProject {
  id: string;
  name: string;
  projectCrs: string;
  unitSystem: UnitSystem;
  settings?: ProjectSettings;
  fieldBoundary: XY[];
  pivotCenter: XY;
  waterSource: XY;
  powerSource: XY;
  machine: PivotMachine;
  obstacles: ObstacleZone[];
  surveyPoints: SurveyPoint[];
  mapPackages?: MapPackageManifest[];
}

export interface TowerPoint {
  towerIndex: number;
  radiusMeters: number;
  point: XY;
}

export interface LayoutMetrics {
  fieldAcres: number;
  irrigatedAcres: number;
  nonIrrigatedAcres: number;
  coveragePercent: number;
  endGunAcres: number;
  outsideFieldAcres: number;
  obstacleConflictCount: number;
}

export interface LayoutResult {
  metrics: LayoutMetrics;
  baseCoverage: MultiPolygonXY;
  endGunCoverage: MultiPolygonXY;
  allowedCoverage: MultiPolygonXY;
  outsideFieldCoverage: MultiPolygonXY;
  obstacles: MultiPolygonXY;
  towers: TowerPoint[];
  warnings: string[];
}

export type RingXY = XY[];
export type PolygonXY = RingXY[];
export type MultiPolygonXY = PolygonXY[];

export interface MapPackageManifest {
  id: string;
  name: string;
  packageType: "pmtiles" | "mbtiles" | "raster_tiles";
  uri: string;
  minZoom: number;
  maxZoom: number;
  boundsWgs84: {
    minLongitude: number;
    minLatitude: number;
    maxLongitude: number;
    maxLatitude: number;
  };
  attribution: string;
  licenseText: string;
  bytes?: number;
  importedAt: string;
}
