import { localStorageProjectRepository } from "./projectRepository.local";
import type { ProjectRepository, ProjectRepositoryBackendInfo } from "./projectRepositoryTypes";

const SQLITE_WEB_BLOCKER =
  "Expo SQLite web is proof-gated for the browser MVP until a full CRUD smoke test passes with WASM and COOP/COEP headers.";

export const projectRepository: ProjectRepository = {
  ...localStorageProjectRepository,
  backendLabel: localStorageProjectRepository.backendLabel,

  async getBackendInfoAsync(): Promise<ProjectRepositoryBackendInfo> {
    const info = await localStorageProjectRepository.getBackendInfoAsync();
    return {
      ...info,
      notes: [
        SQLITE_WEB_BLOCKER,
        "Browser catalog and project snapshots use localStorage so one session cannot split state between SQLite web and localStorage.",
        ...info.notes,
      ],
    };
  },
};

export type { ProjectSummary } from "./projectRepositoryTypes";
