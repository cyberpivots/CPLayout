import type { Feature, FeatureCollection, Geometry, GeometryCollection, LineString, Point, Polygon, Position } from "geojson";
import { toKML } from "@placemarkio/tokml";
import { kml as kmlToGeoJson } from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";

import { projectLonLatToXy, projectXyToLonLat } from "./coordinates";
import { PivotProjectSchema } from "./projectDocument";
import type { LayoutResult, ObstacleZone, PivotProject, SourceConfidence, SurveyPoint, XY } from "./types";

const OBSTACLE_KINDS = ["road", "ditch", "fence", "building", "canal", "tree", "exclusion"] as const;
const POINT_ROLES = ["boundary", "pivot_center", "water_source", "power_source", "obstacle", "control", "note"] as const;
const CONFIDENCES = ["rtk_fixed", "rtk_float", "dgps", "autonomous_gps", "imagery_digitized", "imported_cad", "user_estimated", "optimized"] as const;

export interface GoogleEarthKmlImportResult {
  project: PivotProject;
  importedBoundary: boolean;
  importedObstacleCount: number;
  importedSurveyPointCount: number;
  skippedFeatureCount: number;
  warnings: string[];
}

export interface GoogleEarthKmlExportResult {
  kml: string;
  exportedFeatureCount: number;
  warnings: string[];
}

export interface GoogleEarthKmlImportOptions {
  observedAt?: string;
}

interface PolygonCandidate {
  ring: XY[];
  name: string;
  properties: Record<string, unknown>;
  holeCount: number;
  source: "polygon" | "closed_linestring";
}

interface PointCandidate {
  projected: XY;
  wgs84: { longitude: number; latitude: number };
  name: string;
  properties: Record<string, unknown>;
}

export function importGoogleEarthKmlToProject(
  project: PivotProject,
  kmlText: string,
  options: GoogleEarthKmlImportOptions = {},
): GoogleEarthKmlImportResult {
  const geoJson = parseGoogleEarthKml(kmlText);
  const warnings: string[] = [];
  const polygonCandidates: PolygonCandidate[] = [];
  const pointCandidates: PointCandidate[] = [];
  let skippedFeatureCount = 0;

  geoJson.features.forEach((feature, featureIndex) => {
    const properties = featureProperties(feature);
    const name = readStringProperty(properties, ["name", "label"]) ?? `KML feature ${featureIndex + 1}`;
    const extracted = extractCandidatesFromGeometry(feature.geometry, properties, name, project.projectCrs, warnings);
    polygonCandidates.push(...extracted.polygons);
    pointCandidates.push(...extracted.points);
    skippedFeatureCount += extracted.skipped;
  });

  if (polygonCandidates.length === 0 && pointCandidates.length === 0) {
    throw new Error("KML/KMZ import did not contain supported Polygon, closed LineString, or Point placemarks.");
  }

  let fieldBoundary: XY[] | null = null;
  const obstacleCandidates: PolygonCandidate[] = [];
  for (const candidate of polygonCandidates) {
    if (isBoundaryCandidate(candidate.properties, candidate.name)) {
      if (fieldBoundary) {
        skippedFeatureCount += 1;
        warnings.push(`Skipped duplicate boundary placemark "${candidate.name}".`);
      } else {
        fieldBoundary = candidate.ring;
      }
    } else {
      obstacleCandidates.push(candidate);
    }
  }

  if (!fieldBoundary && polygonCandidates.length > 0) {
    const [first, ...remaining] = polygonCandidates;
    fieldBoundary = first.ring;
    obstacleCandidates.length = 0;
    obstacleCandidates.push(...remaining);
    warnings.push(`No explicit field_boundary metadata found; imported "${first.name}" as the field boundary.`);
  }

  const existingObstacleIds = new Set(project.obstacles.map((obstacle) => obstacle.id));
  const obstacles = obstacleCandidates.map((candidate, index): ObstacleZone => {
    const kind = obstacleKindFromProperties(candidate.properties, candidate.name);
    const id = uniqueId(
      existingObstacleIds,
      readStringProperty(candidate.properties, ["id", "@id"]) ?? `${kind}-kml-${project.obstacles.length + index + 1}`,
    );
    if (candidate.holeCount > 0) {
      warnings.push(`Ignored ${candidate.holeCount} inner ring${candidate.holeCount === 1 ? "" : "s"} in "${candidate.name}".`);
    }
    if (candidate.source === "closed_linestring") {
      warnings.push(`Imported closed LineString "${candidate.name}" as a polygon ring.`);
    }
    return {
      id,
      name: candidate.name,
      kind,
      polygon: candidate.ring,
      bufferMeters: finiteNumber(readProperty(candidate.properties, ["bufferMeters", "buffer_meters"]), 0),
      hardConflict: booleanOrDefault(readProperty(candidate.properties, ["hardConflict", "hard_conflict"]), true),
      noSpray: booleanOrDefault(readProperty(candidate.properties, ["noSpray", "no_spray"]), true),
      confidence: confidenceOrDefault(readStringProperty(candidate.properties, ["confidence", "sourceConfidence"]), "imagery_digitized"),
    };
  });

  const existingSurveyIds = new Set(project.surveyPoints.map((point) => point.id));
  const observedAt = options.observedAt ?? new Date().toISOString();
  const surveyPoints = pointCandidates.map((candidate, index): SurveyPoint => {
    const id = uniqueId(
      existingSurveyIds,
      readStringProperty(candidate.properties, ["id", "@id"]) ?? `kml-point-${project.surveyPoints.length + index + 1}`,
    );
    return {
      id,
      label: candidate.name,
      role: pointRoleFromProperties(candidate.properties, candidate.name),
      projected: candidate.projected,
      wgs84: candidate.wgs84,
      observedAt,
      source: "imported",
      confidence: confidenceOrDefault(readStringProperty(candidate.properties, ["confidence", "sourceConfidence"]), "imagery_digitized"),
      notes: readStringProperty(candidate.properties, ["description", "notes"]) ?? undefined,
    };
  });

  const nextProject = PivotProjectSchema.parse({
    ...project,
    fieldBoundary: fieldBoundary ?? project.fieldBoundary,
    obstacles: [...project.obstacles, ...obstacles],
    surveyPoints: [...project.surveyPoints, ...surveyPoints],
  });

  return {
    project: nextProject,
    importedBoundary: Boolean(fieldBoundary),
    importedObstacleCount: obstacles.length,
    importedSurveyPointCount: surveyPoints.length,
    skippedFeatureCount,
    warnings: dedupe(warnings),
  };
}

