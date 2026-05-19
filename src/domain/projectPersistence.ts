import type { LayoutResult, MapPackageManifest, ObstacleZone, PivotProject, SurveyPoint, XY } from "./types";
import { serializeProjectDocument } from "./projectDocument";

export interface SqlStatementPlan {
  sql: string;
  params: SqlBindValue[];
}

export type SqlBindValue = string | number | null | boolean | Uint8Array;

export interface GeometryPersistenceRow {
  id: string;
  layerType: string;
  featureKind: string;
  name: string | null;
  sourceConfidence: string;
  properties: Record<string, unknown>;
  vertices: XY[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function buildProjectGeometryRows(project: PivotProject): GeometryPersistenceRow[] {
  return [
    {
      id: `${project.id}:field-boundary`,
      layerType: "field_boundary",
      featureKind: "field_boundary",
      name: "Field boundary",
      sourceConfidence: "manual",
      properties: {},
      vertices: project.fieldBoundary,
      bounds: boundsForPoints(project.fieldBoundary),
    },
    ...project.obstacles.map((obstacle) => obstacleToGeometryRow(project.id, obstacle)),
  ];
}

export function buildSaveProjectStatementPlan(project: PivotProject, result?: LayoutResult): SqlStatementPlan[] {
  const now = new Date().toISOString();
  const statements: SqlStatementPlan[] = [
    {
      sql: `INSERT INTO projects (id, name, project_crs, unit_system, source_json_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          project_crs = excluded.project_crs,
          unit_system = excluded.unit_system,
          source_json_version = excluded.source_json_version,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
      params: [project.id, project.name, project.projectCrs, project.unitSystem, "pivot-project-v1", now, now],
    },
    {
      sql: `INSERT INTO project_settings (project_id, settings_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          settings_json = excluded.settings_json,
          updated_at = excluded.updated_at`,
      params: [project.id, JSON.stringify(project.settings ?? null), now],
    },
    {
      sql: `INSERT INTO project_snapshots (project_id, project_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          project_json = excluded.project_json,
          updated_at = excluded.updated_at`,
      params: [project.id, serializeProjectDocument(project), now],
    },
    { sql: "DELETE FROM geometries WHERE project_id = ?", params: [project.id] },
    { sql: "DELETE FROM survey_points WHERE project_id = ?", params: [project.id] },
    { sql: "DELETE FROM map_packages WHERE project_id = ?", params: [project.id] },
  ];

  for (const geometry of buildProjectGeometryRows(project)) {
    statements.push({
      sql: `INSERT INTO geometries (id, project_id, layer_type, feature_kind, name, source_confidence, properties_json, min_x, min_y, max_x, max_y, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        geometry.id,
        project.id,
        geometry.layerType,
        geometry.featureKind,
        geometry.name,
        geometry.sourceConfidence,
        JSON.stringify(geometry.properties),
        geometry.bounds.minX,
        geometry.bounds.minY,
        geometry.bounds.maxX,
        geometry.bounds.maxY,
        now,
        now,
      ],
    });
    geometry.vertices.forEach((vertex, vertexIndex) => {
      statements.push({
        sql: `INSERT INTO geometry_vertices (geometry_id, ring_index, vertex_index, x, y)
          VALUES (?, ?, ?, ?, ?)`,
        params: [geometry.id, 0, vertexIndex, vertex.x, vertex.y],
      });
    });
  }

  for (const point of project.surveyPoints) statements.push(surveyPointStatement(project.id, point));
  for (const mapPackage of project.mapPackages ?? []) statements.push(mapPackageStatement(project.id, mapPackage));

  if (result) {
    statements.push({
      sql: `INSERT INTO layout_scenarios (id, project_id, name, machine_json, center_x, center_y, metrics_json, warnings_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          machine_json = excluded.machine_json,
          center_x = excluded.center_x,
          center_y = excluded.center_y,
          metrics_json = excluded.metrics_json,
          warnings_json = excluded.warnings_json,
          updated_at = excluded.updated_at`,
      params: [
        `${project.id}:current-layout`,
        project.id,
        "Current layout",
        JSON.stringify(project.machine),
        project.pivotCenter.x,
        project.pivotCenter.y,
        JSON.stringify(result.metrics),
        JSON.stringify(result.warnings),
        now,
        now,
      ],
    });
  }

  return statements;
}

function obstacleToGeometryRow(projectId: string, obstacle: ObstacleZone): GeometryPersistenceRow {
  return {
    id: `${projectId}:obstacle:${obstacle.id}`,
    layerType: "obstacle",
    featureKind: obstacle.kind,
    name: obstacle.name,
    sourceConfidence: obstacle.confidence,
    properties: {
      obstacleId: obstacle.id,
      bufferMeters: obstacle.bufferMeters,
      hardConflict: obstacle.hardConflict,
      noSpray: obstacle.noSpray,
    },
    vertices: obstacle.polygon,
    bounds: boundsForPoints(obstacle.polygon),
  };
}

function surveyPointStatement(projectId: string, point: SurveyPoint): SqlStatementPlan {
  return {
    sql: `INSERT INTO survey_points (id, project_id, label, role, x, y, longitude, latitude, observed_at, source, confidence, rtk_json, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      point.id,
      projectId,
      point.label,
      point.role,
      point.projected.x,
      point.projected.y,
      point.wgs84?.longitude ?? null,
      point.wgs84?.latitude ?? null,
      point.observedAt,
      point.source,
      point.confidence,
      point.rtk ? JSON.stringify(point.rtk) : null,
      point.notes ?? null,
    ],
  };
}

function mapPackageStatement(projectId: string, mapPackage: MapPackageManifest): SqlStatementPlan {
  return {
    sql: `INSERT INTO map_packages (id, project_id, name, package_type, uri, min_zoom, max_zoom, min_longitude, min_latitude, max_longitude, max_latitude, attribution, license_text, bytes, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      mapPackage.id,
      projectId,
      mapPackage.name,
      mapPackage.packageType,
      mapPackage.uri,
      mapPackage.minZoom,
      mapPackage.maxZoom,
      mapPackage.boundsWgs84.minLongitude,
      mapPackage.boundsWgs84.minLatitude,
      mapPackage.boundsWgs84.maxLongitude,
      mapPackage.boundsWgs84.maxLatitude,
      mapPackage.attribution,
      mapPackage.licenseText,
      mapPackage.bytes ?? null,
      mapPackage.importedAt,
    ],
  };
}

function boundsForPoints(points: XY[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );
}
