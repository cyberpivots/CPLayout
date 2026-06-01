import { parseProjectDocument, serializeProjectDocument } from "@cplayout/core";
import type { LayoutResult, PivotProject } from "@cplayout/core";
import {
  createCatalogId,
  emptyProjectCatalog,
  ensureCatalogEntryForProject,
  ensureLegacyCatalogForSummaries,
  normalizeCatalogSortName,
  sortProjectCatalog,
} from "./projectCatalog";
import type {
  CatalogProjectRecord,
  CustomerRecord,
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
    return sortProjectCatalog({
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      fieldMaps: Array.isArray(parsed.fieldMaps) ? parsed.fieldMaps : [],
      designs: Array.isArray(parsed.designs) ? parsed.designs : [],
    });
  } catch {
    return emptyProjectCatalog();
  }
}

function writeCatalogStore(catalog: ProjectCatalog): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(sortProjectCatalog(catalog)));
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
    if (catalog.customers.length === 0) {
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
    delete store[projectId];
    writeStore(store);
    const catalog = await ensureCatalogAsync();
    const projectIds = new Set([projectId]);
    const fieldMapIds = new Set(catalog.fieldMaps.filter((fieldMap) => projectIds.has(fieldMap.projectId)).map((fieldMap) => fieldMap.id));
    writeCatalogStore({
      customers: catalog.customers,
      projects: catalog.projects.filter((record) => !projectIds.has(record.id)),
      fieldMaps: catalog.fieldMaps.filter((record) => !projectIds.has(record.projectId)),
      designs: catalog.designs.filter((record) => !fieldMapIds.has(record.fieldMapId) && record.pivotProjectId !== projectId),
    });
  },

  async createCustomerAsync(input: { displayName: string; sortName?: string }): Promise<CustomerRecord> {
    const catalog = await ensureCatalogAsync();
    const now = new Date().toISOString();
    const displayName = normalizeCatalogSortName(input.displayName);
    const customer: CustomerRecord = {
      id: createCatalogId("customer", now),
      displayName,
      sortName: normalizeCatalogSortName(input.sortName ?? displayName),
      createdAt: now,
      updatedAt: now,
    };
    writeCatalogStore({ ...catalog, customers: [...catalog.customers, customer] });
    return customer;
  },

  async createProjectRecordAsync(input: { id?: string; customerId: string; name: string; projectCrs: string; unitSystem: string }): Promise<CatalogProjectRecord> {
    const catalog = await ensureCatalogAsync();
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
    writeCatalogStore({ ...catalog, projects: upsertById(catalog.projects, record) });
    return record;
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
