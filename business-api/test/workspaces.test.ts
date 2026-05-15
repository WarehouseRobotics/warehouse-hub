import fs from "node:fs";
import path from "node:path";

import bcrypt from "bcrypt";
import { describe, expect, it, vi } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");
const databasePath = path.join(testDataDir, "business-api.sqlite");
const uploadsPath = path.join(testDataDir, "uploads");

function resetProcessEnv(overrides: Record<string, string | undefined> = {}): void {
  process.env.NODE_ENV = "test";
  process.env.PORT = "3199";
  process.env.API_KEY = "test-api-key";
  process.env.DATABASE_PATH = "./test-data/business-api.sqlite";
  process.env.UPLOAD_DIR = "./test-data/uploads";
  process.env.OCR_STUB_MODE = "true";
  process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "true";
  process.env.HUB_AUTH_MODE = "api-key";
  process.env.HUB_PASSWORD_LOGIN = "1";

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

async function loadFreshWorkspaceModules(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  resetProcessEnv(overrides);
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(databasePath, { force: true });
  fs.rmSync(uploadsPath, { recursive: true, force: true });

  const connection = await import("../src/db/connection.js");
  const workspaceService = await import("../src/services/workspaces.js");
  const schema = await import("../src/db/schema/index.js");

  connection.resetDatabase();
  connection.initializeDatabase();

  return {
    ...connection,
    ...workspaceService,
    ...schema,
  };
}

describe("workspace bootstrap", () => {
  it("creates exactly one workspace from default env values", async () => {
    const { bootstrapWorkspace, getOrm, workspaces } = await loadFreshWorkspaceModules();

    const workspace = bootstrapWorkspace();
    const rows = getOrm().select().from(workspaces).all();

    expect(rows).toHaveLength(1);
    expect(workspace).toMatchObject({
      id: rows[0].id,
      slug: "default",
      name: "Default Workspace",
      deletedAt: null,
    });
    expect(workspace.createdAt).toEqual(expect.any(String));
  });

  it("uses custom workspace env values on first bootstrap", async () => {
    const { getWorkspace } = await loadFreshWorkspaceModules({
      WORKSPACE_NAME: "Northwind Robotics",
      WORKSPACE_SLUG: "northwind",
    });

    expect(getWorkspace()).toMatchObject({
      slug: "northwind",
      name: "Northwind Robotics",
    });
  });

  it("is idempotent for workspace and owner rows", async () => {
    const { bootstrapWorkspace, getOrm, users, workspaces } = await loadFreshWorkspaceModules({
      BOOTSTRAP_OWNER_EMAIL: "Owner@Example.com",
      BOOTSTRAP_OWNER_PASSWORD: "owner-password",
    });

    bootstrapWorkspace();
    bootstrapWorkspace();

    const workspaceRows = getOrm().select().from(workspaces).all();
    const userRows = getOrm().select().from(users).all();

    expect(workspaceRows).toHaveLength(1);
    expect(userRows).toHaveLength(1);
    expect(userRows[0]).toMatchObject({
      workspaceId: workspaceRows[0].id,
      email: "owner@example.com",
      displayName: "owner",
      role: "owner",
      deletedAt: null,
    });
  });

  it("hashes bootstrap owner passwords with bcrypt", async () => {
    const { getOrm, users } = await loadFreshWorkspaceModules({
      BOOTSTRAP_OWNER_EMAIL: "owner@example.com",
      BOOTSTRAP_OWNER_PASSWORD: "owner-password",
    });

    const [owner] = getOrm().select().from(users).all();

    expect(owner.passwordHash).not.toBe("owner-password");
    expect(owner.passwordHash?.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("owner-password", owner.passwordHash ?? "")).toBe(true);
  });

  it("allows a magic-link-only bootstrap owner", async () => {
    const { getOrm, users } = await loadFreshWorkspaceModules({
      BOOTSTRAP_OWNER_EMAIL: "owner@example.com",
      BOOTSTRAP_OWNER_PASSWORD: undefined,
    });

    const [owner] = getOrm().select().from(users).all();

    expect(owner.passwordHash).toBeNull();
  });

  it("returns stable shapes from getWorkspace and updateWorkspace", async () => {
    const { getWorkspace, updateWorkspace } = await loadFreshWorkspaceModules({
      WORKSPACE_NAME: "Northwind Robotics",
      WORKSPACE_SLUG: "northwind",
    });

    const existing = getWorkspace();
    const updated = updateWorkspace({ name: "Warehouse Robotics", slug: "warehouse" });

    expect(updated).toEqual({
      ...existing,
      name: "Warehouse Robotics",
      slug: "warehouse",
    });
    expect(getWorkspace()).toEqual(updated);
  });
});