export function exportProjectGoogleEarthKml(project: PivotProject, result?: LayoutResult): GoogleEarthKmlExportResult {
  const warnings: string[] = [];
  const features: Feature[] = [];

  features.push(polygonFeature("Field boundary", "field_boundary", closeRing(project.fieldBoundary, project.projectCrs), {
    projectId: project.id,
    projectCrs: project.projectCrs,
  }));

  for (const obstacle of project.obstacles) {
    features.push(polygonFeature(obstacle.name, "obstacle", closeRing(obstacle.polygon, project.projectCrs), {
      id: obstacle.id,
      kind: obstacle.kind,
      confidence: obstacle.confidence,
      bufferMeters: String(obstacle.bufferMeters),
      hardConflict: String(obstacle.hardConflict),
      noSpray: String(obstacle.noSpray),
      projectId: project.id,
      projectCrs: project.projectCrs,
    }));
  }

  features.push(pointFeature("Pivot center", "pivot_center", project.pivotCenter, project.projectCrs, { projectId: project.id, projectCrs: project.projectCrs }));
  features.push(pointFeature("Water source", "water_source", project.waterSource, project.projectCrs, { projectId: project.id, projectCrs: project.projectCrs }));
  features.push(pointFeature("Power source", "power_source", project.powerSource, project.projectCrs, { projectId: project.id, projectCrs: project.projectCrs }));

  for (const point of project.surveyPoints) {
    features.push(pointFeature(point.label, point.role, point.projected, project.projectCrs, {
      id: point.id,
      source: point.source,
      confidence: point.confidence,
      observedAt: point.observedAt,
      notes: point.notes ?? "",
      projectId: project.id,
      projectCrs: project.projectCrs,
    }));
  }

  if (result) {
    for (const tower of result.towers) {
      features.push(pointFeature(`Tower ${tower.towerIndex}`, "tower", tower.point, project.projectCrs, {
        towerIndex: String(tower.towerIndex),
        radiusMeters: String(tower.radiusMeters),
        projectId: project.id,
        projectCrs: project.projectCrs,
      }));
    }
  }

  const featureCollection: FeatureCollection = { type: "FeatureCollection", features };
  const kml = toKML(featureCollection);
  return {
    kml,
    exportedFeatureCount: features.length,
    warnings,
  };
}

