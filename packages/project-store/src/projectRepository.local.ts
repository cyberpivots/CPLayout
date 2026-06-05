import { parseProjectDocument, serializeProjectDocument } from "@cplayout/core";
import type { LayoutResult, PivotProject } from "@cplayout/core";
import {
  createCatalogId,
  defaultDesignId,
  defaultFieldMapId,
  emptyProjectCatalog,
  ensureCatalogEntryForProject,
  ensureLegacyCatalogForSummaries,
  assertClientPrimaryContact,
  normalizeClientRecord,
  normalizeProjectCatalog,
  normalizeCatalogSortName,
} from "./projectCatalog";
import type {
  CatalogProjectRecord,
  CreatedProjectFieldMapWorkspace,
  CreatedProjectWorkspace,
  CreateProjectWithInitialFieldMapInput,
  CreateProjectWithInitialDesignInput,
  ClientRecord,
  ClientProfileInput,
  ClientProfileUpdateInput,
  DesignRecord,
  FieldMapRecord,
  ProjectCatalog,
  ProjectRepository,
  ProjectSummary,
} from "./projectRepositoryTypes";

const STORAGE_KEY = "center-pivot-layout-projects-v1";
const CATALOG_STORAGE_KEY = "center-pivot-layout-project-catalog-v1";

interface StoredProject {
  summary: ProjectSummary;
  document: string;
}

function readStore(): Record<string, StoredProject> {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, StoredProject>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredProject>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function readCatalogStore(): ProjectCatalog {
  if (typeof localStorage === "undefined") return emptyProjectCatalog();
  const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
  if (!raw) return emptyProjectCatalog();
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectCatalog>;
    const catalog = normalizeProjectCatalog(parsed);
    const serialized = JSON.stringify(catalog);
    if (serialized !== raw) localStorage.setItem(CATALOG_STORAGE_KEY, serialized);
    return catalog;
  } catch {
    return emptyProjectCatalog();
  }
}

function writeCatalogStore(catalog: ProjectCatalog): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(normalizeProjectCatalog(catalog)));
}

async function ensureCatalogAsync(): Promise<ProjectCatalog> {
  const catalog = readCatalogStore();
  const summaries = await localStorageProjectRepository.listProjectsAsync();
  const migrated = ensureLegacyCatalogForSummaries(catalog, summaries);
  if (migrated !== catalog) writeCatalogStore(migrated);
  return migrated;
}

