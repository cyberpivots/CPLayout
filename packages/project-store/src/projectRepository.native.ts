import { parseProjectDocument } from "@cplayout/core";
import { buildSaveProjectStatementPlan } from "./projectPersistence";
import { LOAD_ACTIVE_PROJECT_BY_ID_SQL } from "./projectRepositorySql";
import type { LayoutResult, PivotProject } from "@cplayout/core";
import { openProjectDatabaseAsync } from "./sqliteProjectStore";
import type { ProjectRepository, ProjectSummary } from "./projectRepositoryTypes";

export const projectRepository: ProjectRepository = {
  backendLabel: "Expo SQLite",

  async getBackendInfoAsync() {
    const db = await openProjectDatabaseAsync();
    const version = await db.getFirstAsync<{ user_version: number | null }>("PRAGMA user_version;");
    const count = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM projects WHERE deleted_at IS NULL;",
    );
    return {
      backendLabel: projectRepository.backendLabel,
      runtime: "native",
      storageEngine: "sqlite",
      durable: true,
      schemaVersion: Number(version?.user_version ?? 0),
      projectCount: Number(count?.count ?? 0),
      supportsProjectList: true,
      supportsZipImport: true,
      supportsZipExport: true,
      notes: [
        "Native persistence uses Expo SQLite with project snapshots plus normalized geometry/map metadata tables.",
        "Native ZIP import/export uses Expo FileSystem and Sharing and still requires device runtime verification.",
      ],
    };
  },

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
      LOAD_ACTIVE_PROJECT_BY_ID_SQL,
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
