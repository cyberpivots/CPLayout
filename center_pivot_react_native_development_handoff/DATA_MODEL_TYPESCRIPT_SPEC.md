# Data Model TypeScript Spec

## Interfaces

```ts
export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectCrs: string;
  unitSystem: 'metric' | 'us_survey_feet';
  sourceJsonVersion: string;
}
```

```ts
export interface RtkQuality {
  fixType: 'invalid' | 'autonomous' | 'dgps' | 'rtk_float' | 'rtk_fixed' | 'ppp' | 'unknown';
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
```

```ts
export interface SurveyPoint {
  id: string;
  role: 'boundary' | 'pivot_center' | 'water_source' | 'power_source' | 'obstacle' | 'control' | 'note';
  wgs84: { longitude: number; latitude: number; ellipsoidalHeightMeters?: number };
  projected?: { x: number; y: number; z?: number; crs: string };
  observedAt: string;
  source: 'device_gps' | 'external_gnss' | 'imported' | 'manual';
  rtk?: RtkQuality;
  notes?: string;
}
```

```ts
export interface PivotMachine {
  id: string;
  name: string;
  spanLengthsMeters: number[];
  overhangMeters: number;
  endGunThrowMeters: number;
  towerClearanceBufferMeters: number;
  machineClearanceBufferMeters: number;
  sweep: FullCircleSweep | PartialCircleSweep;
}
```

```ts
export interface FullCircleSweep { mode: 'full_circle'; }
export interface PartialCircleSweep {
  mode: 'partial_circle';
  startAngleDegrees: number;
  stopAngleDegrees: number;
  direction: 'clockwise' | 'counterclockwise';
  endGunOnRanges?: Array<{ startAngleDegrees: number; stopAngleDegrees: number }>;
}
```

```ts
export interface LayoutScenario {
  id: string;
  machineId: string;
  centerPointId?: string;
  centerProjected: { x: number; y: number; crs: string };
  metrics: {
    fieldAcres: number;
    irrigatedAcres: number;
    nonIrrigatedAcres: number;
    coveragePercent: number;
    endGunAcres: number;
    obstacleConflictCount: number;
    hardBoundaryConflictCount: number;
    score: number;
  };
  layers: GeoJSON.FeatureCollection[];
  warnings: string[];
}
```

## Project File Schema

```ts
export interface CenterPivotProject {
  schemaVersion: string;
  metadata: ProjectMetadata;
  machines: PivotMachine[];
  surveyPoints: SurveyPoint[];
  layers: Record<string, GeoJsonLayer>;
  scenarios: LayoutScenario[];
  mapPackages: MapPackageManifest[];
  validationLog: ValidationMessage[];
}
```

## GeoJSON Structures

- Field boundary and coverage layers use Polygon/MultiPolygon.
- Survey points and tower locations use Point features.
- Tracks and tower paths can use LineString plus optional buffered Polygon.
- Every feature must include `sourceConfidence`, `sourceLayerId`, and CRS metadata or a project-level CRS reference.

## Export Formats

- Project ZIP: canonical exchange package.
- GeoJSON: geometry exchange.
- CSV: survey points and scenario metrics.
- Report JSON: machine-readable metrics and warnings.
