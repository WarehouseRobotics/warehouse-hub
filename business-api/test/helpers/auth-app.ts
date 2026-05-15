import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";

import type { Application } from "express";
import { vi } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");
const databasePath = path.join(testDataDir, "business-api.sqlite");
const uploadsPath = path.join(testDataDir, "uploads");

let server: Server | undefined;

export function resetProcessEnv(
  overrides: Record<string, string | undefined> = {},
) {
  process.env.NODE_ENV = "test";
  process.env.PORT = "3199";
  process.env.API_KEY = "test-api-key";
  process.env.DATABASE_PATH = "./test-data/business-api.sqlite";
  process.env.UPLOAD_DIR = "./test-data/uploads";
  process.env.OCR_STUB_MODE = "true";
  process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "true";
  process.env.HUB_AUTH_MODE = "api-key";
  process.env.HUB_PASSWORD_LOGIN = "1";
  process.env.DASHBOARD_BASE_URL = "http://localhost:5173";
  process.env.RESEND_API_KEY = "";

  delete process.env.WORKSPACE_NAME;
  delete process.env.WORKSPACE_SLUG;
  delete process.env.BOOTSTRAP_OWNER_EMAIL;
  delete process.env.BOOTSTRAP_OWNER_PASSWORD;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

export async function resetTestModules(
  overrides: Record<string, string | undefined> = {},
) {
  vi.resetModules();
  resetProcessEnv(overrides);
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(databasePath, { force: true });
  fs.rmSync(uploadsPath, { recursive: true, force: true });

  const connection = await import("../../src/db/connection.js");
  connection.resetDatabase();
  connection.initializeDatabase();
}

export async function listen(app: Application): Promise<string> {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });

  const address = server!.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

export function getCookie(header: string | null, name: string): string {
  const match = header?.match(new RegExp(`${name}=([^;]+)`));
  if (!match?.[1]) {
    throw new Error(`Expected ${name} cookie`);
  }

  return `${name}=${match[1]}`;
}

export async function createAuthApp(
  overrides: Record<string, string | undefined> = {},
) {
  await resetTestModules(overrides);
  const { createApp } = await import("../../src/app.js");
  return listen(createApp());
}

export async function closeAuthApp() {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error: Error | undefined) =>
        error ? reject(error) : resolve(),
      );
    });
  }
  server = undefined;
  vi.restoreAllMocks();
}
