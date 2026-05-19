import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

import { SQLITE_MIGRATIONS, SQLITE_SCHEMA_VERSION } from "./persistenceSchema";

export const DEFAULT_PROJECT_DATABASE_NAME = "center-pivot-projects.db";

export async function openProjectDatabaseAsync(databaseName = DEFAULT_PROJECT_DATABASE_NAME): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(databaseName);
  await applyProjectStoreMigrations(db);
  return db;
}

export async function applyProjectStoreMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync(SQLITE_MIGRATIONS[0].statements[0]);

  const applied = await db.getFirstAsync<{ user_version: number | null }>("PRAGMA user_version;");
  const currentVersion = Number(applied?.user_version ?? 0);
  const pendingMigrations = SQLITE_MIGRATIONS.filter((migration) => migration.id > currentVersion);

  for (const migration of pendingMigrations) {
    await db.execAsync("BEGIN;");
    try {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.runAsync(
        "INSERT OR IGNORE INTO schema_migrations (id, name) VALUES (?, ?);",
        migration.id,
        migration.name,
      );
      await db.execAsync(`PRAGMA user_version = ${migration.id};`);
      await db.execAsync("COMMIT;");
    } catch (error) {
      await db.execAsync("ROLLBACK;");
      throw error;
    }
  }

  if (pendingMigrations.length === 0 && currentVersion < SQLITE_SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION};`);
  }
}
