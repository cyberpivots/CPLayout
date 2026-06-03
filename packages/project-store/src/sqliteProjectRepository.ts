import {
  parseLayoutDecisionRecord,
  parseLayoutEvidenceRecord,
  parseModelRecommendation,
  parseProjectDocument,
  serializeProjectDocument,
} from "@cplayout/core";
import type { LayoutDecisionRecord, LayoutEvidenceRecord, LayoutResult, ModelRecommendation, PivotProject } from "@cplayout/core";
import { buildSaveProjectStatementPlan } from "./projectPersistence";
import { LOAD_ACTIVE_PROJECT_BY_ID_SQL } from "./projectRepositorySql";
import {
  defaultDesignId,
  defaultFieldMapId,
  LEGACY_CUSTOMER_ID,
  LEGACY_CUSTOMER_NAME,
  assertCustomerPrimaryContact,
  normalizeCatalogSortName,
  normalizeCustomerRecord,
  createCatalogId,
} from "./projectCatalog";
import { openProjectDatabaseAsync } from "./sqliteProjectStore";
import type {
  CatalogProjectRecord,
  CreatedProjectFieldMapWorkspace,
  CreatedProjectWorkspace,
  CreateProjectWithInitialFieldMapInput,
  CreateProjectWithInitialDesignInput,
  CustomerRecord,
  CustomerProfileInput,
  CustomerProfileUpdateInput,
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
        await db.runAsync(
          `UPDATE projects
          SET deleted_at = CURRENT_TIMESTAMP
          WHERE id = ? OR id IN (
            SELECT d.pivot_project_id
            FROM designs d
            JOIN field_maps f ON f.id = d.field_map_id
            WHERE f.project_record_id = ? AND d.deleted_at IS NULL
          );`,
          projectId,
          projectId,
        );
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

    async createCustomerAsync(input: CustomerProfileInput): Promise<CustomerRecord> {
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      const record = normalizeCustomerRecord({
        id: createCatalogId("customer", now),
        ...input,
        createdAt: now,
        updatedAt: now,
      });
      if (!record) throw new Error("Customer folder could not be created.");
      assertCustomerPrimaryContact(record);
      await db.runAsync(
        `INSERT INTO customers (
          id,
          display_name,
          sort_name,
          company_name,
          contact_name,
          primary_contact_first_name,
          primary_contact_middle_initial,
          primary_contact_last_name,
          primary_contact_suffix,
          email,
          phone,
          location,
          notes,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.displayName,
        record.sortName,
        record.companyName,
        record.contactName,
        record.primaryContactFirstName,
        record.primaryContactMiddleInitial,
        record.primaryContactLastName,
        record.primaryContactSuffix,
        record.email,
        record.phone,
        record.location,
        record.notes,
        record.createdAt,
        record.updatedAt,
      );
      return record;
    },

    async updateCustomerAsync(input: CustomerProfileUpdateInput): Promise<CustomerRecord> {
      const db = await openProjectDatabaseAsync();
      const existing = await db.getFirstAsync<{
        id: string;
        display_name: string;
        sort_name: string;
        company_name: string | null;
        contact_name: string | null;
        primary_contact_first_name: string | null;
        primary_contact_middle_initial: string | null;
        primary_contact_last_name: string | null;
        primary_contact_suffix: string | null;
        email: string | null;
        phone: string | null;
        location: string | null;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT
          id,
          display_name,
          sort_name,
          company_name,
          contact_name,
          primary_contact_first_name,
          primary_contact_middle_initial,
          primary_contact_last_name,
          primary_contact_suffix,
          email,
          phone,
          location,
          notes,
          created_at,
          updated_at
        FROM customers
        WHERE id = ? AND deleted_at IS NULL;`,
        input.id,
      );
      if (!existing) throw new Error("Customer folder was not found in the local catalog.");
      const now = new Date().toISOString();
      const { id: _inputId, ...profileInput } = input;
      const record = normalizeCustomerRecord({
        id: existing.id,
        displayName: existing.display_name,
        sortName: existing.sort_name,
        companyName: textField(existing.company_name),
        contactName: textField(existing.contact_name),
        primaryContactFirstName: textField(existing.primary_contact_first_name),
        primaryContactMiddleInitial: textField(existing.primary_contact_middle_initial),
        primaryContactLastName: textField(existing.primary_contact_last_name),
        primaryContactSuffix: textField(existing.primary_contact_suffix),
        email: textField(existing.email),
        phone: textField(existing.phone),
        location: textField(existing.location),
        notes: textField(existing.notes),
        ...profileInput,
        createdAt: existing.created_at,
        updatedAt: now,
      });
      if (!record) throw new Error("Customer folder could not be updated.");
      assertCustomerPrimaryContact(record);
      await db.runAsync(
        `UPDATE customers
        SET
          display_name = ?,
          sort_name = ?,
          company_name = ?,
          contact_name = ?,
          primary_contact_first_name = ?,
          primary_contact_middle_initial = ?,
          primary_contact_last_name = ?,
          primary_contact_suffix = ?,
          email = ?,
          phone = ?,
          location = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ? AND deleted_at IS NULL;`,
        record.displayName,
        record.sortName,
        record.companyName,
        record.contactName,
        record.primaryContactFirstName,
        record.primaryContactMiddleInitial,
        record.primaryContactLastName,
        record.primaryContactSuffix,
        record.email,
        record.phone,
        record.location,
        record.notes,
        record.updatedAt,
        record.id,
      );
      return record;
    },

    async deleteCustomerAsync(customerId: string): Promise<void> {
      const db = await openProjectDatabaseAsync();
      const projectCount = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM project_records WHERE customer_id = ? AND deleted_at IS NULL;",
        customerId,
      );
      if (Number(projectCount?.count ?? 0) > 0) {
        throw new Error("Customer folder still contains projects. Move or delete those projects before deleting the customer.");
      }
      await db.runAsync("UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL;", customerId);
    },

    async createProjectWithInitialDesignAsync(input: CreateProjectWithInitialDesignInput): Promise<CreatedProjectWorkspace> {
      const db = await openProjectDatabaseAsync();
      const project = input.project;
      const now = new Date().toISOString();
      const projectRecord: CatalogProjectRecord = {
        id: project.id,
        customerId: input.customerId,
        name: normalizeCatalogSortName(project.name),
        projectCrs: project.projectCrs,
        unitSystem: project.unitSystem,
        createdAt: now,
        updatedAt: now,
      };
      const fieldMap: FieldMapRecord = {
        id: input.fieldMapId ?? defaultFieldMapId(project.id),
        projectId: project.id,
        name: normalizeCatalogSortName(input.fieldMapName ?? "Primary Field Map"),
        createdAt: now,
        updatedAt: now,
      };
      const design: DesignRecord = {
        id: input.designId ?? defaultDesignId(project.id),
        fieldMapId: fieldMap.id,
        name: normalizeCatalogSortName(input.designName ?? "Base Design"),
        pivotProjectId: project.id,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      await db.withTransactionAsync(async () => {
        const customer = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL;",
          input.customerId,
        );
        if (!customer) throw new Error("Select or create a customer folder before creating a project.");
        const plan = buildSaveProjectStatementPlan(project, input.result);
        for (const statement of plan) await db.runAsync(statement.sql, statement.params);
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
          projectRecord.id,
          projectRecord.customerId,
          projectRecord.name,
          projectRecord.projectCrs,
          projectRecord.unitSystem,
          projectRecord.createdAt,
          projectRecord.updatedAt,
        );
        await db.runAsync(
          `INSERT INTO field_maps (id, project_record_id, name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            project_record_id = excluded.project_record_id,
            name = excluded.name,
            updated_at = excluded.updated_at,
            deleted_at = NULL`,
          fieldMap.id,
          fieldMap.projectId,
          fieldMap.name,
          fieldMap.createdAt,
          fieldMap.updatedAt,
        );
        await db.runAsync(
          `INSERT INTO designs (id, field_map_id, name, pivot_project_id, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            field_map_id = excluded.field_map_id,
            name = excluded.name,
            pivot_project_id = excluded.pivot_project_id,
            is_active = excluded.is_active,
            updated_at = excluded.updated_at,
            deleted_at = NULL`,
          design.id,
          design.fieldMapId,
          design.name,
          design.pivotProjectId,
          design.createdAt,
          design.updatedAt,
        );
      });
      return { project, projectRecord, fieldMap, design };
    },

    async createProjectWithInitialFieldMapAsync(input: CreateProjectWithInitialFieldMapInput): Promise<CreatedProjectFieldMapWorkspace> {
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      const projectId = input.projectId ?? createCatalogId("project", now);
      const projectRecord: CatalogProjectRecord = {
        id: projectId,
        customerId: input.customerId,
        name: normalizeCatalogSortName(input.projectName),
        projectCrs: normalizeCatalogSortName(input.projectCrs),
        unitSystem: normalizeCatalogSortName(input.unitSystem),
        createdAt: now,
        updatedAt: now,
      };
      const fieldMap: FieldMapRecord = {
        id: input.fieldMapId ?? defaultFieldMapId(projectId),
        projectId,
        name: normalizeCatalogSortName(input.fieldMapName ?? "Primary Field Map"),
        createdAt: now,
        updatedAt: now,
      };
      await db.withTransactionAsync(async () => {
        const customer = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL;",
          input.customerId,
        );
        if (!customer) throw new Error("Select or create a customer folder before creating a project.");
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
          projectRecord.id,
          projectRecord.customerId,
          projectRecord.name,
          projectRecord.projectCrs,
          projectRecord.unitSystem,
          projectRecord.createdAt,
          projectRecord.updatedAt,
        );
        await db.runAsync(
          `INSERT INTO field_maps (id, project_record_id, name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            project_record_id = excluded.project_record_id,
            name = excluded.name,
            updated_at = excluded.updated_at,
            deleted_at = NULL`,
          fieldMap.id,
          fieldMap.projectId,
          fieldMap.name,
          fieldMap.createdAt,
          fieldMap.updatedAt,
        );
      });
      return { projectRecord, fieldMap };
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

    async renameProjectAsync(projectId: string, name: string): Promise<CatalogProjectRecord> {
      const db = await openProjectDatabaseAsync();
      const trimmedName = normalizeCatalogSortName(name);
      const now = new Date().toISOString();
      let updatedRecord: CatalogProjectRecord | null = null;
      await db.withTransactionAsync(async () => {
        const projectRecord = await db.getFirstAsync<{
          id: string;
          customer_id: string;
          name: string;
          project_crs: string;
          unit_system: string;
          created_at: string;
          updated_at: string;
        }>(
          "SELECT id, customer_id, name, project_crs, unit_system, created_at, updated_at FROM project_records WHERE id = ? AND deleted_at IS NULL;",
          projectId,
        );
        if (!projectRecord) throw new Error("Project folder was not found in the local catalog.");
        updatedRecord = {
          id: projectRecord.id,
          customerId: projectRecord.customer_id,
          name: trimmedName,
          projectCrs: projectRecord.project_crs,
          unitSystem: projectRecord.unit_system,
          createdAt: projectRecord.created_at,
          updatedAt: now,
        };
        await db.runAsync(
          "UPDATE projects SET name = ?, updated_at = ?, deleted_at = NULL WHERE id = ?;",
          trimmedName,
          now,
          projectId,
        );
        const snapshot = await db.getFirstAsync<{ project_json: string }>(
          LOAD_ACTIVE_PROJECT_BY_ID_SQL,
          projectId,
        );
        if (snapshot) {
          const updatedProject = { ...parseProjectDocument(snapshot.project_json), name: trimmedName };
          await db.runAsync(
            "UPDATE project_snapshots SET project_json = ?, updated_at = ? WHERE project_id = ?;",
            serializeProjectDocument(updatedProject),
            now,
            projectId,
          );
        }
        await db.runAsync(
          "UPDATE project_records SET name = ?, updated_at = ?, deleted_at = NULL WHERE id = ?;",
          trimmedName,
          now,
          projectId,
        );
      });
      if (!updatedRecord) throw new Error("Project folder was not found in the local catalog.");
      return updatedRecord;
    },

    async moveProjectToCustomerAsync(projectId: string, customerId: string): Promise<CatalogProjectRecord> {
      const db = await openProjectDatabaseAsync();
      const now = new Date().toISOString();
      let moved: CatalogProjectRecord | null = null;
      await db.withTransactionAsync(async () => {
        const customer = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL;",
          customerId,
        );
        if (!customer) throw new Error("Target customer folder was not found in the local catalog.");
        const projectRecord = await db.getFirstAsync<{
          id: string;
          customer_id: string;
          name: string;
          project_crs: string;
          unit_system: string;
          created_at: string;
          updated_at: string;
        }>(
          "SELECT id, customer_id, name, project_crs, unit_system, created_at, updated_at FROM project_records WHERE id = ? AND deleted_at IS NULL;",
          projectId,
        );
        if (!projectRecord) throw new Error("Project folder was not found in the local catalog.");
        moved = {
          id: projectRecord.id,
          customerId,
          name: projectRecord.name,
          projectCrs: projectRecord.project_crs,
          unitSystem: projectRecord.unit_system,
          createdAt: projectRecord.created_at,
          updatedAt: now,
        };
        await db.runAsync(
          "UPDATE project_records SET customer_id = ?, updated_at = ?, deleted_at = NULL WHERE id = ?;",
          customerId,
          now,
          projectId,
        );
      });
      if (!moved) throw new Error("Project folder was not found in the local catalog.");
      return moved;
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
      await db.withTransactionAsync(async () => {
        const fieldMap = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM field_maps WHERE id = ? AND deleted_at IS NULL;",
          input.fieldMapId,
        );
        if (!fieldMap) throw new Error("Field map was not found in the local catalog.");
        const pivotProject = await db.getFirstAsync<{ id: string }>(
          "SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL;",
          input.pivotProjectId,
        );
        if (!pivotProject) throw new Error("Create or import a saved design project before adding a design row.");
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
      });
      return record;
    },

    async loadProjectReviewDataAsync(projectId: string) {
      const db = await openProjectDatabaseAsync();
      const evidenceRows = await db.getAllAsync<{ record_json: string }>(
        "SELECT record_json FROM layout_evidence WHERE project_id = ? ORDER BY created_at ASC, id ASC;",
        projectId,
      );
      const recommendationRows = await db.getAllAsync<{ recommendation_json: string }>(
        "SELECT recommendation_json FROM model_recommendations WHERE project_id = ? ORDER BY created_at ASC, id ASC;",
        projectId,
      );
      const decisionRows = await db.getAllAsync<{ decision_json: string }>(
        "SELECT decision_json FROM layout_decisions WHERE project_id = ? ORDER BY created_at ASC, id ASC;",
        projectId,
      );
      return {
        evidenceRecords: evidenceRows.map((row) => parseLayoutEvidenceRecord(JSON.parse(row.record_json))),
        modelRecommendations: recommendationRows.map((row) => parseModelRecommendation(JSON.parse(row.recommendation_json))),
        layoutDecisions: decisionRows.map((row) => parseLayoutDecisionRecord(JSON.parse(row.decision_json))),
      };
    },

    async saveProjectReviewDataAsync(projectId: string, data) {
      const evidenceRecords = data.evidenceRecords.map(parseLayoutEvidenceRecord);
      const modelRecommendations = data.modelRecommendations.map(parseModelRecommendation);
      const layoutDecisions = data.layoutDecisions.map(parseLayoutDecisionRecord);
      for (const record of [...evidenceRecords, ...modelRecommendations, ...layoutDecisions]) {
        if (record.projectId !== projectId) {
          throw new Error(`Project review record ${record.id} belongs to ${record.projectId}, not ${projectId}.`);
        }
      }

      const db = await openProjectDatabaseAsync();
      await db.withTransactionAsync(async () => {
        await db.runAsync("DELETE FROM layout_evidence WHERE project_id = ?;", projectId);
        await db.runAsync("DELETE FROM model_recommendations WHERE project_id = ?;", projectId);
        await db.runAsync("DELETE FROM layout_decisions WHERE project_id = ?;", projectId);
        for (const record of evidenceRecords) {
          await insertLayoutEvidenceRecordAsync(db, record);
        }
        for (const recommendation of modelRecommendations) {
          await insertModelRecommendationAsync(db, recommendation);
        }
        for (const decision of layoutDecisions) {
          await insertLayoutDecisionRecordAsync(db, decision);
        }
      });
    },
  };
  return repository;
}

