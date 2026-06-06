import { projectXyToLonLat, type LayoutResult, type PivotProject, type XY } from "@cplayout/core";
import type { AdvisoryFieldPivotPlan } from "@cplayout/geometry";

type GeoJsonFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
};

type GeoJsonGeometry =
  | { type: "MultiPolygon"; coordinates: [number, number][][][] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Point"; coordinates: [number, number] };

export function projectLayoutToWgs84FeatureCollection(
  project: PivotProject,
  result: LayoutResult,
  draftVertices: XY[] = [],
  advisoryFieldPivotPlan?: AdvisoryFieldPivotPlan,
): { type: "FeatureCollection"; features: GeoJsonFeature[] } {
  const advisoryFieldPivotFeatures = advisoryFieldPivotPlan && advisoryFieldPivotPlan.selectedMachineCount > 0
    ? [
      polygonFeature(project, "advisory_generated_field_pivot_coverage", advisoryFieldPivotPlan.modeledCoverageUnion, {
        advisoryOnly: true,
        canonicalGeometryMutation: false,
        qualifiedReviewRequired: true,
        requestedMachineCount: advisoryFieldPivotPlan.requestedMachineCount,
        selectedMachineCount: advisoryFieldPivotPlan.selectedMachineCount,
        fieldCoveragePercent: advisoryFieldPivotPlan.fieldCoveragePercent,
        modeledIrrigatedUnionAcres: advisoryFieldPivotPlan.modeledIrrigatedUnionAcres,
      }),
      ...advisoryFieldPivotPlan.candidates.map((candidate) => pointFeature(project, "advisory_generated_field_pivot_center", candidate.pivotCenter, {
        id: candidate.id,
        sequence: candidate.sequence,
        advisoryOnly: true,
        canonicalGeometryMutation: false,
        qualifiedReviewRequired: true,
        incrementalIrrigatedAcres: candidate.incrementalIrrigatedAcres,
        cumulativeFieldCoveragePercent: candidate.cumulativeFieldCoveragePercent,
        minimumRequiredSeparationMeters: candidate.minimumRequiredSeparationMeters,
      })),
    ]
    : [];
  return {
    type: "FeatureCollection",
    features: [
      polygonFeature(project, "field_boundary", [[project.fieldBoundary]], { name: "Field boundary" }),
      polygonFeature(project, "allowed_coverage", result.allowedCoverage, { ...result.metrics }),
      polygonFeature(project, "outside_field_coverage", result.outsideFieldCoverage, { acres: result.metrics.outsideFieldAcres }),
      polygonFeature(project, "end_gun_coverage", result.endGunCoverage, { acres: result.metrics.endGunAcres }),
      ...advisoryFieldPivotFeatures,
      polygonFeature(project, "obstacle", result.obstacles, { count: project.obstacles.length }),
      pointFeature(project, "pivot_center", project.pivotCenter, { label: "Pivot" }),
      pointFeature(project, "water_source", project.waterSource, { label: "Water" }),
      pointFeature(project, "power_source", project.powerSource, { label: "Power" }),
      ...result.towers.map((tower) => pointFeature(project, "tower_location", tower.point, {
        towerIndex: tower.towerIndex,
        radiusMeters: tower.radiusMeters,
      })),
      ...(project.mapFeatures ?? []).map((feature) => {
        const properties = {
          id: feature.id,
          name: feature.name,
          kind: feature.kind,
          confidence: feature.confidence,
          notes: feature.notes ?? "",
        };
        if (feature.geometry.type === "Point") return pointFeature(project, "map_feature", feature.geometry.point, properties);
        if (feature.geometry.type === "LineString") return lineFeature(project, "map_feature", feature.geometry.vertices, properties);
        if (feature.geometry.type === "Polygon") return polygonFeature(project, "map_feature", [[feature.geometry.vertices]], properties);
        return polygonFeature(project, "map_feature", [[circleVertices(feature.geometry.center, feature.geometry.radiusMeters)]], {
          ...properties,
          mapFeatureGeometry: "Circle",
          radiusMeters: feature.geometry.radiusMeters,
        });
      }),
      ...(draftVertices.length === 1 ? [pointFeature(project, "draft_vertices", draftVertices[0], { count: 1 })] : []),
      ...(draftVertices.length >= 2 ? [lineFeature(project, "draft_vertices", draftVertices, { count: draftVertices.length })] : []),
    ],
  };
}

export function projectWgs84Bounds(project: PivotProject): [number, number, number, number] {
  const coordinates = [
    ...project.fieldBoundary,
    project.pivotCenter,
    project.waterSource,
    project.powerSource,
    ...project.obstacles.flatMap((obstacle) => obstacle.polygon),
    ...(project.mapFeatures ?? []).flatMap((feature) => {
      if (feature.geometry.type === "Point") return [feature.geometry.point];
      if (feature.geometry.type === "Circle") return [feature.geometry.center, ...circleVertices(feature.geometry.center, feature.geometry.radiusMeters, 16)];
      return feature.geometry.vertices;
    }),
  ].map((point) => projectXyToLonLat(point, project.projectCrs));
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

export function projectWgs84Center(project: PivotProject): [number, number] {
  const center = projectXyToLonLat(project.pivotCenter, project.projectCrs);
  return [center.longitude, center.latitude];
}

function polygonFeature(
  project: PivotProject,
  layerType: string,
  multiPolygon: XY[][][],
  properties: Record<string, unknown>,
): GeoJsonFeature {
  return {
    type: "Feature",
    properties: { layerType, ...properties },
    geometry: {
      type: "MultiPolygon",
      coordinates: multiPolygon.map((polygon) => polygon.map((ring) => closedRing(ring).map((point) => lonLatTuple(project, point)))),
    },
  };
}

function lineFeature(project: PivotProject, layerType: string, vertices: XY[], properties: Record<string, unknown>): GeoJsonFeature {
  return {
    type: "Feature",
    properties: { layerType, ...properties },
    geometry: {
      type: "LineString",
      coordinates: vertices.map((point) => lonLatTuple(project, point)),
    },
  };
}

function pointFeature(project: PivotProject, layerType: string, point: XY, properties: Record<string, unknown>): GeoJsonFeature {
  return {
    type: "Feature",
    properties: { layerType, ...properties },
    geometry: {
      type: "Point",
      coordinates: lonLatTuple(project, point),
    },
  };
}

function lonLatTuple(project: PivotProject, point: XY): [number, number] {
  const coordinate = projectXyToLonLat(point, project.projectCrs);
  return [coordinate.longitude, coordinate.latitude];
}

function closedRing(ring: XY[]): XY[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first.x === last.x && first.y === last.y ? ring : [...ring, first];
}

function circleVertices(center: XY, radiusMeters: number, segments = 72): XY[] {
  return Array.from({ length: segments }, (_value, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return {
      x: center.x + Math.cos(angle) * radiusMeters,
      y: center.y + Math.sin(angle) * radiusMeters,
    };
  });
}
