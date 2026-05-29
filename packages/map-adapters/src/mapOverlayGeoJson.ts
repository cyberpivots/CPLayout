import { projectXyToLonLat, type LayoutResult, type PivotProject, type XY } from "@cplayout/core";

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
): { type: "FeatureCollection"; features: GeoJsonFeature[] } {
  return {
    type: "FeatureCollection",
    features: [
      polygonFeature(project, "field_boundary", [[project.fieldBoundary]], { name: "Field boundary" }),
      polygonFeature(project, "allowed_coverage", result.allowedCoverage, { ...result.metrics }),
      polygonFeature(project, "outside_field_coverage", result.outsideFieldCoverage, { acres: result.metrics.outsideFieldAcres }),
      polygonFeature(project, "end_gun_coverage", result.endGunCoverage, { acres: result.metrics.endGunAcres }),
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
        return feature.geometry.type === "Point"
          ? pointFeature(project, "map_feature", feature.geometry.point, properties)
          : lineFeature(project, "map_feature", feature.geometry.vertices, properties);
      }),
      ...(draftVertices.length > 0 ? [lineFeature(project, "draft_vertices", draftVertices, { count: draftVertices.length })] : []),
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
    ...(project.mapFeatures ?? []).flatMap((feature) => feature.geometry.type === "Point" ? [feature.geometry.point] : feature.geometry.vertices),
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
