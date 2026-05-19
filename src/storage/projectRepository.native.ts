import { parseProjectDocument } from "../domain/projectDocument";
import { buildSaveProjectStatementPlan } from "../domain/projectPersistence";
import type { LayoutResult, PivotProject } from "../domain/types";
import { openProjectDatabaseAsync } from "./sqliteProjectStore";
import type { ProjectRepository, ProjectSummary } from "./projectRepositoryTypes";

export const projectRepository: ProjectRepository = {
  backendLabel: "Expo SQLite",

  async listProjectsAsync(): Promise<ProjectSummary[]> {
    const db = await openProjectDatabaseAsync();
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      project_crs: string;
      unit_system: string;
      updated_at: string;
    }>("SELECT id, name, project_crs, unit_system, updated_at FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC;");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      projectCrs: row.project_crs,
      unitSystem: row.unit_system,
      updatedAt: row.updated_at,
    }));
  },

  async saveProjectAsync(project: PivotProject, result?: LayoutResult): Promise<void> {
    const db = await openProjectDatabaseAsync();
    const plan = buildSaveProjectStatementPlan(project, result);
    await db.withTransactionAsync(async () => {
      for (const statement of plan) {
        await db.runAsync(statement.sql, statement.params);
      }
    });
  },

  async loadProjectAsync(projectId: string): Promise<PivotProject | null> {
    const db = await openProjectDatabaseAsync();
    const row = await db.getFirstAsync<{ project_json: string }>(
      "SELECT project_json FROM project_snapshots WHERE project_id = ?;",
      projectId,
    );
    return row ? parseProjectDocument(row.project_json) : null;
  },

  async deleteProjectAsync(projectId: string): Promise<void> {
    const db = await openProjectDatabaseAsync();
    await db.runAsync("UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;", projectId);
  },
};

export type { ProjectSummary } from "./projectRepositoryTypes";
