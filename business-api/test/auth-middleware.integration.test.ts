import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";

import type { Application } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");
const databasePath = path.join(testDataDir, "business-api.sqlite");
const uploadsPath = path.join(testDataDir, "uploads");

let server: Server | undefined;

function resetProcessEnv(overrides: Record<string, string | undefined> = {}) {
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

async function resetTestModules(
  overrides: Record<string, string | undefined> = {},
) {
  vi.resetModules();
  resetProcessEnv(overrides);
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(databasePath, { force: true });
  fs.rmSync(uploadsPath, { recursive: true, force: true });

  const connection = await import("../src/db/connection.js");
  connection.resetDatabase();
  connection.initializeDatabase();
}

async function listen(app: Application): Promise<string> {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });

  const address = server!.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function createMiddlewareApp(
  routes: (args: {
    app: import("express").Express;
    requireScope: typeof import("../src/middleware/auth.js").requireScope;
    requireRole: typeof import("../src/middleware/auth.js").requireRole;
  }) => void,
  overrides: Record<string, string | undefined> = {},
) {
  await resetTestModules(overrides);
  const express = (await import("express")).default;
  const { requireAuth, requireRole, requireScope } = await import(
    "../src/middleware/auth.js"
  );
  const { auditMiddleware } = await import("../src/middleware/audit.js");
  const { errorHandler } = await import("../src/middleware/error-handler.js");
  const app = express();
  app.use(express.json());
  app.use(requireAuth);
  app.use(auditMiddleware);
  routes({ app, requireScope, requireRole });
  app.use(errorHandler);
  return listen(app);
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error: Error | undefined) =>
        error ? reject(error) : resolve(),
      );
    });
  }
  server = undefined;
});

describe("auth middleware", () => {
  it("rejects missing credentials and accepts the legacy API key in api-key mode", async () => {
    await resetTestModules();
    const { createApp } = await import("../src/app.js");
    const baseUrl = await listen(createApp());

    const missingResponse = await fetch(`${baseUrl}/api/v1/company-card`);
    expect(missingResponse.status).toBe(401);

    const legacyResponse = await fetch(`${baseUrl}/api/v1/company-card`, {
      headers: { authorization: "Bearer test-api-key" },
    });
    expect(legacyResponse.status).toBe(404);
  });

  it("rejects the legacy API key outside api-key mode", async () => {
    await resetTestModules({ HUB_AUTH_MODE: "pam" });
    const { createApp } = await import("../src/app.js");
    const baseUrl = await listen(createApp());

    const response = await fetch(`${baseUrl}/api/v1/company-card`, {
      headers: { authorization: "Bearer test-api-key" },
    });

    expect(response.status).toBe(401);
  });

  it("resolves session cookies into admin-scoped user context", async () => {
    const baseUrl = await createMiddlewareApp(({ app, requireScope }) => {
      app.get("/context", requireScope("admin"), (request, response) => {
        response.json(request.context);
      });
    });
    const { createUser } = await import("../src/services/users.js");
    const { createSession } = await import("../src/services/user-sessions.js");
    const user = createUser({
      email: "owner@example.com",
      displayName: "Owner",
      password: "secret",
      role: "owner",
    });
    const session = createSession(user.userId);

    const response = await fetch(`${baseUrl}/context`, {
      headers: { cookie: `wh_session=${session.sessionToken}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      userId: user.userId,
      role: "owner",
      scopes: ["admin"],
      actorType: "user",
      sessionId: session.sessionId,
      tokenId: null,
      source: "session",
    });
  });

  it("resolves PATs into token context and applies scope implication", async () => {
    const baseUrl = await createMiddlewareApp(({ app, requireScope }) => {
      app.get("/context", requireScope("read"), (request, response) => {
        response.json(request.context);
      });
      app.post("/context", requireScope("write"), (_request, response) => {
        response.json({ ok: true });
      });
    });
    const { createUser } = await import("../src/services/users.js");
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const user = createUser({
      email: "agent-owner@example.com",
      displayName: "Agent Owner",
      role: "admin",
    });
    const token = createToken(user.userId, {
      name: "OpenClaw",
      actorType: "agent",
      scopes: ["write"],
    });

    const getResponse = await fetch(`${baseUrl}/context`, {
      headers: { authorization: `Bearer ${token.plaintext}` },
    });
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({
      userId: user.userId,
      role: "admin",
      scopes: ["write"],
      actorType: "agent",
      sessionId: null,
      tokenId: token.tokenId,
      source: "pat",
    });

    const postResponse = await fetch(`${baseUrl}/context`, {
      method: "POST",
      headers: { "x-api-key": token.plaintext },
    });
    expect(postResponse.status).toBe(200);
  });

  it("allows read-only PATs to read but rejects mutating scope checks", async () => {
    const baseUrl = await createMiddlewareApp(({ app, requireScope }) => {
      app.get("/resource", requireScope("read"), (_request, response) => {
        response.json({ ok: true });
      });
      app.post("/resource", requireScope("write"), (_request, response) => {
        response.json({ ok: true });
      });
    });
    const { createUser } = await import("../src/services/users.js");
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const user = createUser({
      email: "reader@example.com",
      displayName: "Reader",
      role: "member",
    });
    const token = createToken(user.userId, {
      name: "Read token",
      actorType: "user",
      scopes: ["read"],
    });

    const getResponse = await fetch(`${baseUrl}/resource`, {
      headers: { authorization: `Bearer ${token.plaintext}` },
    });
    const postResponse = await fetch(`${baseUrl}/resource`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.plaintext}` },
    });

    expect(getResponse.status).toBe(200);
    expect(postResponse.status).toBe(403);
  });

  it("rejects users below the required role", async () => {
    const baseUrl = await createMiddlewareApp(({ app, requireRole }) => {
      app.get("/admin", requireRole("admin"), (_request, response) => {
        response.json({ ok: true });
      });
    });
    const { createUser } = await import("../src/services/users.js");
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const user = createUser({
      email: "member@example.com",
      displayName: "Member",
      role: "member",
    });
    const token = createToken(user.userId, {
      name: "Member token",
      actorType: "user",
      scopes: ["admin"],
    });

    const response = await fetch(`${baseUrl}/admin`, {
      headers: { authorization: `Bearer ${token.plaintext}` },
    });

    expect(response.status).toBe(403);
  });
});

