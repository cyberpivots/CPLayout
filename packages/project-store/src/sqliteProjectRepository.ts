import { parseProjectDocument } from "@cplayout/core";
import type { LayoutResult, PivotProject } from "@cplayout/core";
import { buildSaveProjectStatementPlan } from "./projectPersistence";
import { LOAD_ACTIVE_PROJECT_BY_ID_SQL } from "./projectRepositorySql";
import {
  defaultDesignId,
  defaultFieldMapId,
  LEGACY_CUSTOMER_ID,
  LEGACY_CUSTOMER_NAME,
  normalizeCatalogSortName,
  createCatalogId,
} from "./projectCatalog";
import { openProjectDatabaseAsync } from "./sqliteProjectStore";
import type {
  CatalogProjectRecord,
  CustomerRecord,
  DesignRecord,
  FieldMapRecord,
  ProjectCatalog,
  ProjectRepository,
  ProjectRepositoryBackendInfo,
  ProjectSummary,
} from "./projectRepositoryTypes";

interface SqliteRepositoryOptions {
  backendLabel: string;
  runtime: ProjectRepositoryBackendInfo["runtime"];
  storageEngine?: ProjectRepositoryBackendInfo["storageEngine"];
  notes: string[];
}

export function createSqliteProjectRepository(options: SqliteRepositoryOptions): ProjectRepository {
  const repository: ProjectRepository = {
    backendLabel: options.backendLabel,

    async getBackendInfoAsync() {
      const db = await openProjectDatabaseAsync();
      await ensureCatalogRowsAsync(db);
      const version = await db.getFirstAsync<{ user_version: number | null }>("PRAGMA user_version;");
      const count = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM projects WHERE deleted_at IS NULL;",
      );
      const customerCount = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL;",
      );
      return {
        backendLabel: repository.backendLabel,
        runtime: options.runtime,
        storageEngine: options.storageEngine ?? "sqlite",
        durable: true,
        schemaVersion: Number(version?.user_version ?? 0),
        projectCount: Number(count?.count ?? 0),
        supportsProjectList: true,
        supportsZipImport: true,
        supportsZipExport: true,
        notes: [
          ...options.notes,
          `Catalog contains ${Number(customerCount?.count ?? 0)} customer folder${Number(customerCount?.count ?? 0) === 1 ? "" : "s"}.`,
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

    async listProjectCatalogAsync(): Promise<ProjectCatalog> {
      const db = await openProjectDatabaseAsync();
      await ensureCatalogRowsAsync(db);
      return readCatalogAsync(db);
    },

    async saveProjectAsync(project: PivotProject, result?: LayoutResult): Promise<void> {
      const db = await openProjectDatabaseAsync();
      const plan = buildSaveProjectStatementPlan(project, result);
      await db.withTransactionAsync(async () => {
        for (const statement of plan) {
          await db.runAsync(statement.sql, statement.params);
        }
        const customerCount = await db.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL;",
        );
        if (Number(customerCount?.count ?? 0) === 0) {
          await ensureCatalogPathForProjectAsync(db, project);
        }
      });
    },

    async saveDesignProjectAsync(designId: string, project: PivotProject, result?: LayoutResult): Promise<void> {
      await repository.saveProjectAsync(project, result);
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      await db.runAsync(
        `UPDATE designs
        SET name = ?, pivot_project_id = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?`,
        project.name,
        project.id,
        now,
        designId,
      );
    },

    async loadProjectAsync(projectId: string): Promise<PivotProject | null> {
      const db = await openProjectDatabaseAsync();
      const row = await db.getFirstAsync<{ project_json: string }>(
        LOAD_ACTIVE_PROJECT_BY_ID_SQL,
        projectId,
      );
      return row ? parseProjectDocument(row.project_json) : null;
    },

    async loadDesignProjectAsync(designId: string): Promise<PivotProject | null> {
      const db = await openProjectDatabaseAsync();
      const row = await db.getFirstAsync<{ pivot_project_id: string }>(
        "SELECT pivot_project_id FROM designs WHERE id = ? AND deleted_at IS NULL;",
        designId,
      );
      return row ? repository.loadProjectAsync(row.pivot_project_id) : null;
    },

    async deleteProjectAsync(projectId: string): Promise<void> {
      const db = await openProjectDatabaseAsync();
      await db.withTransactionAsync(async () => {
        await db.runAsync("UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;", projectId);
        await db.runAsync("UPDATE project_records SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;", projectId);
        await db.runAsync(
          `UPDATE field_maps
          SET deleted_at = CURRENT_TIMESTAMP
          WHERE project_record_id = ?`,
          projectId,
        );
        await db.runAsync(
          `UPDATE designs
          SET deleted_at = CURRENT_TIMESTAMP
          WHERE pivot_project_id = ? OR field_map_id IN (
            SELECT id FROM field_maps WHERE project_record_id = ?
          )`,
          projectId,
          projectId,
        );
      });
    },

    async createCustomerAsync(input: { displayName: string; sortName?: string }): Promise<CustomerRecord> {
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      const displayName = normalizeCatalogSortName(input.displayName);
      const record: CustomerRecord = {
        id: createCatalogId("customer", now),
        displayName,
        sortName: normalizeCatalogSortName(input.sortName ?? displayName),
        createdAt: now,
        updatedAt: now,
      };
      await db.runAsync(
        `INSERT INTO customers (id, display_name, sort_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`,
        record.id,
        record.displayName,
        record.sortName,
        record.createdAt,
        record.updatedAt,
      );
      return record;
    },

    async createProjectRecordAsync(input: { id?: string; customerId: string; name: string; projectCrs: string; unitSystem: string }): Promise<CatalogProjectRecord> {
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      const record: CatalogProjectRecord = {
        id: input.id ?? createCatalogId("project", now),
        customerId: input.customerId,
        name: normalizeCatalogSortName(input.name),
        projectCrs: input.projectCrs,
        unitSystem: input.unitSystem,
        createdAt: now,
        updatedAt: now,
      };
      await db.runAsync(
        `INSERT INTO project_records (id, customer_id, name, project_crs, unit_system, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          customer_id = excluded.customer_id,
          name = excluded.name,
          project_crs = excluded.project_crs,
          unit_system = excluded.unit_system,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        record.id,
        record.customerId,
        record.name,
        record.projectCrs,
        record.unitSystem,
        record.createdAt,
        record.updatedAt,
      );
      return record;
    },

    async createFieldMapRecordAsync(input: { id?: string; projectId: string; name: string }): Promise<FieldMapRecord> {
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      const record: FieldMapRecord = {
        id: input.id ?? createCatalogId("field-map", now),
        projectId: input.projectId,
        name: normalizeCatalogSortName(input.name),
        createdAt: now,
        updatedAt: now,
      };
      await db.runAsync(
        `INSERT INTO field_maps (id, project_record_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_record_id = excluded.project_record_id,
          name = excluded.name,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        record.id,
        record.projectId,
        record.name,
        record.createdAt,
        record.updatedAt,
      );
      return record;
    },

    async createDesignRecordAsync(input: { id?: string; fieldMapId: string; name: string; pivotProjectId: string; isActive?: boolean }): Promise<DesignRecord> {
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      const record: DesignRecord = {
        id: input.id ?? createCatalogId("design", now),
        fieldMapId: input.fieldMapId,
        name: normalizeCatalogSortName(input.name),
        pivotProjectId: input.pivotProjectId,
        isActive: input.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      await db.runAsync(
        `INSERT INTO designs (id, field_map_id, name, pivot_project_id, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          field_map_id = excluded.field_map_id,
          name = excluded.name,
          pivot_project_id = excluded.pivot_project_id,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        record.id,
        record.fieldMapId,
        record.name,
        record.pivotProjectId,
        record.isActive ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      );
      return record;
    },
  };
  return repository;
}

async function readCatalogAsync(db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>): Promise<ProjectCatalog> {
  const customers = await db.getAllAsync<{
    id: string;
    display_name: string;
    sort_name: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, display_name, sort_name, created_at, updated_at FROM customers WHERE deleted_at IS NULL ORDER BY sort_name COLLATE NOCASE, display_name COLLATE NOCASE;");
  const projects = await db.getAllAsync<{
    id: string;
    customer_id: string;
    name: string;
    project_crs: string;
    unit_system: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, customer_id, name, project_crs, unit_system, created_at, updated_at FROM project_records WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE;");
  const fieldMaps = await db.getAllAsync<{
    id: string;
    project_record_id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, project_record_id, name, created_at, updated_at FROM field_maps WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE;");
  const designs = await db.getAllAsync<{
    id: string;
    field_map_id: string;
    name: string;
    pivot_project_id: string;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>("SELECT id, field_map_id, name, pivot_project_id, is_active, created_at, updated_at FROM designs WHERE deleted_at IS NULL ORDER BY is_active DESC, name COLLATE NOCASE;");
  return {
    customers: customers.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      sortName: row.sort_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    projects: projects.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      projectCrs: row.project_crs,
      unitSystem: row.unit_system,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    fieldMaps: fieldMaps.map((row) => ({
      id: row.id,
      projectId: row.project_record_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    designs: designs.map((row) => ({
      id: row.id,
      fieldMapId: row.field_map_id,
      name: row.name,
      pivotProjectId: row.pivot_project_id,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

async function ensureCatalogRowsAsync(db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>): Promise<void> {
  const existing = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL;",
  );
  if (Number(existing?.count ?? 0) > 0) return;
  const summaries = await db.getAllAsync<{
    id: string;
    name: string;
    project_crs: string;
    unit_system: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, name, project_crs, unit_system, created_at, updated_at FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC;");
  if (summaries.length === 0) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await insertLegacyCustomerAsync(db, now);
    for (const summary of summaries) {
      await db.runAsync(
        `INSERT OR IGNORE INTO project_records (id, customer_id, name, project_crs, unit_system, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        summary.id,
        LEGACY_CUSTOMER_ID,
        summary.name,
        summary.project_crs,
        summary.unit_system,
        summary.created_at,
        summary.updated_at,
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO field_maps (id, project_record_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`,
        defaultFieldMapId(summary.id),
        summary.id,
        "Primary Field Map",
        summary.created_at,
        summary.updated_at,
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO designs (id, field_map_id, name, pivot_project_id, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`,
        defaultDesignId(summary.id),
        defaultFieldMapId(summary.id),
        summary.name,
        summary.id,
        summary.created_at,
        summary.updated_at,
      );
    }
  });
}

async function ensureCatalogPathForProjectAsync(db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>, project: PivotProject): Promise<void> {
  const design = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM designs WHERE pivot_project_id = ? AND deleted_at IS NULL LIMIT 1;",
    project.id,
  );
  if (design) return;
  const now = new Date().toISOString();
  await insertLegacyCustomerAsync(db, now);
  await db.runAsync(
    `INSERT OR IGNORE INTO project_records (id, customer_id, name, project_crs, unit_system, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    project.id,
    LEGACY_CUSTOMER_ID,
    project.name,
    project.projectCrs,
    project.unitSystem,
    now,
    now,
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO field_maps (id, project_record_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`,
    defaultFieldMapId(project.id),
    project.id,
    "Primary Field Map",
    now,
    now,
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO designs (id, field_map_id, name, pivot_project_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)`,
    defaultDesignId(project.id),
    defaultFieldMapId(project.id),
    project.name,
    project.id,
    now,
    now,
  );
}

async function insertLegacyCustomerAsync(db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>, now: string): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO customers (id, display_name, sort_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`,
    LEGACY_CUSTOMER_ID,
    LEGACY_CUSTOMER_NAME,
    LEGACY_CUSTOMER_NAME,
    now,
    now,
  );
}
