import type {
  LayoutDecisionRecord,
  LayoutEvidenceRecord,
  LayoutResult,
  MapPackageManifest,
  ModelRecommendation,
  ObstacleZone,
  PivotProject,
  ProjectMapFeature,
  SurveyPoint,
  XY,
} from "@cplayout/core";
import {
  parseLayoutDecisionRecord,
  parseLayoutEvidenceRecord,
  parseModelRecommendation,
  serializeProjectDocument,
  validateMapPackageManifest,
} from "@cplayout/core";

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

export interface GeometryBboxQuery {
  projectId: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layerTypes?: string[];
  limit?: number;
}

export interface ProjectAdjacentData {
  evidenceRecords?: LayoutEvidenceRecord[];
  modelRecommendations?: ModelRecommendation[];
  layoutDecisions?: LayoutDecisionRecord[];
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
    ...(project.mapFeatures ?? []).map((feature) => mapFeatureToGeometryRow(project.id, feature)),
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

export function buildSaveProjectAdjacentDataStatementPlan(
  projectId: string,
  data: ProjectAdjacentData,
): SqlStatementPlan[] {
  const evidenceRecords = (data.evidenceRecords ?? []).map(parseLayoutEvidenceRecord);
  const modelRecommendations = (data.modelRecommendations ?? []).map(parseModelRecommendation);
  const layoutDecisions = (data.layoutDecisions ?? []).map(parseLayoutDecisionRecord);
  for (const record of [...evidenceRecords, ...modelRecommendations, ...layoutDecisions]) {
    if (record.projectId !== projectId) {
      throw new Error(`Project-adjacent record ${record.id} belongs to ${record.projectId}, not ${projectId}.`);
    }
  }

  return [
    { sql: "DELETE FROM layout_decisions WHERE project_id = ?", params: [projectId] },
    { sql: "DELETE FROM model_recommendations WHERE project_id = ?", params: [projectId] },
    { sql: "DELETE FROM layout_evidence WHERE project_id = ?", params: [projectId] },
    ...evidenceRecords.map(layoutEvidenceStatement),
    ...modelRecommendations.map(modelRecommendationStatement),
    ...layoutDecisions.map(layoutDecisionStatement),
  ];
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

function mapFeatureToGeometryRow(projectId: string, feature: ProjectMapFeature): GeometryPersistenceRow {
  const vertices = feature.geometry.type === "Point" ? [feature.geometry.point] : feature.geometry.vertices;
  return {
    id: `${projectId}:map-feature:${feature.id}`,
    layerType: "map_feature",
    featureKind: feature.kind,
    name: feature.name,
    sourceConfidence: feature.confidence,
    properties: {
      ...(feature.properties ?? {}),
      featureId: feature.id,
      geometryType: feature.geometry.type,
      notes: feature.notes ?? null,
    },
    vertices,
    bounds: boundsForPoints(vertices),
  };
}

function layoutEvidenceStatement(record: LayoutEvidenceRecord): SqlStatementPlan {
  return {
    sql: `INSERT INTO layout_evidence (id, project_id, source_kind, project_crs, confidence, review_status, record_json, created_at, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      record.id,
      record.projectId,
      record.sourceKind,
      record.projectCrs,
      record.confidence,
      record.reviewStatus,
      JSON.stringify(record),
      record.createdAt,
      record.collectedAt ?? null,
    ],
  };
}

function modelRecommendationStatement(recommendation: ModelRecommendation): SqlStatementPlan {
  return {
    sql: `INSERT INTO model_recommendations (id, project_id, model_name, model_version, project_crs, confidence, review_status, score, recommendation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      recommendation.id,
      recommendation.projectId,
      recommendation.modelName,
      recommendation.modelVersion,
      recommendation.projectCrs,
      recommendation.confidence,
      recommendation.reviewStatus,
      recommendation.score ?? null,
      JSON.stringify(recommendation),
      recommendation.createdAt,
    ],
  };
}

function layoutDecisionStatement(decision: LayoutDecisionRecord): SqlStatementPlan {
  return {
    sql: `INSERT INTO layout_decisions (id, project_id, recommendation_id, decided_by, decision, decision_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [
      decision.id,
      decision.projectId,
      decision.recommendationId ?? null,
      decision.decidedBy,
      decision.decision,
      JSON.stringify(decision),
      decision.createdAt,
    ],
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
  const parsed = validateMapPackageManifest(mapPackage);
  return {
    sql: `INSERT INTO map_packages (id, project_id, name, package_type, tile_content_type, uri, min_zoom, max_zoom, tile_scheme, min_longitude, min_latitude, max_longitude, max_latitude, tilejson_url, tile_url_templates_json, vector_overlay_json, checksum_sha256, install_status, attribution, license_text, bytes, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      parsed.id,
      projectId,
      parsed.name,
      parsed.packageType,
      parsed.tileContentType,
      parsed.uri,
      parsed.minZoom,
      parsed.maxZoom,
      parsed.tileScheme,
      parsed.boundsWgs84.minLongitude,
      parsed.boundsWgs84.minLatitude,
      parsed.boundsWgs84.maxLongitude,
      parsed.boundsWgs84.maxLatitude,
      parsed.tileJsonUrl ?? null,
      JSON.stringify(parsed.tileUrlTemplates ?? []),
      parsed.vectorOverlay ? JSON.stringify(parsed.vectorOverlay) : null,
      parsed.checksumSha256 ?? null,
      parsed.installStatus ?? "metadata_only",
      parsed.attribution,
      parsed.licenseText,
      parsed.bytes ?? null,
      parsed.importedAt,
    ],
  };
}

export function buildGeometryBboxQueryPlan(query: GeometryBboxQuery): SqlStatementPlan {
  const layerTypes = query.layerTypes?.filter((layerType) => layerType.length > 0) ?? [];
  const layerFilter = layerTypes.length > 0
    ? ` AND layer_type IN (${layerTypes.map(() => "?").join(", ")})`
    : "";
  const limit = Math.max(1, Math.min(10000, Math.trunc(query.limit ?? 1000)));
  return {
    sql: `SELECT id, layer_type, feature_kind, name, source_confidence, properties_json, min_x, min_y, max_x, max_y
      FROM geometries
      WHERE project_id = ?
        AND max_x >= ?
        AND min_x <= ?
        AND max_y >= ?
        AND min_y <= ?${layerFilter}
      ORDER BY updated_at DESC
      LIMIT ${limit}`,
    params: [
      query.projectId,
      query.bounds.minX,
      query.bounds.maxX,
      query.bounds.minY,
      query.bounds.maxY,
      ...layerTypes,
    ],
  };
}

export function buildGeometryVerticesQueryPlan(geometryIds: string[]): SqlStatementPlan {
  const ids = [...new Set(geometryIds)].filter((id) => id.length > 0);
  if (ids.length === 0) {
    return {
      sql: `SELECT geometry_id, ring_index, vertex_index, x, y, z, observed_at, source_point_id
        FROM geometry_vertices
        WHERE 1 = 0`,
      params: [],
    };
  }
  return {
    sql: `SELECT geometry_id, ring_index, vertex_index, x, y, z, observed_at, source_point_id
      FROM geometry_vertices
      WHERE geometry_id IN (${ids.map(() => "?").join(", ")})
      ORDER BY geometry_id, ring_index, vertex_index`,
    params: ids,
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
