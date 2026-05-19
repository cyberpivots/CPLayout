import assert from "node:assert/strict";

import { evaluateLayout } from "@cplayout/geometry";
import {
  buildGeometryBboxQueryPlan,
  buildGeometryVerticesQueryPlan,
  buildProjectGeometryRows,
  buildSaveProjectStatementPlan,
} from "./projectPersistence";
import { sampleProject } from "@cplayout/core";

const rows = buildProjectGeometryRows(sampleProject);
assert.equal(rows.length, 1 + sampleProject.obstacles.length);
assert.equal(rows[0].layerType, "field_boundary");
assert.ok(rows[0].bounds.minX < rows[0].bounds.maxX);
assert.ok(rows.some((row) => row.featureKind === "road"));

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
assert.equal(mapPackageStatement.params[4], "raster");
assert.equal(mapPackageStatement.params[8], "xyz");
assert.equal(mapPackageStatement.params[16], "available");

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

console.log("project persistence plan tests passed");
