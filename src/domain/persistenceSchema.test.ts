import assert from "node:assert/strict";

import {
  SQLITE_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  listSchemaIndexNames,
  migrationSql,
} from "./persistenceSchema";

assert.equal(SQLITE_SCHEMA_VERSION, 2);
assert.deepEqual(SQLITE_MIGRATIONS.map((migration) => migration.id), [1, 2]);

const sql = migrationSql();
assert.match(sql, /CREATE TABLE IF NOT EXISTS projects/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS geometry_vertices/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS gps_track_points/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS map_packages/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS project_snapshots/);
assert.match(sql, /settings_json TEXT NOT NULL/);
assert.match(sql, /project_json TEXT NOT NULL/);
assert.match(sql, /attribution TEXT NOT NULL/);
assert.match(sql, /license_text TEXT NOT NULL/);

const indexes = listSchemaIndexNames();
assert.ok(indexes.includes("idx_geometry_vertices_order"));
assert.ok(indexes.includes("idx_geometries_bbox"));
assert.ok(indexes.includes("idx_survey_points_project_role"));
assert.ok(indexes.includes("idx_gps_track_points_time"));
assert.ok(indexes.includes("idx_map_packages_project_type"));
assert.ok(indexes.includes("idx_project_snapshots_updated"));

console.log("persistence schema tests passed");
