import type { LayoutResult, PivotProject } from "../domain/types";

export interface ProjectSummary {
  id: string;
  name: string;
  projectCrs: string;
  unitSystem: string;
  updatedAt: string;
}

export interface ProjectRepository {
  listProjectsAsync(): Promise<ProjectSummary[]>;
  saveProjectAsync(project: PivotProject, result?: LayoutResult): Promise<void>;
  loadProjectAsync(projectId: string): Promise<PivotProject | null>;
  deleteProjectAsync(projectId: string): Promise<void>;
  backendLabel: string;
}
