export interface SqlMigration {
  id: number;
  name: string;
  statements: string[];
}

export const SQLITE_SCHEMA_VERSION = 3;

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
];

export function migrationSql(): string {
  return SQLITE_MIGRATIONS.flatMap((migration) => migration.statements).join(";\n") + ";";
}

export function listSchemaIndexNames(): string[] {
  return SQLITE_MIGRATIONS
    .flatMap((migration) => migration.statements)
    .map((statement) => statement.match(/CREATE INDEX IF NOT EXISTS\s+(\w+)/i)?.[1])
    .filter((name): name is string => Boolean(name));
}
