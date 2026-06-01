import type { PivotProject } from "@cplayout/core";
import type {
  CatalogProjectRecord,
  CustomerRecord,
  DesignRecord,
  FieldMapRecord,
  ProjectCatalog,
  ProjectSummary,
} from "./projectRepositoryTypes";

export const LEGACY_CUSTOMER_ID = "example-customer";
export const LEGACY_CUSTOMER_NAME = "Example Customer";

export function emptyProjectCatalog(): ProjectCatalog {
  return {
    customers: [],
    projects: [],
    fieldMaps: [],
    designs: [],
  };
}

export function normalizeCatalogSortName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : LEGACY_CUSTOMER_NAME;
}

export function createCatalogId(prefix: string, seed = new Date().toISOString()): string {
  const cleanedSeed = seed.replace(/[^0-9a-z]/gi, "").toLowerCase();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${cleanedSeed.slice(0, 14)}-${randomSuffix}`;
}

export function sortProjectCatalog(catalog: ProjectCatalog): ProjectCatalog {
  return {
    customers: [...catalog.customers].sort((a, b) => compareByName(a.sortName, b.sortName)),
    projects: [...catalog.projects].sort((a, b) => compareByName(a.name, b.name)),
    fieldMaps: [...catalog.fieldMaps].sort((a, b) => compareByName(a.name, b.name)),
    designs: [...catalog.designs].sort((a, b) => compareByName(a.name, b.name)),
  };
}

export function ensureLegacyCatalogForSummaries(catalog: ProjectCatalog, summaries: ProjectSummary[]): ProjectCatalog {
  if (catalog.customers.length > 0 || summaries.length === 0) return sortProjectCatalog(catalog);
  const now = new Date().toISOString();
  const customers: CustomerRecord[] = [{
    id: LEGACY_CUSTOMER_ID,
    displayName: LEGACY_CUSTOMER_NAME,
    sortName: LEGACY_CUSTOMER_NAME,
    createdAt: now,
    updatedAt: now,
  }];
  const projects: CatalogProjectRecord[] = summaries.map((summary) => ({
    id: summary.id,
    customerId: LEGACY_CUSTOMER_ID,
    name: summary.name,
    projectCrs: summary.projectCrs,
    unitSystem: summary.unitSystem,
    createdAt: summary.updatedAt,
    updatedAt: summary.updatedAt,
  }));
  const fieldMaps: FieldMapRecord[] = summaries.map((summary) => ({
    id: defaultFieldMapId(summary.id),
    projectId: summary.id,
    name: "Primary Field Map",
    createdAt: summary.updatedAt,
    updatedAt: summary.updatedAt,
  }));
  const designs: DesignRecord[] = summaries.map((summary) => ({
    id: defaultDesignId(summary.id),
    fieldMapId: defaultFieldMapId(summary.id),
    name: summary.name,
    pivotProjectId: summary.id,
    isActive: true,
    createdAt: summary.updatedAt,
    updatedAt: summary.updatedAt,
  }));
  return sortProjectCatalog({ customers, projects, fieldMaps, designs });
}

export function ensureCatalogEntryForProject(catalog: ProjectCatalog, project: PivotProject): ProjectCatalog {
  const now = new Date().toISOString();
  const next = {
    customers: [...catalog.customers],
    projects: [...catalog.projects],
    fieldMaps: [...catalog.fieldMaps],
    designs: [...catalog.designs],
  };
  if (!next.customers.some((customer) => customer.id === LEGACY_CUSTOMER_ID)) {
    next.customers.push({
      id: LEGACY_CUSTOMER_ID,
      displayName: LEGACY_CUSTOMER_NAME,
      sortName: LEGACY_CUSTOMER_NAME,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!next.projects.some((record) => record.id === project.id)) {
    next.projects.push({
      id: project.id,
      customerId: LEGACY_CUSTOMER_ID,
      name: project.name,
      projectCrs: project.projectCrs,
      unitSystem: project.unitSystem,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!next.fieldMaps.some((record) => record.projectId === project.id)) {
    next.fieldMaps.push({
      id: defaultFieldMapId(project.id),
      projectId: project.id,
      name: "Primary Field Map",
      createdAt: now,
      updatedAt: now,
    });
  }
  const fieldMapId = next.fieldMaps.find((record) => record.projectId === project.id)?.id ?? defaultFieldMapId(project.id);
  if (!next.designs.some((record) => record.pivotProjectId === project.id)) {
    next.designs.push({
      id: defaultDesignId(project.id),
      fieldMapId,
      name: project.name,
      pivotProjectId: project.id,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  return sortProjectCatalog(next);
}

export function defaultFieldMapId(projectId: string): string {
  return `${projectId}:field-map:primary`;
}

export function defaultDesignId(projectId: string): string {
  return `${projectId}:design:primary`;
}

function compareByName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}