describe("audit middleware", () => {
  it("writes one opt-in audit row for successful non-GET responses", async () => {
    const baseUrl = await createMiddlewareApp(({ app }) => {
      app.post("/audited", (_request, response) => {
        response.locals.audit = {
          action: "test.create",
          objectType: "test_object",
          objectId: "obj_001",
          metadata: { source: "middleware-test" },
        };
        response.status(201).json({ ok: true });
      });
    });

    const response = await fetch(`${baseUrl}/audited`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "x-request-id": "req_from_header",
      },
    });
    const { listAuditLogEntries } = await import(
      "../src/services/audit-log.js"
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("req_from_header");
    expect(listAuditLogEntries()).toEqual([
      expect.objectContaining({
        actorUserId: null,
        actorTokenId: null,
        actorType: "system",
        action: "test.create",
        objectType: "test_object",
        objectId: "obj_001",
        requestId: "req_from_header",
        metadata: { source: "middleware-test" },
      }),
    ]);
  });

  it("skips missing locals, GET requests, and failed responses", async () => {
    const baseUrl = await createMiddlewareApp(({ app }) => {
      app.post("/missing", (_request, response) => {
        response.json({ ok: true });
      });
      app.get("/read", (_request, response) => {
        response.locals.audit = {
          action: "test.read",
          objectType: "test_object",
          objectId: "obj_002",
        };
        response.json({ ok: true });
      });
      app.post("/failed", (_request, response) => {
        response.locals.audit = {
          action: "test.fail",
          objectType: "test_object",
          objectId: "obj_003",
        };
        response.status(400).json({ ok: false });
      });
    });
    const headers = { authorization: "Bearer test-api-key" };

    expect(
      await fetch(`${baseUrl}/missing`, { method: "POST", headers }),
    ).toHaveProperty("status", 200);
    expect(await fetch(`${baseUrl}/read`, { headers })).toHaveProperty(
      "status",
      200,
    );
    expect(
      await fetch(`${baseUrl}/failed`, { method: "POST", headers }),
    ).toHaveProperty("status", 400);

    const { listAuditLogEntries } = await import(
      "../src/services/audit-log.js"
    );
    expect(listAuditLogEntries()).toEqual([]);
  });
});
