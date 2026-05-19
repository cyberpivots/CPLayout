import assert from "node:assert/strict";

import { evaluateLayout } from "./geometry";
import { buildProjectGeometryRows, buildSaveProjectStatementPlan } from "./projectPersistence";
import { sampleProject } from "./sampleProject";

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

console.log("project persistence plan tests passed");
