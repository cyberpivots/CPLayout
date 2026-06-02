import type { ProjectMapFeature, ProjectMapFeatureKind, XY } from "@cplayout/core";

export type UtilityFeatureGeometry = ProjectMapFeature["geometry"]["type"];

export interface UtilityFeatureOption {
  kind: ProjectMapFeatureKind;
  label: string;
  geometry: UtilityFeatureGeometry;
}

export const UTILITY_FEATURE_OPTIONS: UtilityFeatureOption[] = [
  { kind: "underground_pipeline", label: "Pipe", geometry: "LineString" },
  { kind: "power_line", label: "Power", geometry: "LineString" },
  { kind: "fence", label: "Fence", geometry: "LineString" },
  { kind: "access_lane", label: "Lane", geometry: "LineString" },
  { kind: "road", label: "Road", geometry: "LineString" },
  { kind: "ditch", label: "Ditch", geometry: "LineString" },
  { kind: "canal", label: "Canal", geometry: "LineString" },
  { kind: "corner_swing_limit", label: "Corner", geometry: "Polygon" },
  { kind: "end_gun_arc", label: "End gun", geometry: "Circle" },
  { kind: "pump_location", label: "Pump", geometry: "Point" },
  { kind: "power_pole", label: "Pole", geometry: "Point" },
  { kind: "tree", label: "Tree", geometry: "Point" },
];

export function featureOptionForKind(kind: ProjectMapFeatureKind): UtilityFeatureOption {
  return UTILITY_FEATURE_OPTIONS.find((option) => option.kind === kind) ?? UTILITY_FEATURE_OPTIONS[0];
}

export function featureDraftMinimumVertices(geometry: UtilityFeatureGeometry): number {
  if (geometry === "Point") return 0;
  if (geometry === "LineString" || geometry === "Circle") return 2;
  return 3;
}

export function defaultMapFeatureName(kind: ProjectMapFeatureKind, geometry: UtilityFeatureGeometry, vertexCount: number): string {
  if (geometry === "Circle") return `${kind.replaceAll("_", " ")} circle`;
  if (geometry === "Polygon") return `${kind.replaceAll("_", " ")} polygon`;
  return `${kind.replaceAll("_", " ")} ${vertexCount > 1 ? "line" : "point"}`;
}

export function draftVerticesToFeatureGeometry(
  geometry: UtilityFeatureGeometry,
  vertices: XY[],
): ProjectMapFeature["geometry"] {
  if (geometry === "LineString") return { type: "LineString", vertices };
  if (geometry === "Polygon") return { type: "Polygon", vertices };
  if (geometry === "Circle") {
    const center = vertices[0];
    const edge = vertices[1];
    if (!center || !edge) throw new Error("Circle map features need center and radius points.");
    return {
      type: "Circle",
      center,
      radiusMeters: Math.hypot(edge.x - center.x, edge.y - center.y),
    };
  }
  const point = vertices[0];
  if (!point) throw new Error("Point map features need one point.");
  return { type: "Point", point };
}
