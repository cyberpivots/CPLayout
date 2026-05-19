import { useCallback, useEffect, useState } from "react";

import type { LayoutResult, PivotProject } from "@cplayout/core";
import { projectRepository, type ProjectRepositoryBackendInfo, type ProjectSummary } from "@cplayout/project-store";

export interface ProjectWorkspaceStatus {
  backendLabel: string;
  backendInfo: ProjectRepositoryBackendInfo | null;
  projects: ProjectSummary[];
  statusMessage: string;
  refreshProjects: () => Promise<void>;
  saveProject: (project: PivotProject, result?: LayoutResult) => Promise<boolean>;
  openProject: (projectId: string) => Promise<PivotProject | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
}

export function useProjectRepository(): ProjectWorkspaceStatus {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState(`Storage: ${projectRepository.backendLabel}`);
  const [backendInfo, setBackendInfo] = useState<ProjectRepositoryBackendInfo | null>(null);

  const refreshProjects = useCallback(async (): Promise<void> => {
    try {
      const [projectList, info] = await Promise.all([
        projectRepository.listProjectsAsync(),
        projectRepository.getBackendInfoAsync(),
      ]);
      setProjects(projectList);
      setBackendInfo(info);
      setStatusMessage(`Storage: ${info.backendLabel}`);
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const saveProject = useCallback(async (project: PivotProject, result?: LayoutResult): Promise<boolean> => {
    try {
      await projectRepository.saveProjectAsync(project, result);
      await refreshProjects();
      setStatusMessage(`Saved ${project.name} with ${projectRepository.backendLabel}.`);
      return true;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return false;
    }
  }, [refreshProjects]);

  const openProject = useCallback(async (projectId: string): Promise<PivotProject | null> => {
    try {
      const project = await projectRepository.loadProjectAsync(projectId);
      if (!project) {
        setStatusMessage("Project was not found in local storage.");
        return null;
      }
      setStatusMessage(`Opened ${project.name}.`);
      return project;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    try {
      await projectRepository.deleteProjectAsync(projectId);
      await refreshProjects();
      setStatusMessage("Deleted local project entry.");
      return true;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return false;
    }
  }, [refreshProjects]);

  return {
    backendLabel: projectRepository.backendLabel,
    backendInfo,
    projects,
    statusMessage,
    refreshProjects,
    saveProject,
    openProject,
    deleteProject,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Local project storage operation failed.";
}
