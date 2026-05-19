import { parseProjectDocument, serializeProjectDocument } from "../domain/projectDocument";
import type { LayoutResult, PivotProject } from "../domain/types";
import type { ProjectRepository, ProjectSummary } from "./projectRepositoryTypes";

const STORAGE_KEY = "center-pivot-layout-projects-v1";

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

export const projectRepository: ProjectRepository = {
  backendLabel: "Browser local storage",

  async getBackendInfoAsync() {
    const projects = await projectRepository.listProjectsAsync();
    return {
      backendLabel: projectRepository.backendLabel,
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
  },

  async loadProjectAsync(projectId: string): Promise<PivotProject | null> {
    const entry = readStore()[projectId];
    return entry ? parseProjectDocument(entry.document) : null;
  },

  async deleteProjectAsync(projectId: string): Promise<void> {
    const store = readStore();
    delete store[projectId];
    writeStore(store);
  },
};

export type { ProjectSummary } from "./projectRepositoryTypes";