export const localStorageProjectRepository: ProjectRepository = {
  backendLabel: "Browser local storage",

  async getBackendInfoAsync() {
    const projects = await localStorageProjectRepository.listProjectsAsync();
    return {
      backendLabel: localStorageProjectRepository.backendLabel,
      runtime: "web",
      storageEngine: "local_storage",
      durable: typeof localStorage !== "undefined",
      projectCount: projects.length,
      supportsProjectList: true,
      supportsZipImport: true,
      supportsZipExport: true,
      notes: [
        "Web MVP uses browser localStorage until Expo SQLite web is configured with WASM and COOP/COEP headers.",
        "ZIP export uses browser download APIs instead of native file sharing.",
      ],
    };
  },

  async listProjectsAsync(): Promise<ProjectSummary[]> {
    return Object.values(readStore())
      .map((entry) => entry.summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async listProjectCatalogAsync(): Promise<ProjectCatalog> {
    return ensureCatalogAsync();
  },

  async saveProjectAsync(project: PivotProject, _result?: LayoutResult): Promise<void> {
    const updatedAt = new Date().toISOString();
    const store = readStore();
    store[project.id] = {
      summary: {
        id: project.id,
        name: project.name,
        projectCrs: project.projectCrs,
        unitSystem: project.unitSystem,
        updatedAt,
      },
      document: serializeProjectDocument(project),
    };
    writeStore(store);
    const catalog = readCatalogStore();
    if (catalog.clients.length === 0) {
      writeCatalogStore(ensureCatalogEntryForProject(catalog, project));
    }
  },

  async saveDesignProjectAsync(designId: string, project: PivotProject, result?: LayoutResult): Promise<void> {
    await localStorageProjectRepository.saveProjectAsync(project, result);
    const catalog = await ensureCatalogAsync();
    const now = new Date().toISOString();
    writeCatalogStore({
      ...catalog,
      designs: catalog.designs.map((design) => design.id === designId
        ? { ...design, name: project.name, pivotProjectId: project.id, updatedAt: now }
        : design),
      projects: catalog.projects.map((record) => record.id === project.id
        ? { ...record, name: project.name, projectCrs: project.projectCrs, unitSystem: project.unitSystem, updatedAt: now }
        : record),
    });
  },

  async loadProjectAsync(projectId: string): Promise<PivotProject | null> {
    const entry = readStore()[projectId];
    return entry ? parseProjectDocument(entry.document) : null;
  },

  async loadDesignProjectAsync(designId: string): Promise<PivotProject | null> {
    const catalog = await ensureCatalogAsync();
    const design = catalog.designs.find((record) => record.id === designId);
    return design ? localStorageProjectRepository.loadProjectAsync(design.pivotProjectId) : null;
  },

  async deleteProjectAsync(projectId: string): Promise<void> {
    const store = readStore();
    const catalog = await ensureCatalogAsync();
    const projectIds = new Set([projectId]);
    const fieldMapIds = new Set(catalog.fieldMaps.filter((fieldMap) => projectIds.has(fieldMap.projectId)).map((fieldMap) => fieldMap.id));
    const pivotProjectIds = new Set(
      catalog.designs
        .filter((record) => fieldMapIds.has(record.fieldMapId) || record.pivotProjectId === projectId)
        .map((record) => record.pivotProjectId),
    );
    pivotProjectIds.add(projectId);
    for (const pivotProjectId of pivotProjectIds) delete store[pivotProjectId];
    writeStore(store);
    writeCatalogStore({
      clients: catalog.clients,
      projects: catalog.projects.filter((record) => !projectIds.has(record.id)),
      fieldMaps: catalog.fieldMaps.filter((record) => !projectIds.has(record.projectId)),
      designs: catalog.designs.filter((record) => !fieldMapIds.has(record.fieldMapId) && record.pivotProjectId !== projectId),
    });
  },

  async createClientAsync(input: ClientProfileInput): Promise<ClientRecord> {
    const catalog = await ensureCatalogAsync();
    const now = new Date().toISOString();
    const client = normalizeClientRecord({
      id: createCatalogId("client", now),
      ...input,
      createdAt: now,
      updatedAt: now,
    });
    if (!client) throw new Error("Client folder could not be created.");
    assertClientPrimaryContact(client);
    writeCatalogStore({ ...catalog, clients: [...catalog.clients, client] });
    return client;
  },

  async updateClientAsync(input: ClientProfileUpdateInput): Promise<ClientRecord> {
    const catalog = await ensureCatalogAsync();
    const existing = catalog.clients.find((record) => record.id === input.id);
    if (!existing) throw new Error("Client folder was not found in the local catalog.");
    const now = new Date().toISOString();
    const { id: _inputId, ...profileInput } = input;
    const updated = normalizeClientRecord({
      ...existing,
      ...profileInput,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    if (!updated) throw new Error("Client folder could not be updated.");
    assertClientPrimaryContact(updated);
    writeCatalogStore({
      ...catalog,
      clients: catalog.clients.map((record) => record.id === updated.id ? updated : record),
    });
    return updated;
  },

  async deleteClientAsync(clientId: string): Promise<void> {
    const catalog = await ensureCatalogAsync();
    const projectCount = catalog.projects.filter((record) => record.clientId === clientId).length;
    if (projectCount > 0) {
      throw new Error("Client folder still contains projects. Move or delete those projects before deleting the client.");
    }
    writeCatalogStore({
      ...catalog,
      clients: catalog.clients.filter((record) => record.id !== clientId),
    });
  },

  async createProjectWithInitialDesignAsync(input: CreateProjectWithInitialDesignInput): Promise<CreatedProjectWorkspace> {
    const catalog = await ensureCatalogAsync();
    const client = catalog.clients.find((record) => record.id === input.clientId);
    if (!client) throw new Error("Select or create a client folder before creating a project.");
    const now = new Date().toISOString();
    const project = input.project;
    const projectRecord: CatalogProjectRecord = {
      id: project.id,
      clientId: client.id,
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
    const store = readStore();
    store[project.id] = {
      summary: {
        id: project.id,
        name: project.name,
        projectCrs: project.projectCrs,
        unitSystem: project.unitSystem,
        updatedAt: now,
      },
      document: serializeProjectDocument(project),
    };
    writeStore(store);
    writeCatalogStore({
      clients: catalog.clients,
      projects: upsertById(catalog.projects, projectRecord),
      fieldMaps: upsertById(catalog.fieldMaps, fieldMap),
      designs: upsertById(catalog.designs, design),
    });
    return { project, projectRecord, fieldMap, design };
  },

  async createProjectWithInitialFieldMapAsync(input: CreateProjectWithInitialFieldMapInput): Promise<CreatedProjectFieldMapWorkspace> {
    const catalog = await ensureCatalogAsync();
    const client = catalog.clients.find((record) => record.id === input.clientId);
    if (!client) throw new Error("Select or create a client folder before creating a project.");
    const now = new Date().toISOString();
    const projectId = input.projectId ?? createCatalogId("project", now);
    const projectRecord: CatalogProjectRecord = {
      id: projectId,
      clientId: client.id,
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
    writeCatalogStore({
      clients: catalog.clients,
      projects: upsertById(catalog.projects, projectRecord),
      fieldMaps: upsertById(catalog.fieldMaps, fieldMap),
      designs: catalog.designs,
    });
    return { projectRecord, fieldMap };
  },

  async createProjectRecordAsync(input: { id?: string; clientId: string; name: string; projectCrs: string; unitSystem: string }): Promise<CatalogProjectRecord> {
    const catalog = await ensureCatalogAsync();
    const now = new Date().toISOString();
    const record: CatalogProjectRecord = {
      id: input.id ?? createCatalogId("project", now),
      clientId: input.clientId,
      name: normalizeCatalogSortName(input.name),
      projectCrs: input.projectCrs,
      unitSystem: input.unitSystem,
      createdAt: now,
      updatedAt: now,
    };
    writeCatalogStore({ ...catalog, projects: upsertById(catalog.projects, record) });
    return record;
  },

  async renameProjectAsync(projectId: string, name: string): Promise<CatalogProjectRecord> {
    const trimmedName = normalizeCatalogSortName(name);
    const store = readStore();
    const entry = store[projectId];
    const now = new Date().toISOString();
    if (entry) {
      const project = parseProjectDocument(entry.document);
      const updatedProject = { ...project, name: trimmedName };
      store[projectId] = {
        summary: {
          ...entry.summary,
          name: trimmedName,
          updatedAt: now,
        },
        document: serializeProjectDocument(updatedProject),
      };
      writeStore(store);
    }
    const catalog = await ensureCatalogAsync();
    const existingRecord = catalog.projects.find((record) => record.id === projectId);
    if (!existingRecord) throw new Error("Project folder was not found in the local catalog.");
    const updatedRecord = { ...existingRecord, name: trimmedName, updatedAt: now };
    writeCatalogStore({
      ...catalog,
      projects: catalog.projects.map((record) => record.id === projectId ? updatedRecord : record),
    });
    return updatedRecord;
  },

  async moveProjectToClientAsync(projectId: string, clientId: string): Promise<CatalogProjectRecord> {
    const catalog = await ensureCatalogAsync();
    if (!catalog.clients.some((record) => record.id === clientId)) {
      throw new Error("Target client folder was not found in the local catalog.");
    }
    const projectRecord = catalog.projects.find((record) => record.id === projectId);
    if (!projectRecord) throw new Error("Project folder was not found in the local catalog.");
    const now = new Date().toISOString();
    const moved = { ...projectRecord, clientId, updatedAt: now };
    writeCatalogStore({
      ...catalog,
      projects: catalog.projects.map((record) => record.id === projectId ? moved : record),
    });
    return moved;
  },

  async createFieldMapRecordAsync(input: { id?: string; projectId: string; name: string }): Promise<FieldMapRecord> {
    const catalog = await ensureCatalogAsync();
    const now = new Date().toISOString();
    const record: FieldMapRecord = {
      id: input.id ?? createCatalogId("field-map", now),
      projectId: input.projectId,
      name: normalizeCatalogSortName(input.name),
      createdAt: now,
      updatedAt: now,
    };
    writeCatalogStore({ ...catalog, fieldMaps: upsertById(catalog.fieldMaps, record) });
    return record;
  },

  async createDesignRecordAsync(input: { id?: string; fieldMapId: string; name: string; pivotProjectId: string; isActive?: boolean }): Promise<DesignRecord> {
    const catalog = await ensureCatalogAsync();
    if (!catalog.fieldMaps.some((record) => record.id === input.fieldMapId)) {
      throw new Error("Field map was not found in the local catalog.");
    }
    const storedProject = readStore()[input.pivotProjectId];
    if (!storedProject) {
      throw new Error("Create or import a saved design project before adding a design row.");
    }
    parseProjectDocument(storedProject.document);
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
    writeCatalogStore({ ...catalog, designs: upsertById(catalog.designs, record) });
    return record;
  },
};

export const projectRepository = localStorageProjectRepository;

export type { ProjectSummary } from "./projectRepositoryTypes";

function upsertById<T extends { id: string }>(records: T[], next: T): T[] {
  return records.some((record) => record.id === next.id)
    ? records.map((record) => record.id === next.id ? next : record)
    : [...records, next];
}
