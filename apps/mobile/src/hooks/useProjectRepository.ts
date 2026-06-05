import { useCallback, useEffect, useRef, useState } from "react";

import type { LayoutResult, PivotProject } from "@cplayout/core";
import {
  projectRepository,
  type CatalogProjectRecord,
  type CreatedProjectFieldMapWorkspace,
  type CreatedProjectWorkspace,
  type CreateProjectWithInitialFieldMapInput,
  type CreateProjectWithInitialDesignInput,
  type ClientRecord,
  type ClientProfileInput,
  type ClientProfileUpdateInput,
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
  createClient: (input: ClientProfileInput) => Promise<ClientRecord | null>;
  updateClient: (input: ClientProfileUpdateInput) => Promise<ClientRecord | null>;
  deleteClient: (clientId: string) => Promise<boolean>;
  createProjectWithInitialDesign: (input: CreateProjectWithInitialDesignInput) => Promise<CreatedProjectWorkspace | null>;
  createProjectWithInitialFieldMap: (input: CreateProjectWithInitialFieldMapInput) => Promise<CreatedProjectFieldMapWorkspace | null>;
  createProjectRecord: (input: { id?: string; clientId: string; name: string; projectCrs: string; unitSystem: string }) => Promise<CatalogProjectRecord | null>;
  renameProject: (projectId: string, name: string) => Promise<CatalogProjectRecord | null>;
  moveProjectToClient: (projectId: string, clientId: string) => Promise<CatalogProjectRecord | null>;
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
  const [catalog, setCatalog] = useState<ProjectCatalog>({ clients: [], projects: [], fieldMaps: [], designs: [] });
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

  const createClient = useCallback(async (input: ClientProfileInput): Promise<ClientRecord | null> => {
    try {
      const record = await projectRepository.createClientAsync(input);
      await refreshProjects();
      setStatusMessage(`Created client folder ${record.displayName}.`);
      return record;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const updateClient = useCallback(async (input: ClientProfileUpdateInput): Promise<ClientRecord | null> => {
    try {
      const record = await projectRepository.updateClientAsync(input);
      await refreshProjects();
      setStatusMessage(`Updated client folder ${record.displayName}.`);
      return record;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const deleteClient = useCallback(async (clientId: string): Promise<boolean> => {
    try {
      await projectRepository.deleteClientAsync(clientId);
      await refreshProjects();
      setStatusMessage("Deleted empty client folder.");
      return true;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return false;
    }
  }, [refreshProjects]);

  const createProjectWithInitialDesign = useCallback(async (input: CreateProjectWithInitialDesignInput): Promise<CreatedProjectWorkspace | null> => {
    try {
      const created = await projectRepository.createProjectWithInitialDesignAsync(input);
      await refreshProjects();
      setStatusMessage(`Created project ${created.project.name}.`);
      return created;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const createProjectWithInitialFieldMap = useCallback(async (input: CreateProjectWithInitialFieldMapInput): Promise<CreatedProjectFieldMapWorkspace | null> => {
    try {
      const created = await projectRepository.createProjectWithInitialFieldMapAsync(input);
      await refreshProjects();
      setStatusMessage(`Created project ${created.projectRecord.name}.`);
      return created;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const createProjectRecord = useCallback(async (input: { id?: string; clientId: string; name: string; projectCrs: string; unitSystem: string }): Promise<CatalogProjectRecord | null> => {
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

  const renameProject = useCallback(async (projectId: string, name: string): Promise<CatalogProjectRecord | null> => {
    try {
      const record = await projectRepository.renameProjectAsync(projectId, name);
      await refreshProjects();
      setStatusMessage(`Renamed project ${record.name}.`);
      return record;
    } catch (error) {
      setStatusMessage(errorMessage(error));
      return null;
    }
  }, [refreshProjects]);

  const moveProjectToClient = useCallback(async (projectId: string, clientId: string): Promise<CatalogProjectRecord | null> => {
    try {
      const record = await projectRepository.moveProjectToClientAsync(projectId, clientId);
      await refreshProjects();
      setStatusMessage(`Moved project ${record.name}.`);
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
    createClient,
    updateClient,
    deleteClient,
    createProjectWithInitialDesign,
    createProjectWithInitialFieldMap,
    createProjectRecord,
    renameProject,
    moveProjectToClient,
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
