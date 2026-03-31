import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

export function applyMigrations(database: Database.Database, migrationsDir: string): string[] {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );

  const appliedRows = database
    .prepare("SELECT id FROM schema_migrations")
    .all() as Array<{ id: string }>;
  const applied = new Set(appliedRows.map((row) => row.id));

  const filenames = fs
    .readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  const appliedNow: string[] = [];
  for (const filename of filenames) {
    if (applied.has(filename)) {
      continue;
    }

    const migrationPath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(migrationPath, "utf8");
    const now = new Date().toISOString();

    database.transaction(() => {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(filename, now);
    })();

    appliedNow.push(filename);
  }

  return appliedNow;
}
