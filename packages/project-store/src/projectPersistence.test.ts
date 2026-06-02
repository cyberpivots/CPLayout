import assert from "node:assert/strict";

import { evaluateLayout } from "@cplayout/geometry";
import {
  buildGeometryBboxQueryPlan,
  buildGeometryVerticesQueryPlan,
  buildProjectGeometryRows,
  buildSaveProjectAdjacentDataStatementPlan,
  buildSaveProjectStatementPlan,
} from "./projectPersistence";
import { LOAD_ACTIVE_PROJECT_BY_ID_SQL } from "./projectRepositorySql";
import { sampleProject, type LayoutDecisionRecord, type LayoutEvidenceRecord, type ModelRecommendation } from "@cplayout/core";

const rows = buildProjectGeometryRows(sampleProject);
assert.equal(rows.length, 1 + sampleProject.obstacles.length);
assert.equal(rows[0].layerType, "field_boundary");
assert.ok(rows[0].bounds.minX < rows[0].bounds.maxX);
assert.ok(rows.some((row) => row.featureKind === "road"));

const projectWithMapFeatures = {
  ...sampleProject,
  mapFeatures: [
    {
      id: "pump-pad",
      name: "Pump pad",
      kind: "pump_location" as const,
      geometry: { type: "Point" as const, point: sampleProject.waterSource },
      confidence: "rtk_fixed" as const,
      notes: "Confirmed at startup.",
      properties: { inspected: true },
    },
    {
      id: "buried-main",
      name: "Buried main line",
      kind: "underground_pipeline" as const,
      geometry: {
        type: "LineString" as const,
        vertices: [sampleProject.waterSource, sampleProject.pivotCenter],
      },
      confidence: "user_estimated" as const,
    },
    {
      id: "corner-footprint-a",
      name: "Corner footprint A",
      kind: "corner_swing_limit" as const,
      geometry: { type: "Polygon" as const, vertices: sampleProject.fieldBoundary.slice(0, 3) },
      confidence: "user_estimated" as const,
    },
    {
      id: "end-gun-circle-a",
      name: "End gun circle A",
      kind: "end_gun_arc" as const,
      geometry: { type: "Circle" as const, center: sampleProject.pivotCenter, radiusMeters: 24 },
      confidence: "user_estimated" as const,
    },
  ],
};
const mapFeatureRows = buildProjectGeometryRows(projectWithMapFeatures).filter((row) => row.layerType === "map_feature");
assert.equal(mapFeatureRows.length, 4);
assert.equal(mapFeatureRows[0].id, `${sampleProject.id}:map-feature:pump-pad`);
assert.equal(mapFeatureRows[0].featureKind, "pump_location");
assert.equal(mapFeatureRows[0].vertices.length, 1);
assert.equal(mapFeatureRows[0].properties.geometryType, "Point");
assert.equal(mapFeatureRows[0].properties.inspected, true);
assert.equal(mapFeatureRows[1].featureKind, "underground_pipeline");
assert.equal(mapFeatureRows[1].vertices.length, 2);
assert.equal(mapFeatureRows[2].properties.geometryType, "Polygon");
assert.equal(mapFeatureRows[2].vertices.length, 3);
assert.equal(mapFeatureRows[3].properties.geometryType, "Circle");
assert.equal(mapFeatureRows[3].properties.radiusMeters, 24);
assert.ok(mapFeatureRows[3].vertices.length > 8);

const plan = buildSaveProjectStatementPlan(sampleProject, evaluateLayout(sampleProject));
assert.ok(plan.some((statement) => statement.sql.includes("INSERT INTO project_snapshots")));
assert.ok(plan.some((statement) => statement.sql.includes("INSERT INTO geometry_vertices")));
assert.ok(plan.some((statement) => statement.sql.includes("INSERT INTO survey_points")));
assert.ok(plan.some((statement) => statement.sql.includes("INSERT INTO layout_scenarios")));
assert.ok(plan.length > sampleProject.fieldBoundary.length);

