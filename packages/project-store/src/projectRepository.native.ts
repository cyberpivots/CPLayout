import { createSqliteProjectRepository } from "./sqliteProjectRepository";

export const projectRepository = createSqliteProjectRepository({
  backendLabel: "Expo SQLite",
  runtime: "native",
  notes: [
    "Native persistence uses Expo SQLite with customer/project/field/design catalog rows plus project snapshots and normalized geometry/map metadata tables.",
    "Native ZIP import/export uses Expo FileSystem and Sharing and still requires device runtime verification.",
  ],
});

export type { ProjectSummary } from "./projectRepositoryTypes";
