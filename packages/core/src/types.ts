import type { ProjectSettings, ReferenceOverlaySchema } from "./settings";

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

export interface PivotAngleRange {
  startAngleDegrees: number;
  stopAngleDegrees: number;
  direction: "clockwise" | "counterclockwise";
}

export interface MachineCatalogSelection {
  catalogId: string;
  manufacturer: string;
  model: string;
  sourceUrl: string;
  sourceAccessedAt: string;
  advisoryOnly: true;
}

export interface PivotMachine {
  id: string;
  name: string;
  spanLengthsMeters: number[];
  overhangMeters: number;
  endGunThrowMeters: number;
  endGunAngleRanges?: PivotAngleRange[];
  towerClearanceBufferMeters: number;
  machineClearanceBufferMeters: number;
  sweep: PivotSweep;
  catalogSelection?: MachineCatalogSelection;
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

export type ProjectMapFeatureKind =
  | "pump_location"
  | "underground_pipeline"
  | "power_pole"
  | "power_line"
  | "tree"
  | "road"
  | "access_lane"
  | "ditch"
  | "canal"
  | "fence"
  | "end_gun_mark"
  | "end_gun_arc"
  | "corner_swing_limit";

export type ProjectMapFeatureGeometry =
  | { type: "Point"; point: XY }
  | { type: "LineString"; vertices: XY[] }
  | { type: "Polygon"; vertices: XY[] }
  | { type: "Circle"; center: XY; radiusMeters: number };

export interface ProjectMapFeature {
  id: string;
  name: string;
  kind: ProjectMapFeatureKind;
  geometry: ProjectMapFeatureGeometry;
  confidence: SourceConfidence;
  notes?: string;
  properties?: Record<string, string | number | boolean | null>;
}

export type ProjectMapFeatureWgs84Geometry =
  | { type: "Point"; point: LonLat }
  | { type: "LineString"; vertices: LonLat[] }
  | { type: "Polygon"; vertices: LonLat[] }
  | { type: "Circle"; center: LonLat; radiusMeters: number };

export interface ProjectWgs84Companion {
  status: "projected" | "unavailable";
  source: "derived_from_project_xy";
  coordinateSystem: "decimal_degrees";
  projectCrs: string;
  error?: string;
  fieldBoundary?: LonLat[];
  pivotCenter?: LonLat;
  waterSource?: LonLat;
  powerSource?: LonLat;
  obstacles?: Array<{ id: string; polygon: LonLat[] }>;
  mapFeatures?: Array<{ id: string; geometry: ProjectMapFeatureWgs84Geometry }>;
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
  mapFeatures?: ProjectMapFeature[];
  wgs84Companion?: ProjectWgs84Companion;
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
  noSprayConflictCount: number;
  hardMechanicalConflictCount: number;
  towerTrackConflictCount: number;
}

export interface LayoutMechanicalConflict {
  obstacleId: string;
  obstacleKind: ObstacleZone["kind"];
  obstacleName: string;
  conflictType: "machine_path" | "tower_track";
  areaSquareMeters: number;
}

export interface LayoutResult {
  metrics: LayoutMetrics;
  baseCoverage: MultiPolygonXY;
  endGunCoverage: MultiPolygonXY;
  allowedCoverage: MultiPolygonXY;
  outsideFieldCoverage: MultiPolygonXY;
  obstacles: MultiPolygonXY;
  mechanicalConflicts: LayoutMechanicalConflict[];
  towers: TowerPoint[];
  warnings: string[];
}

export type RingXY = XY[];
export type PolygonXY = RingXY[];
export type MultiPolygonXY = PolygonXY[];

export type MapPackageType = "pmtiles" | "mbtiles" | "raster_tiles";
export type TileContentType = "raster" | "vector";
export type TileScheme = "xyz" | "tms";
export type TilePackageInstallStatus = "metadata_only" | "available" | "missing" | "indexed";

export interface VectorOverlayMetadata {
  schema: ReferenceOverlaySchema;
  sourceLayers: {
    roads: string;
    roadLabels: string;
    borders: string;
    places: string;
  };
}

export interface MapPackageManifest {
  id: string;
  name: string;
  packageType: MapPackageType;
  tileContentType: TileContentType;
  uri: string;
  minZoom: number;
  maxZoom: number;
  tileScheme: TileScheme;
  boundsWgs84: {
    minLongitude: number;
    minLatitude: number;
    maxLongitude: number;
    maxLatitude: number;
  };
  tileJsonUrl?: string;
  tileUrlTemplates?: string[];
  vectorOverlay?: VectorOverlayMetadata;
  checksumSha256?: string;
  installStatus?: TilePackageInstallStatus;
  attribution: string;
  licenseText: string;
  bytes?: number;
  importedAt: string;
}