const firstProjectStatement = plan.find((statement) => statement.sql.includes("INSERT INTO projects"));
assert.ok(firstProjectStatement);
assert.equal(firstProjectStatement.params[0], sampleProject.id);
assert.equal(firstProjectStatement.params[2], sampleProject.projectCrs);
assert.match(LOAD_ACTIVE_PROJECT_BY_ID_SQL, /JOIN projects p ON p\.id = s\.project_id/);
assert.match(LOAD_ACTIVE_PROJECT_BY_ID_SQL, /p\.deleted_at IS NULL/);

const projectWithTiles = {
  ...sampleProject,
  mapPackages: [{
    id: "field-imagery",
    name: "Field imagery",
    packageType: "pmtiles" as const,
    tileContentType: "raster" as const,
    uri: "file:///offline/field.pmtiles",
    minZoom: 10,
    maxZoom: 18,
    tileScheme: "xyz" as const,
    boundsWgs84: {
      minLongitude: -105.21,
      minLatitude: 40.01,
      maxLongitude: -105.11,
      maxLatitude: 40.11,
    },
    tileUrlTemplates: ["http://127.0.0.1:8765/field/{z}/{x}/{y}.png"],
    vectorOverlay: {
      schema: "cplayout_reference_v1" as const,
      sourceLayers: {
        roads: "roads",
        roadLabels: "road_labels",
        borders: "borders",
        places: "places",
      },
    },
    checksumSha256: "b".repeat(64),
    installStatus: "available" as const,
    attribution: "Local imagery",
    licenseText: "Offline permitted",
    bytes: 98765,
    importedAt: "2026-05-19T12:00:00.000Z",
  }],
};
const tilePlan = buildSaveProjectStatementPlan(projectWithTiles);
const mapPackageStatement = tilePlan.find((statement) => statement.sql.includes("INSERT INTO map_packages"));
assert.ok(mapPackageStatement);
assert.match(mapPackageStatement.sql, /tile_content_type/);
assert.match(mapPackageStatement.sql, /tile_url_templates_json/);
assert.match(mapPackageStatement.sql, /vector_overlay_json/);
assert.equal(mapPackageStatement.params[4], "raster");
assert.equal(mapPackageStatement.params[8], "xyz");
assert.match(String(mapPackageStatement.params[15]), /cplayout_reference_v1/);
assert.equal(mapPackageStatement.params[17], "available");

const bboxQuery = buildGeometryBboxQueryPlan({
  projectId: sampleProject.id,
  bounds: { minX: 500900, minY: 4506000, maxX: 501500, maxY: 4507000 },
  layerTypes: ["field_boundary", "obstacle"],
  limit: 50,
});
assert.match(bboxQuery.sql, /FROM geometries/);
assert.match(bboxQuery.sql, /max_x >= \?/);
assert.match(bboxQuery.sql, /layer_type IN \(\?, \?\)/);
assert.match(bboxQuery.sql, /LIMIT 50/);
assert.deepEqual(bboxQuery.params.slice(-2), ["field_boundary", "obstacle"]);

const emptyVerticesQuery = buildGeometryVerticesQueryPlan([]);
assert.match(emptyVerticesQuery.sql, /WHERE 1 = 0/);
assert.deepEqual(emptyVerticesQuery.params, []);

const verticesQuery = buildGeometryVerticesQueryPlan(["g1", "g2", "g1"]);
assert.match(verticesQuery.sql, /geometry_id IN \(\?, \?\)/);
assert.deepEqual(verticesQuery.params, ["g1", "g2"]);

const largeProject = {
  ...sampleProject,
  fieldBoundary: Array.from({ length: 1500 }, (_, index) => ({
    x: sampleProject.fieldBoundary[0].x + Math.cos(index / 25) * (400 + index / 20),
    y: sampleProject.fieldBoundary[0].y + Math.sin(index / 25) * (400 + index / 20),
  })),
};
const largePlan = buildSaveProjectStatementPlan(largeProject);
assert.ok(largePlan.filter((statement) => statement.sql.includes("INSERT INTO geometry_vertices")).length >= 1500);

