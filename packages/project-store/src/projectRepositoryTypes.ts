import type { LayoutResult, PivotProject } from "@cplayout/core";

export interface CustomerRecord {
  id: string;
  displayName: string;
  sortName: string;
  companyName: string;
  contactName: string;
  primaryContactFirstName: string;
  primaryContactMiddleInitial: string;
  primaryContactLastName: string;
  primaryContactSuffix: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
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

export interface CustomerProfileInput {
  companyName?: string;
  primaryContactFirstName: string;
  primaryContactLastName: string;
  primaryContactMiddleInitial?: string;
  primaryContactSuffix?: string;
  displayName?: string;
  sortName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  location?: string;
  notes?: string;
}

export interface CustomerProfileUpdateInput {
  id: string;
  companyName?: string;
  primaryContactFirstName?: string;
  primaryContactLastName?: string;
  primaryContactMiddleInitial?: string;
  primaryContactSuffix?: string;
  displayName?: string;
  sortName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  location?: string;
  notes?: string;
}

export interface CreateProjectWithInitialDesignInput {
  customerId: string;
  project: PivotProject;
  result?: LayoutResult;
  fieldMapId?: string;
  fieldMapName?: string;
  designId?: string;
  designName?: string;
}

export interface CreateProjectWithInitialFieldMapInput {
  customerId: string;
  projectId?: string;
  projectName: string;
  projectCrs: string;
  unitSystem: string;
  fieldMapId?: string;
  fieldMapName?: string;
}

export interface CreatedProjectWorkspace {
  project: PivotProject;
  projectRecord: CatalogProjectRecord;
  fieldMap: FieldMapRecord;
  design: DesignRecord;
}

export interface CreatedProjectFieldMapWorkspace {
  projectRecord: CatalogProjectRecord;
  fieldMap: FieldMapRecord;
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
  createCustomerAsync(input: CustomerProfileInput): Promise<CustomerRecord>;
  updateCustomerAsync(input: CustomerProfileUpdateInput): Promise<CustomerRecord>;
  deleteCustomerAsync(customerId: string): Promise<void>;
  createProjectWithInitialDesignAsync(input: CreateProjectWithInitialDesignInput): Promise<CreatedProjectWorkspace>;
  createProjectWithInitialFieldMapAsync(input: CreateProjectWithInitialFieldMapInput): Promise<CreatedProjectFieldMapWorkspace>;
  createProjectRecordAsync(input: { id?: string; customerId: string; name: string; projectCrs: string; unitSystem: string }): Promise<CatalogProjectRecord>;
  renameProjectAsync(projectId: string, name: string): Promise<CatalogProjectRecord>;
  moveProjectToCustomerAsync(projectId: string, customerId: string): Promise<CatalogProjectRecord>;
  createFieldMapRecordAsync(input: { id?: string; projectId: string; name: string }): Promise<FieldMapRecord>;
  createDesignRecordAsync(input: { id?: string; fieldMapId: string; name: string; pivotProjectId: string; isActive?: boolean }): Promise<DesignRecord>;
  getBackendInfoAsync(): Promise<ProjectRepositoryBackendInfo>;
  backendLabel: string;
}