async function insertLayoutEvidenceRecordAsync(
  db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>,
  record: LayoutEvidenceRecord,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO layout_evidence (
      id,
      project_id,
      source_kind,
      project_crs,
      confidence,
      review_status,
      record_json,
      created_at,
      collected_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      source_kind = excluded.source_kind,
      project_crs = excluded.project_crs,
      confidence = excluded.confidence,
      review_status = excluded.review_status,
      record_json = excluded.record_json,
      created_at = excluded.created_at,
      collected_at = excluded.collected_at`,
    record.id,
    record.projectId,
    record.sourceKind,
    record.projectCrs ?? "",
    record.confidence,
    record.reviewStatus,
    JSON.stringify(record),
    record.createdAt,
    record.collectedAt ?? null,
  );
}

async function insertModelRecommendationAsync(
  db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>,
  recommendation: ModelRecommendation,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO model_recommendations (
      id,
      project_id,
      model_name,
      model_version,
      project_crs,
      confidence,
      review_status,
      score,
      recommendation_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      model_name = excluded.model_name,
      model_version = excluded.model_version,
      project_crs = excluded.project_crs,
      confidence = excluded.confidence,
      review_status = excluded.review_status,
      score = excluded.score,
      recommendation_json = excluded.recommendation_json,
      created_at = excluded.created_at`,
    recommendation.id,
    recommendation.projectId,
    recommendation.modelName,
    recommendation.modelVersion,
    recommendation.projectCrs,
    recommendation.confidence,
    recommendation.reviewStatus,
    recommendation.score ?? null,
    JSON.stringify(recommendation),
    recommendation.createdAt,
  );
}