const mapFeaturePlan = buildSaveProjectStatementPlan(projectWithMapFeatures);
const mapFeatureGeometryStatement = mapFeaturePlan.find((statement) => statement.params[0] === `${sampleProject.id}:map-feature:pump-pad`);
assert.ok(mapFeatureGeometryStatement);
assert.equal(mapFeatureGeometryStatement.params[2], "map_feature");
assert.equal(mapFeatureGeometryStatement.params[3], "pump_location");
assert.match(String(mapFeatureGeometryStatement.params[6]), /"geometryType":"Point"/);
assert.ok(
  mapFeaturePlan.some((statement) =>
    statement.sql.includes("INSERT INTO geometry_vertices")
    && statement.params[0] === `${sampleProject.id}:map-feature:buried-main`
    && statement.params[2] === 1
    && statement.params[3] === sampleProject.pivotCenter.x
  ),
);

const evidenceRecord: LayoutEvidenceRecord = {
  id: "evidence-001",
  projectId: sampleProject.id,
  sourceKind: "imagery",
  createdAt: "2026-05-22T12:00:00.000Z",
  projectCrs: sampleProject.projectCrs,
  summary: "Visible road edge used as planning evidence.",
  geometry: sampleProject.fieldBoundary.slice(0, 3),
  confidence: 0.72,
  reviewStatus: "unreviewed",
};
const modelRecommendation: ModelRecommendation = {
  id: "recommendation-001",
  projectId: sampleProject.id,
  modelName: "baseline-local-ranker",
  modelVersion: "0.1.0",
  createdAt: "2026-05-22T12:05:00.000Z",
  projectCrs: sampleProject.projectCrs,
  summary: "Move pivot center east to reduce outside-field acres.",
  proposedGeometry: {
    projectCrs: sampleProject.projectCrs,
    pivotCenter: { x: sampleProject.pivotCenter.x + 10, y: sampleProject.pivotCenter.y },
  },
  confidence: 0.61,
  evidenceIds: [evidenceRecord.id],
  reviewStatus: "unreviewed",
  score: 88.2,
  warnings: [],
};
const layoutDecision: LayoutDecisionRecord = {
  id: "decision-001",
  projectId: sampleProject.id,
  createdAt: "2026-05-22T12:10:00.000Z",
  decidedBy: "operator",
  decision: "deferred",
  recommendationId: modelRecommendation.id,
  evidenceIds: [evidenceRecord.id],
  reason: "Needs field verification before production geometry changes.",
};
const adjacentPlan = buildSaveProjectAdjacentDataStatementPlan(sampleProject.id, {
  evidenceRecords: [evidenceRecord],
  modelRecommendations: [modelRecommendation],
  layoutDecisions: [layoutDecision],
});
assert.equal(adjacentPlan[0].sql, "DELETE FROM layout_decisions WHERE project_id = ?");
assert.equal(adjacentPlan[1].sql, "DELETE FROM model_recommendations WHERE project_id = ?");
assert.equal(adjacentPlan[2].sql, "DELETE FROM layout_evidence WHERE project_id = ?");
assert.ok(adjacentPlan.some((statement) => statement.sql.includes("INSERT INTO layout_evidence")));
assert.ok(adjacentPlan.some((statement) => statement.sql.includes("INSERT INTO model_recommendations")));
assert.ok(adjacentPlan.some((statement) => statement.sql.includes("INSERT INTO layout_decisions")));
assert.ok(String(adjacentPlan.find((statement) => statement.sql.includes("INSERT INTO layout_evidence"))?.params[6]).includes("Visible road edge"));
assert.throws(
  () => buildSaveProjectAdjacentDataStatementPlan(sampleProject.id, {
    evidenceRecords: [{ ...evidenceRecord, projectId: "other-project" }],
  }),
  /belongs to other-project/,
);

console.log("project persistence plan tests passed");
