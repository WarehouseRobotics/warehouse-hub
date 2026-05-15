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

function getCookie(header: string | null, name: string): string {
  const match = header?.match(new RegExp(`${name}=([^;]+)`));
  if (!match?.[1]) {
    throw new Error(`Expected ${name} cookie`);
  }

  return `${name}=${match[1]}`;
}

async function createAuthApp(
  overrides: Record<string, string | undefined> = {},
) {
  await resetTestModules(overrides);
  const { createApp } = await import("../src/app.js");
  const baseUrl = await listen(createApp());
  return baseUrl;
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
  vi.restoreAllMocks();
});

describe("auth routes", () => {
  it("logs in with a password, sets a session cookie, and returns /auth/me", async () => {
    const baseUrl = await createAuthApp();
    const { createUser } = await import("../src/services/users.js");
    const user = createUser({
      email: "Owner@Example.com",
      displayName: "Owner",
      password: "owner-password",
      role: "owner",
    });

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "owner-password",
      }),
    });
    const body = await loginResponse.json();
    const cookie = getCookie(
      loginResponse.headers.get("set-cookie"),
      "wh_session",
    );

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("set-cookie")).toContain("HttpOnly");
    expect(loginResponse.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(body).toMatchObject({
      userId: user.userId,
      sessionToken: expect.stringMatching(/^sess_/),
      expiresAt: expect.any(String),
      user: {
        id: user.userId,
        email: "owner@example.com",
        displayName: "Owner",
        role: "owner",
      },
    });

    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie },
    });

    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toMatchObject({
      user: {
        id: user.userId,
        email: "owner@example.com",
        displayName: "Owner",
        role: "owner",
      },
      role: "owner",
      workspace: {
        slug: "default",
        name: "Default Workspace",
      },
    });
  });

  it("rejects wrong passwords and disabled password login", async () => {
    let baseUrl = await createAuthApp();
    const { createUser } = await import("../src/services/users.js");
    createUser({
      email: "owner@example.com",
      displayName: "Owner",
      password: "owner-password",
      role: "owner",
    });

    const wrongPasswordResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "wrong-password",
      }),
    });

    expect(wrongPasswordResponse.status).toBe(401);

    await new Promise<void>((resolve, reject) => {
      server!.close((error: Error | undefined) =>
        error ? reject(error) : resolve(),
      );
    });
    server = undefined;

    baseUrl = await createAuthApp({ HUB_PASSWORD_LOGIN: "0" });
    const { createUser: createDisabledUser } = await import(
      "../src/services/users.js"
    );
    createDisabledUser({
      email: "disabled@example.com",
      displayName: "Disabled",
      password: "owner-password",
      role: "owner",
    });

    const disabledResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "disabled@example.com",
        password: "owner-password",
      }),
    });
    const disabledBody = (await disabledResponse.json()) as {
      error: { code: string };
    };

    expect(disabledResponse.status).toBe(403);
    expect(disabledBody.error.code).toBe("password_login_disabled");
  });

  it("always returns 204 for magic-link requests and only creates tokens for known users", async () => {
    const baseUrl = await createAuthApp();
    const { getOrm } = await import("../src/db/connection.js");
    const { magicLinkTokens } = await import("../src/db/schema/index.js");
    const { createUser } = await import("../src/services/users.js");
    createUser({
      email: "magic@example.com",
      displayName: "Magic User",
      role: "member",
    });

    const knownResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/request`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "magic@example.com" }),
      },
    );
    const unknownResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/request`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.com" }),
      },
    );

    expect(knownResponse.status).toBe(204);
    expect(unknownResponse.status).toBe(204);
    expect(getOrm().select().from(magicLinkTokens).all()).toHaveLength(1);
  });

  it("consumes magic links into sessions and rejects reuse or invalid tokens", async () => {
    const baseUrl = await createAuthApp();
    const { createMagicLink } = await import(
      "../src/services/magic-link-tokens.js"
    );
    const { createUser } = await import("../src/services/users.js");
    const user = createUser({
      email: "magic@example.com",
      displayName: "Magic User",
      role: "member",
    });
    const magicLink = createMagicLink({
      email: user.email,
      purpose: "login",
    });

    const consumeResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/consume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: magicLink.token }),
      },
    );
    const body = await consumeResponse.json();
    const cookie = getCookie(
      consumeResponse.headers.get("set-cookie"),
      "wh_session",
    );

    expect(consumeResponse.status).toBe(200);
    expect(body).toMatchObject({
      userId: user.userId,
      sessionToken: expect.stringMatching(/^sess_/),
      user: {
        id: user.userId,
        email: "magic@example.com",
        role: "member",
      },
    });

    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie },
    });
    expect(meResponse.status).toBe(200);

    const reusedResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/consume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: magicLink.token }),
      },
    );
    const invalidResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/consume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "mlt_unknown" }),
      },
    );

    expect(reusedResponse.status).toBe(401);
    expect(invalidResponse.status).toBe(401);
  });

  it("logs out by revoking the active session and clearing the cookie", async () => {
    const baseUrl = await createAuthApp();
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const user = createUser({
      email: "logout@example.com",
      displayName: "Logout User",
      role: "member",
    });
    const session = createSession(user.userId);
    const cookie = `wh_session=${session.sessionToken}`;

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { cookie },
    });

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers.get("set-cookie")).toContain("wh_session=");

    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie },
    });
    expect(meResponse.status).toBe(401);
  });

  it("returns /auth/me for PAT and legacy API-key auth", async () => {
    const baseUrl = await createAuthApp();
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const { createUser } = await import("../src/services/users.js");
    const user = createUser({
      email: "agent-owner@example.com",
      displayName: "Agent Owner",
      role: "admin",
    });
    const token = createToken(user.userId, {
      name: "OpenClaw",
      actorType: "agent",
      scopes: ["read"],
    });

    const patResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${token.plaintext}` },
    });
    expect(patResponse.status).toBe(200);
    expect(await patResponse.json()).toMatchObject({
      user: {
        id: user.userId,
        email: "agent-owner@example.com",
        role: "admin",
      },
      role: "admin",
    });

    const legacyResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: "Bearer test-api-key" },
    });
    expect(legacyResponse.status).toBe(200);
    expect(await legacyResponse.json()).toMatchObject({
      user: null,
      role: null,
      workspace: {
        slug: "default",
        name: "Default Workspace",
      },
    });
  });
});
