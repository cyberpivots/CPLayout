import type { LayoutResult, PivotProject } from "../domain/types";

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
  saveProjectAsync(project: PivotProject, result?: LayoutResult): Promise<void>;
  loadProjectAsync(projectId: string): Promise<PivotProject | null>;
  deleteProjectAsync(projectId: string): Promise<void>;
  getBackendInfoAsync(): Promise<ProjectRepositoryBackendInfo>;
  backendLabel: string;
}
