export const LOAD_ACTIVE_PROJECT_BY_ID_SQL = [
  "SELECT s.project_json",
  "FROM project_snapshots s",
  "JOIN projects p ON p.id = s.project_id",
  "WHERE s.project_id = ? AND p.deleted_at IS NULL;",
].join(" ");