function parseGoogleEarthKml(kmlText: string): FeatureCollection {
  if (!kmlText.trim()) throw new Error("KML import file is empty.");
  const document = new DOMParser().parseFromString(kmlText, "text/xml");

  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("KML XML could not be parsed: invalid XML");
  }

  const geoJson = kmlToGeoJson(document) as FeatureCollection;
  if (!geoJson || geoJson.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) {
    throw new Error("KML import did not convert to a GeoJSON FeatureCollection.");
  }
  return geoJson;
}

function extractCandidatesFromGeometry(
  geometry: Geometry | null,
  properties: Record<string, unknown>,
  name: string,
  projectCrs: string,
  warnings: string[],
): { polygons: PolygonCandidate[]; points: PointCandidate[]; skipped: number } {
  if (!geometry) return { polygons: [], points: [], skipped: 1 };
  switch (geometry.type) {
    case "Polygon":
      return {
        polygons: polygonCandidatesFromPolygon(geometry, properties, name, projectCrs, warnings),
        points: [],
        skipped: 0,
      };
    case "MultiPolygon":
      return {
        polygons: geometry.coordinates.flatMap((coordinates, index) => polygonCandidatesFromCoordinates(
          coordinates,
          properties,
          geometry.coordinates.length === 1 ? name : `${name} ${index + 1}`,
          projectCrs,
          "polygon",
          warnings,
        )),
        points: [],
        skipped: 0,
      };
    case "LineString": {
      const candidate = polygonCandidateFromLineString(geometry, properties, name, projectCrs, warnings);
      return candidate ? { polygons: [candidate], points: [], skipped: 0 } : { polygons: [], points: [], skipped: 1 };
    }
    case "Point": {
      const point = pointCandidateFromPoint(geometry, properties, name, projectCrs, warnings);
      return point ? { polygons: [], points: [point], skipped: 0 } : { polygons: [], points: [], skipped: 1 };
    }
    case "GeometryCollection":
      return extractCandidatesFromGeometryCollection(geometry, properties, name, projectCrs, warnings);
    case "MultiPoint":
    case "MultiLineString":
      return { polygons: [], points: [], skipped: 1 };
  }
}

function extractCandidatesFromGeometryCollection(
  geometry: GeometryCollection,
  properties: Record<string, unknown>,
  name: string,
  projectCrs: string,
  warnings: string[],
): { polygons: PolygonCandidate[]; points: PointCandidate[]; skipped: number } {
  return geometry.geometries.reduce(
    (accumulator, childGeometry, index) => {
      const child = extractCandidatesFromGeometry(
        childGeometry,
        properties,
        geometry.geometries.length === 1 ? name : `${name} ${index + 1}`,
        projectCrs,
        warnings,
      );
      accumulator.polygons.push(...child.polygons);
      accumulator.points.push(...child.points);
      accumulator.skipped += child.skipped;
      return accumulator;
    },
    { polygons: [] as PolygonCandidate[], points: [] as PointCandidate[], skipped: 0 },
  );
}

function polygonCandidatesFromPolygon(
  geometry: Polygon,
  properties: Record<string, unknown>,
  name: string,
  projectCrs: string,
  warnings: string[],
): PolygonCandidate[] {
  return polygonCandidatesFromCoordinates(geometry.coordinates, properties, name, projectCrs, "polygon", warnings);
}

function polygonCandidatesFromCoordinates(
  coordinates: Position[][],
  properties: Record<string, unknown>,
  name: string,
  projectCrs: string,
  source: PolygonCandidate["source"],
  warnings: string[],
): PolygonCandidate[] {
  const outerRing = coordinates[0];
  if (!outerRing) return [];
  const ring = ringFromPositions(outerRing, projectCrs, name, warnings);
  if (!ring) return [];
  return [{ ring, name, properties, holeCount: Math.max(0, coordinates.length - 1), source }];
}

function polygonCandidateFromLineString(
  geometry: LineString,
  properties: Record<string, unknown>,
  name: string,
  projectCrs: string,
  warnings: string[],
): PolygonCandidate | null {
  if (!isClosedPositionRing(geometry.coordinates)) return null;
  const ring = ringFromPositions(geometry.coordinates, projectCrs, name, warnings);
  return ring ? { ring, name, properties, holeCount: 0, source: "closed_linestring" } : null;
}

function pointCandidateFromPoint(
  geometry: Point,
  properties: Record<string, unknown>,
  name: string,
  projectCrs: string,
  warnings: string[],
): PointCandidate | null {
  const lonLat = lonLatFromPosition(geometry.coordinates, name, warnings);
  if (!lonLat) return null;
  return {
    projected: projectLonLatToXy(lonLat, projectCrs),
    wgs84: lonLat,
    name,
    properties,
  };
}

