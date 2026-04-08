import fs from "node:fs";

import { config } from "../config.js";
import { initializeDatabase, resetDatabase } from "../db/connection.js";
import { logger } from "../lib/logger.js";

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function removeFileIfExists(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.rmSync(filePath, { force: true });
  return true;
}

export function recreateDevDatabase() {
  if (config.NODE_ENV === "production") {
    throw new Error("Refusing to recreate the database in production");
  }

  resetDatabase();

  const removedPaths = [
    config.databasePath,
    `${config.databasePath}-wal`,
    `${config.databasePath}-shm`,
  ].filter(removeFileIfExists);

  const { appliedMigrations } = initializeDatabase();

  return {
    ok: true,
    removedPaths,
    databasePath: config.databasePath,
    appliedMigrations,
  };
}

async function main(): Promise<void> {
  printJson(recreateDevDatabase());
}

main().catch((error) => {
  logger.error("Failed to recreate dev database", { error });
  process.exitCode = 1;
});