async function insertLayoutDecisionRecordAsync(
  db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>,
  decision: LayoutDecisionRecord,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO layout_decisions (
      id,
      project_id,
      recommendation_id,
      decided_by,
      decision,
      decision_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      recommendation_id = excluded.recommendation_id,
      decided_by = excluded.decided_by,
      decision = excluded.decision,
      decision_json = excluded.decision_json,
      created_at = excluded.created_at`,
    decision.id,
    decision.projectId,
    decision.recommendationId ?? null,
    decision.decidedBy,
    decision.decision,
    JSON.stringify(decision),
    decision.createdAt,
  );
}

async function readCatalogAsync(db: Awaited<ReturnType<typeof openProjectDatabaseAsync>>): Promise<ProjectCatalog> {
  const customers = await db.getAllAsync<{
    id: string;
    display_name: string;
    sort_name: string;
    company_name: string | null;
    contact_name: string | null;
    primary_contact_first_name: string | null;
    primary_contact_middle_initial: string | null;
    primary_contact_last_name: string | null;
    primary_contact_suffix: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
      id,
      display_name,
      sort_name,
      company_name,
      contact_name,
      primary_contact_first_name,
      primary_contact_middle_initial,
      primary_contact_last_name,
      primary_contact_suffix,
      email,
      phone,
      location,
      notes,
      created_at,
      updated_at
    FROM customers
    WHERE deleted_at IS NULL
    ORDER BY sort_name COLLATE NOCASE, display_name COLLATE NOCASE;`,
  );
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
    customers: customers
      .map((row) => normalizeCustomerRecord({
        id: row.id,
        displayName: row.display_name,
        sortName: row.sort_name,
        companyName: textField(row.company_name),
        contactName: textField(row.contact_name),
        primaryContactFirstName: textField(row.primary_contact_first_name),
        primaryContactMiddleInitial: textField(row.primary_contact_middle_initial),
        primaryContactLastName: textField(row.primary_contact_last_name),
        primaryContactSuffix: textField(row.primary_contact_suffix),
        email: textField(row.email),
        phone: textField(row.phone),
        location: textField(row.location),
        notes: textField(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
      .filter((customer): customer is CustomerRecord => Boolean(customer)),
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
    `INSERT OR IGNORE INTO customers (
      id,
      display_name,
      sort_name,
      company_name,
      contact_name,
      primary_contact_first_name,
      primary_contact_middle_initial,
      primary_contact_last_name,
      primary_contact_suffix,
      email,
      phone,
      location,
      notes,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, '', '', '', '', '', '', '', '', '', '', ?, ?)`,
    LEGACY_CUSTOMER_ID,
    LEGACY_CUSTOMER_NAME,
    LEGACY_CUSTOMER_NAME,
    now,
    now,
  );
}

function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
}