function ringFromPositions(
  positions: Position[],
  projectCrs: string,
  name: string,
  warnings: string[],
): XY[] | null {
  if (positions.length < 4) return null;
  const points: XY[] = [];
  for (const position of positions) {
    const lonLat = lonLatFromPosition(position, name, warnings);
    if (!lonLat) return null;
    points.push(projectLonLatToXy(lonLat, projectCrs));
  }
  const normalized = removeClosingDuplicate(points);
  return normalized.length >= 3 ? normalized : null;
}

function lonLatFromPosition(position: Position, name: string, warnings: string[]): { longitude: number; latitude: number } | null {
  const [longitude, latitude, altitude] = position;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (altitude !== undefined && Number.isFinite(altitude) && altitude !== 0) {
    warnings.push(`Ignored altitude values in "${name}".`);
  }
  return { longitude, latitude };
}

function isClosedPositionRing(positions: Position[]): boolean {
  if (positions.length < 4) return false;
  const first = positions[0];
  const last = positions[positions.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function closeRing(points: XY[], projectCrs: string): Position[] {
  const positions = points.map((point) => {
    const lonLat = projectXyToLonLat(point, projectCrs);
    return [lonLat.longitude, lonLat.latitude] as Position;
  });
  if (positions.length > 0) positions.push([...positions[0]]);
  return positions;
}

function polygonFeature(name: string, layerType: string, coordinates: Position[], properties: Record<string, string>): Feature {
  return {
    type: "Feature",
    properties: { name, layerType, ...properties },
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  };
}

function pointFeature(name: string, role: string, point: XY, projectCrs: string, properties: Record<string, string>): Feature {
  const lonLat = projectXyToLonLat(point, projectCrs);
  return {
    type: "Feature",
    properties: { name, role, layerType: role, ...properties },
    geometry: {
      type: "Point",
      coordinates: [lonLat.longitude, lonLat.latitude],
    },
  };
}

function featureProperties(feature: Feature): Record<string, unknown> {
  return isRecord(feature.properties) ? feature.properties : {};
}

function readProperty(properties: Record<string, unknown>, names: string[]): unknown {
  const entries = Object.entries(properties);
  for (const name of names) {
    const exact = properties[name];
    if (exact !== undefined) return exact;
    const lowerName = name.toLowerCase();
    const match = entries.find(([key]) => key.toLowerCase() === lowerName);
    if (match) return match[1];
  }
  return undefined;
}

function readStringProperty(properties: Record<string, unknown>, names: string[]): string | null {
  const value = readProperty(properties, names);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isBoundaryCandidate(properties: Record<string, unknown>, name: string): boolean {
  const layer = normalizedLayer(properties);
  if (layer === "field_boundary" || layer === "boundary") return true;
  const normalizedName = name.toLowerCase();
  return /\b(field|boundary)\b/.test(normalizedName);
}

function obstacleKindFromProperties(properties: Record<string, unknown>, name: string): ObstacleZone["kind"] {
  const layer = normalizedLayer(properties);
  if (OBSTACLE_KINDS.includes(layer as ObstacleZone["kind"])) return layer as ObstacleZone["kind"];
  const normalizedName = name.toLowerCase();
  return OBSTACLE_KINDS.find((kind) => normalizedName.includes(kind)) ?? "exclusion";
}

function pointRoleFromProperties(properties: Record<string, unknown>, name: string): SurveyPoint["role"] {
  const layer = normalizedLayer(properties);
  if (POINT_ROLES.includes(layer as SurveyPoint["role"])) return layer as SurveyPoint["role"];
  const normalizedName = name.toLowerCase().replaceAll(" ", "_");
  return POINT_ROLES.find((role) => normalizedName.includes(role)) ?? "note";
}

function normalizedLayer(properties: Record<string, unknown>): string {
  return (readStringProperty(properties, ["layerType", "layer_type", "role", "kind", "type"]) ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function confidenceOrDefault(value: string | null, fallback: SourceConfidence): SourceConfidence {
  return CONFIDENCES.includes(value as SourceConfidence) ? value as SourceConfidence : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function uniqueId(existing: Set<string>, preferred: string): string {
  const base = sanitizeId(preferred) || "kml-import";
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
}

function sanitizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function removeClosingDuplicate(points: XY[]): XY[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first.x === last.x && first.y === last.y ? points.slice(0, -1) : points;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
