import type { LayoutResult, PivotProject } from "@cplayout/core";

export interface CustomerRecord {
  id: string;
  displayName: string;
  sortName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProjectRecord {
  id: string;
  customerId: string;
  name: string;
  projectCrs: string;
  unitSystem: string;
  createdAt: string;
  updatedAt: string;
}

export interface FieldMapRecord {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignRecord {
  id: string;
  fieldMapId: string;
  name: string;
  pivotProjectId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCatalog {
  customers: CustomerRecord[];
  projects: CatalogProjectRecord[];
  fieldMaps: FieldMapRecord[];
  designs: DesignRecord[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  projectCrs: string;
  unitSystem: string;
  updatedAt: string;
}

export interface ProjectRepositoryBackendInfo {
  backendLabel: string;
  runtime: "native" | "web";
  storageEngine: "sqlite" | "local_storage";
  durable: boolean;
  schemaVersion?: number;
  projectCount?: number;
  supportsProjectList: boolean;
  supportsZipImport: boolean;
  supportsZipExport: boolean;
  notes: string[];
}

export interface ProjectRepository {
  listProjectsAsync(): Promise<ProjectSummary[]>;
  listProjectCatalogAsync(): Promise<ProjectCatalog>;
  saveProjectAsync(project: PivotProject, result?: LayoutResult): Promise<void>;
  saveDesignProjectAsync(designId: string, project: PivotProject, result?: LayoutResult): Promise<void>;
  loadProjectAsync(projectId: string): Promise<PivotProject | null>;
  loadDesignProjectAsync(designId: string): Promise<PivotProject | null>;
  deleteProjectAsync(projectId: string): Promise<void>;
  createCustomerAsync(input: { displayName: string; sortName?: string }): Promise<CustomerRecord>;
  createProjectRecordAsync(input: { id?: string; customerId: string; name: string; projectCrs: string; unitSystem: string }): Promise<CatalogProjectRecord>;
  createFieldMapRecordAsync(input: { id?: string; projectId: string; name: string }): Promise<FieldMapRecord>;
  createDesignRecordAsync(input: { id?: string; fieldMapId: string; name: string; pivotProjectId: string; isActive?: boolean }): Promise<DesignRecord>;
  getBackendInfoAsync(): Promise<ProjectRepositoryBackendInfo>;
  backendLabel: string;
}
