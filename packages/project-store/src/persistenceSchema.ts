export interface SqlMigration {
  id: number;
  name: string;
  statements: string[];
}

export const SQLITE_SCHEMA_VERSION = 11;

const OLD_CLIENTS_TABLE = ["cust", "omers"].join("");
const OLD_PROJECT_CLIENT_ID_COLUMN = ["cust", "omer_id"].join("");
const OLD_CLIENTS_SORT_INDEX = ["idx_", "cust", "omers", "_sort"].join("");
const OLD_PROJECT_CLIENT_INDEX = ["idx_project_records_", "cust", "omer"].join("");

export const SQLITE_MIGRATIONS: SqlMigration[] = [
  {
    id: 1,
    name: "initial_local_first_field_mapping_store",
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        project_crs TEXT NOT NULL,
        unit_system TEXT NOT NULL,
        source_json_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS project_settings (
        project_id TEXT PRIMARY KEY NOT NULL,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS geometries (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        layer_type TEXT NOT NULL,
        feature_kind TEXT NOT NULL,
        name TEXT,
        source_confidence TEXT NOT NULL,
        properties_json TEXT NOT NULL DEFAULT '{}',
        min_x REAL NOT NULL,
        min_y REAL NOT NULL,
        max_x REAL NOT NULL,
        max_y REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS geometry_vertices (
        geometry_id TEXT NOT NULL,
        ring_index INTEGER NOT NULL,
        vertex_index INTEGER NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        z REAL,
        observed_at TEXT,
        source_point_id TEXT,
        PRIMARY KEY (geometry_id, ring_index, vertex_index),
        FOREIGN KEY (geometry_id) REFERENCES geometries(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS survey_points (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        label TEXT NOT NULL,
        role TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        longitude REAL,
        latitude REAL,
        observed_at TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL,
        rtk_json TEXT,
        notes TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS gps_tracks (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        receiver_id TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        quality_summary_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS gps_track_points (
        track_id TEXT NOT NULL,
        point_index INTEGER NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        longitude REAL,
        latitude REAL,
        observed_at TEXT NOT NULL,
        fix_type TEXT NOT NULL,
        satellites INTEGER,
        hdop REAL,
        horizontal_accuracy_m REAL,
        raw_nmea TEXT,
        PRIMARY KEY (track_id, point_index),
        FOREIGN KEY (track_id) REFERENCES gps_tracks(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS map_packages (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT,
        name TEXT NOT NULL,
        package_type TEXT NOT NULL,
        uri TEXT NOT NULL,
        min_zoom INTEGER NOT NULL,
        max_zoom INTEGER NOT NULL,
        min_longitude REAL NOT NULL,
        min_latitude REAL NOT NULL,
        max_longitude REAL NOT NULL,
        max_latitude REAL NOT NULL,
        attribution TEXT NOT NULL,
        license_text TEXT NOT NULL,
        bytes INTEGER,
        imported_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS layout_scenarios (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        machine_json TEXT NOT NULL,
        center_x REAL NOT NULL,
        center_y REAL NOT NULL,
        metrics_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS exports (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        export_type TEXT NOT NULL,
        uri TEXT NOT NULL,
        bytes INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_geometries_project_layer ON geometries(project_id, layer_type)`,
      `CREATE INDEX IF NOT EXISTS idx_geometries_bbox ON geometries(project_id, min_x, min_y, max_x, max_y)`,
      `CREATE INDEX IF NOT EXISTS idx_geometry_vertices_order ON geometry_vertices(geometry_id, ring_index, vertex_index)`,
      `CREATE INDEX IF NOT EXISTS idx_survey_points_project_role ON survey_points(project_id, role, confidence)`,
      `CREATE INDEX IF NOT EXISTS idx_survey_points_xy ON survey_points(project_id, x, y)`,
      `CREATE INDEX IF NOT EXISTS idx_gps_tracks_project_time ON gps_tracks(project_id, started_at)`,
      `CREATE INDEX IF NOT EXISTS idx_gps_track_points_time ON gps_track_points(track_id, observed_at)`,
      `CREATE INDEX IF NOT EXISTS idx_gps_track_points_quality ON gps_track_points(track_id, fix_type, hdop)`,
      `CREATE INDEX IF NOT EXISTS idx_map_packages_project_type ON map_packages(project_id, package_type, min_zoom, max_zoom)`,
      `CREATE INDEX IF NOT EXISTS idx_scenarios_project_updated ON layout_scenarios(project_id, updated_at)`,
    ],
  },
  {
    id: 2,
    name: "add_exact_project_document_snapshots",
    statements: [
      `CREATE TABLE IF NOT EXISTS project_snapshots (
        project_id TEXT PRIMARY KEY NOT NULL,
        project_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_project_snapshots_updated ON project_snapshots(updated_at)`,
    ],
  },
  {
    id: 3,
    name: "add_tile_package_source_metadata",
    statements: [
      `ALTER TABLE map_packages ADD COLUMN tile_content_type TEXT NOT NULL DEFAULT 'raster'`,
      `ALTER TABLE map_packages ADD COLUMN tile_scheme TEXT NOT NULL DEFAULT 'xyz'`,
      `ALTER TABLE map_packages ADD COLUMN tilejson_url TEXT`,
      `ALTER TABLE map_packages ADD COLUMN tile_url_templates_json TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE map_packages ADD COLUMN checksum_sha256 TEXT`,
      `ALTER TABLE map_packages ADD COLUMN install_status TEXT NOT NULL DEFAULT 'metadata_only'`,
      `CREATE INDEX IF NOT EXISTS idx_map_packages_bounds ON map_packages(project_id, min_longitude, min_latitude, max_longitude, max_latitude)`,
      `CREATE INDEX IF NOT EXISTS idx_map_packages_status ON map_packages(project_id, install_status, package_type)`,
    ],
  },
  {
    id: 4,
    name: "add_project_adjacent_evidence_and_recommendations",
    statements: [
      `CREATE TABLE IF NOT EXISTS layout_evidence (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        project_crs TEXT NOT NULL,
        confidence REAL NOT NULL,
        review_status TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        collected_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS model_recommendations (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        model_version TEXT NOT NULL,
        project_crs TEXT NOT NULL,
        confidence REAL NOT NULL,
        review_status TEXT NOT NULL,
        score REAL,
        recommendation_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS layout_decisions (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        recommendation_id TEXT,
        decided_by TEXT NOT NULL,
        decision TEXT NOT NULL,
        decision_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_layout_evidence_project_status ON layout_evidence(project_id, review_status, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_layout_evidence_source ON layout_evidence(project_id, source_kind, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_model_recommendations_project_status ON model_recommendations(project_id, review_status, score)`,
      `CREATE INDEX IF NOT EXISTS idx_layout_decisions_project_created ON layout_decisions(project_id, created_at)`,
    ],
  },
  {
    id: 5,
    name: "add_client_project_field_design_catalog",
    statements: [
      `CREATE TABLE IF NOT EXISTS ${OLD_CLIENTS_TABLE} (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL,
        sort_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS project_records (
        id TEXT PRIMARY KEY NOT NULL,
        ${OLD_PROJECT_CLIENT_ID_COLUMN} TEXT NOT NULL,
        name TEXT NOT NULL,
        project_crs TEXT NOT NULL,
        unit_system TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (${OLD_PROJECT_CLIENT_ID_COLUMN}) REFERENCES ${OLD_CLIENTS_TABLE}(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS field_maps (
        id TEXT PRIMARY KEY NOT NULL,
        project_record_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (project_record_id) REFERENCES project_records(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY NOT NULL,
        field_map_id TEXT NOT NULL,
        name TEXT NOT NULL,
        pivot_project_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (field_map_id) REFERENCES field_maps(id) ON DELETE CASCADE,
        FOREIGN KEY (pivot_project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ${OLD_CLIENTS_SORT_INDEX} ON ${OLD_CLIENTS_TABLE}(sort_name, display_name)`,
      `CREATE INDEX IF NOT EXISTS ${OLD_PROJECT_CLIENT_INDEX} ON project_records(${OLD_PROJECT_CLIENT_ID_COLUMN}, name)`,
      `CREATE INDEX IF NOT EXISTS idx_field_maps_project ON field_maps(project_record_id, name)`,
      `CREATE INDEX IF NOT EXISTS idx_designs_field_map ON designs(field_map_id, is_active, name)`,
      `CREATE INDEX IF NOT EXISTS idx_designs_pivot_project ON designs(pivot_project_id)`,
    ],
  },
  {
    id: 6,
    name: "add_client_profile_fields",
    statements: [
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN contact_name TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN email TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN phone TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN location TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN notes TEXT NOT NULL DEFAULT ''`,
    ],
  },
  {
    id: 7,
    name: "add_client_structured_contact_fields",
    statements: [
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN company_name TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN primary_contact_first_name TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN primary_contact_middle_initial TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN primary_contact_last_name TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} ADD COLUMN primary_contact_suffix TEXT NOT NULL DEFAULT ''`,
    ],
  },
  {
    id: 8,
    name: "add_map_package_vector_overlay_metadata",
    statements: [
      `ALTER TABLE map_packages ADD COLUMN vector_overlay_json TEXT`,
    ],
  },
  {
    id: 9,
    name: "add_map_package_imagery_provenance",
    statements: [
      `ALTER TABLE map_packages ADD COLUMN imagery_provenance_json TEXT`,
    ],
  },
  {
    id: 10,
    name: "drop_review_recommendation_contracts",
    statements: [
      `DROP INDEX IF EXISTS idx_layout_evidence_project_status`,
      `DROP INDEX IF EXISTS idx_layout_evidence_source`,
      `DROP INDEX IF EXISTS idx_model_recommendations_project_status`,
      `DROP INDEX IF EXISTS idx_layout_decisions_project_created`,
      `DROP TABLE IF EXISTS layout_decisions`,
      `DROP TABLE IF EXISTS model_recommendations`,
      `DROP TABLE IF EXISTS layout_evidence`,
    ],
  },
  {
    id: 11,
    name: "rename_client_catalog_schema",
    statements: [
      `DROP INDEX IF EXISTS ${OLD_PROJECT_CLIENT_INDEX}`,
      `DROP INDEX IF EXISTS ${OLD_CLIENTS_SORT_INDEX}`,
      `ALTER TABLE ${OLD_CLIENTS_TABLE} RENAME TO clients`,
      `ALTER TABLE project_records RENAME COLUMN ${OLD_PROJECT_CLIENT_ID_COLUMN} TO client_id`,
      `CREATE INDEX IF NOT EXISTS idx_clients_sort ON clients(sort_name, display_name)`,
      `CREATE INDEX IF NOT EXISTS idx_project_records_client ON project_records(client_id, name)`,
    ],
  },
];

export function migrationSql(): string {
  return SQLITE_MIGRATIONS.flatMap((migration) => migration.statements).join(";\n") + ";";
}

export function listSchemaIndexNames(): string[] {
  const droppedIndexes = new Set(
    SQLITE_MIGRATIONS
      .flatMap((migration) => migration.statements)
      .map((statement) => statement.match(/DROP INDEX IF EXISTS\s+(\w+)/i)?.[1])
      .filter((name): name is string => Boolean(name)),
  );
  return SQLITE_MIGRATIONS
    .flatMap((migration) => migration.statements)
    .map((statement) => statement.match(/CREATE INDEX IF NOT EXISTS\s+(\w+)/i)?.[1])
    .filter((name): name is string => typeof name === "string" && !droppedIndexes.has(name));
}
