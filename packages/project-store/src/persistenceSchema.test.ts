import assert from "node:assert/strict";

import {
  SQLITE_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  listSchemaIndexNames,
  migrationSql,
} from "./persistenceSchema";

assert.equal(SQLITE_SCHEMA_VERSION, 11);
assert.deepEqual(SQLITE_MIGRATIONS.map((migration) => migration.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

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
assert.match(sql, /tile_scheme TEXT NOT NULL DEFAULT 'xyz'/);
assert.match(sql, /tile_url_templates_json TEXT NOT NULL DEFAULT '\[\]'/);
assert.match(sql, /ALTER TABLE map_packages ADD COLUMN vector_overlay_json TEXT/);
assert.match(sql, /ALTER TABLE map_packages ADD COLUMN imagery_provenance_json TEXT/);
assert.match(sql, /install_status TEXT NOT NULL DEFAULT 'metadata_only'/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS layout_evidence/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS model_recommendations/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS layout_decisions/);
assert.match(sql, /DROP TABLE IF EXISTS layout_decisions/);
assert.match(sql, /DROP TABLE IF EXISTS model_recommendations/);
assert.match(sql, /DROP TABLE IF EXISTS layout_evidence/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS customers/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN contact_name TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN email TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN phone TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN location TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN notes TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN company_name TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN primary_contact_first_name TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN primary_contact_middle_initial TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN primary_contact_last_name TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /ALTER TABLE customers ADD COLUMN primary_contact_suffix TEXT NOT NULL DEFAULT ''/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS project_records/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS field_maps/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS designs/);
assert.match(sql, /ALTER TABLE customers RENAME TO clients/);
assert.match(sql, /ALTER TABLE project_records RENAME COLUMN customer_id TO client_id/);
assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_clients_sort ON clients/);
assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_project_records_client ON project_records/);

const indexes = listSchemaIndexNames();
assert.ok(indexes.includes("idx_geometry_vertices_order"));
assert.ok(indexes.includes("idx_geometries_bbox"));
assert.ok(indexes.includes("idx_survey_points_project_role"));
assert.ok(indexes.includes("idx_gps_track_points_time"));
assert.ok(indexes.includes("idx_map_packages_project_type"));
assert.ok(indexes.includes("idx_map_packages_bounds"));
assert.ok(indexes.includes("idx_map_packages_status"));
assert.ok(indexes.includes("idx_project_snapshots_updated"));
assert.equal(indexes.includes("idx_layout_evidence_project_status"), false);
assert.equal(indexes.includes("idx_layout_evidence_source"), false);
assert.equal(indexes.includes("idx_model_recommendations_project_status"), false);
assert.equal(indexes.includes("idx_layout_decisions_project_created"), false);
assert.equal(indexes.includes("idx_customers_sort"), false);
assert.equal(indexes.includes("idx_project_records_customer"), false);
assert.ok(indexes.includes("idx_clients_sort"));
assert.ok(indexes.includes("idx_project_records_client"));
assert.ok(indexes.includes("idx_field_maps_project"));
assert.ok(indexes.includes("idx_designs_field_map"));
assert.ok(indexes.includes("idx_designs_pivot_project"));

console.log("persistence schema tests passed");
