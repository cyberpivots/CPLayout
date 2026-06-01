import { useCallback, useEffect, useRef, useState } from "react";

import type { LayoutResult, PivotProject } from "@cplayout/core";
import {
  projectRepository,
  type CatalogProjectRecord,
  type CustomerRecord,
  type DesignRecord,
  type FieldMapRecord,
  type ProjectCatalog,
  type ProjectRepositoryBackendInfo,
  type ProjectSummary,
} from "@cplayout/project-store";

export interface ProjectWorkspaceStatus {
  backendLabel: string;
  backendInfo: ProjectRepositoryBackendInfo | null;
  catalog: ProjectCatalog;
  projects: ProjectSummary[];
  statusMessage: string;
  createCustomer: (input: { displayName: string; sortName?: string }) => Promise<CustomerRecord | null>;
  createProjectRecord: (input: { id?: string; customerId: string; name: string; projectCrs: string; unitSystem: string }) => Promise<CatalogProjectRecord | null>;
  createFieldMapRecord: (input: { id?: string; projectId: string; name: string }) => Promise<FieldMapRecord | null>;
  createDesignRecord: (input: { id?: string; fieldMapId: string; name: string; pivotProjectId: string; isActive?: boolean }) => Promise<DesignRecord | null>;
  refreshProjects: () => Promise<void>;
  saveProject: (project: PivotProject, result?: LayoutResult) => Promise<boolean>;
  saveDesignProject: (designId: string, project: PivotProject, result?: LayoutResult) => Promise<boolean>;
  openProject: (projectId: string) => Promise<PivotProject | null>;
  openDesignProject: (designId: string) => Promise<PivotProject | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
}

export function useProjectRepository(): ProjectWorkspaceStatus {
  const [catalog, setCatalog] = useState<ProjectCatalog>({ customers: [], projects: [], fieldMaps: [], designs: [] });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState(`Storage: ${projectRepository.backendLabel}`);
  const [backendInfo, setBackendInfo] = useState<ProjectRepositoryBackendInfo | null>(null);
  const refreshSequence = useRef(0);

  const refreshProjects = useCallback(async (): Promise<void> => {
    const refreshId = refreshSequence.current + 1;
    refreshSequence.current = refreshId;
    try {
      const [projectList, projectCatalog, info] = await Promise.all([
        projectRepository.listProjectsAsync(),
        projectRepository.listProjectCatalogAsync(),
        projectRepository.getBackendInfoAsync(),
      ]);
      if (refreshId !== refreshSequence.current) return;
      setProjects(projectList);
      setCatalog(projectCatalog);
      setBackendInfo(info);
      setStatusMessage(`Storage: ${info.backendLabel}`);
    } catch (error) {
      if (refreshId !== refreshSequence.current) return;
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

  const saveDesignProject = useCallback(async (designId: string, project: PivotProject, result?: LayoutResult): Promise<boolean> => {
    try {
      await projectRepository.saveDesignProjectAsync(designId, project, result);
      await refreshProjects();
      setStatusMessage(`Saved ${project.name} design with ${projectRepository.backendLabel}.`);
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

  const openDesignProject = useCallback(async (designId: string): Promise<PivotProject | null> => {
    try {
      const project = await projectRepository.loadDesignProjectAsync(designId);
      if (!project) {
        setStatusMessage("Design was not found in local storage.");
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

  const createCustomer = useCallback(async (input: { displayName: string; sortName?: string }): Promise<CustomerRecord | null> => {
    try {
      const record = await projectRepository.createCustomerAsync(input);
      await refreshProjects();
      setStatusMessage(`Created customer folder ${record.displayName}.`);
      return record;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const createProjectRecord = useCallback(async (input: { id?: string; customerId: string; name: string; projectCrs: string; unitSystem: string }): Promise<CatalogProjectRecord | null> => {
    try {
      const record = await projectRepository.createProjectRecordAsync(input);
      await refreshProjects();
      setStatusMessage(`Created project ${record.name}.`);
      return record;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const createFieldMapRecord = useCallback(async (input: { id?: string; projectId: string; name: string }): Promise<FieldMapRecord | null> => {
    try {
      const record = await projectRepository.createFieldMapRecordAsync(input);
      await refreshProjects();
      setStatusMessage(`Created field map ${record.name}.`);
      return record;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const createDesignRecord = useCallback(async (input: { id?: string; fieldMapId: string; name: string; pivotProjectId: string; isActive?: boolean }): Promise<DesignRecord | null> => {
    try {
      const record = await projectRepository.createDesignRecordAsync(input);
      await refreshProjects();
      setStatusMessage(`Created design ${record.name}.`);
      return record;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  return {
    backendLabel: projectRepository.backendLabel,
    backendInfo,
    catalog,
    createCustomer,
    createProjectRecord,
    createFieldMapRecord,
    createDesignRecord,
    projects,
    statusMessage,
    refreshProjects,
    saveProject,
    saveDesignProject,
    openProject,
    openDesignProject,
    deleteProject,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Local project storage operation failed.";
}
