import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { config } from "../config.js";
import { applyMigrations } from "./migrate.js";
import * as schema from "./schema/index.js";

let databaseInstance: Database.Database | undefined;
let ormInstance: ReturnType<typeof drizzle> | undefined;

function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function resolveMigrationsDir(): string {
  const bundledMigrationsDir = path.resolve(import.meta.dirname, "migrations");
  if (fs.existsSync(bundledMigrationsDir)) {
    return bundledMigrationsDir;
  }

  return path.resolve(import.meta.dirname, "../../../src/db/migrations");
}

export function getDatabase(): Database.Database {
  if (!databaseInstance) {
    ensureParentDirectory(config.databasePath);
    databaseInstance = new Database(config.databasePath);
    databaseInstance.pragma("journal_mode = WAL");
    databaseInstance.pragma("foreign_keys = ON");
  }

  return databaseInstance;
}

export function getOrm() {
  if (!ormInstance) {
    ormInstance = drizzle(getDatabase(), { schema });
  }

  return ormInstance;
}

export function initializeDatabase(): { appliedMigrations: string[] } {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const appliedMigrations = applyMigrations(getDatabase(), resolveMigrationsDir());

  return { appliedMigrations };
}
