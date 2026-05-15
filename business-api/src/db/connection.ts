import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";

import { config } from "../config.js";
import { getConfiguredEmbeddingDimensions } from "../lib/llm-config.js";
import { logger } from "../lib/logger.js";
import { bootstrapWorkspace } from "../services/workspaces.js";
import { applyMigrations } from "./migrate.js";
import * as schema from "./schema/index.js";

let databaseInstance: Database.Database | undefined;
let ormInstance: ReturnType<typeof drizzle> | undefined;
let vectorBackend: "sqlite-vec" | "json" = "json";
let openDatabaseIdentity: string | undefined;

function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function getDatabaseIdentity(filePath: string): string {
  const stats = fs.statSync(filePath);
  return `${stats.dev}:${stats.ino}`;
}

function resolveMigrationsDir(): string {
  const bundledMigrationsDir = path.resolve(import.meta.dirname, "migrations");
  if (fs.existsSync(bundledMigrationsDir)) {
    return bundledMigrationsDir;
  }

  return path.resolve(import.meta.dirname, "../../../src/db/migrations");
}

function ensureVectorTables(database: Database.Database): void {
  if (vectorBackend === "sqlite-vec") {
    database.prepare(
      `
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
          embedding float[${getConfiguredEmbeddingDimensions()}]
        )
      `,
    ).run();
    return;
  }

  database.prepare(
    `
      CREATE TABLE IF NOT EXISTS vec_embeddings (
        rowid INTEGER PRIMARY KEY,
        embedding TEXT NOT NULL
      )
    `,
  ).run();
}

function ensureSchemaCompatibility(database: Database.Database): void {
  const companyCardColumns = database
    .prepare("PRAGMA table_info(company_card)")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(companyCardColumns.map((column) => column.name));

  if (!columnNames.has("vat_id")) {
    database.exec("ALTER TABLE company_card ADD COLUMN vat_id TEXT");
  }
}

function initializeVectorBackend(database: Database.Database): void {
  try {
    const loadablePath = sqliteVec.getLoadablePath().replace(/\.(so|dylib|dll)$/i, "");
    database.loadExtension(loadablePath);
    vectorBackend = "sqlite-vec";
  } catch (error) {
    vectorBackend = "json";
    logger.warn("sqlite-vec unavailable, falling back to JSON embeddings", { error });
  }
}

export function getDatabase(): Database.Database {
  ensureParentDirectory(config.databasePath);

  if (databaseInstance && openDatabaseIdentity) {
    const currentIdentity = getDatabaseIdentity(config.databasePath);
    if (currentIdentity !== openDatabaseIdentity) {
      logger.info("Database file changed on disk, reopening SQLite connection", {
        previousIdentity: openDatabaseIdentity,
        currentIdentity,
        databasePath: config.databasePath,
      });
      resetDatabase();
    }
  }

  if (!databaseInstance) {
    databaseInstance = new Database(config.databasePath);
    openDatabaseIdentity = getDatabaseIdentity(config.databasePath);
    databaseInstance.pragma("journal_mode = WAL");
    databaseInstance.pragma("foreign_keys = ON");
    initializeVectorBackend(databaseInstance);
    ensureVectorTables(databaseInstance);
  }

  return databaseInstance;
}

export function getOrm() {
  const database = getDatabase();

  if (!ormInstance) {
    ormInstance = drizzle(database, { schema });
  }

  return ormInstance;
}

export function initializeDatabase(): { appliedMigrations: string[] } {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const database = getDatabase();
  const appliedMigrations = applyMigrations(database, resolveMigrationsDir());
  ensureSchemaCompatibility(database);
  bootstrapWorkspace();

  return { appliedMigrations };
}

export function resetDatabase(): void {
  if (databaseInstance) {
    databaseInstance.close();
  }

  databaseInstance = undefined;
  ormInstance = undefined;
  vectorBackend = "json";
  openDatabaseIdentity = undefined;
}

export function getVectorBackend(): "sqlite-vec" | "json" {
  return vectorBackend;
}
