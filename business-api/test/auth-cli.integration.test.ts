import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");
const authCliDataDir = path.join(testDataDir, "auth-cli");
const authCliDatabasePath = "./test-data/auth-cli/business-api.sqlite";
const authCliUploadDir = "./test-data/auth-cli/uploads";
const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");

process.env.DATABASE_PATH = authCliDatabasePath;
process.env.UPLOAD_DIR = authCliUploadDir;

type CliRunOptions = {
  homeDir: string;
  env?: Record<string, string | undefined>;
};

async function resetTestState() {
  const { initializeDatabase, resetDatabase } = await import("../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(authCliDataDir, { recursive: true });
  fs.rmSync(path.join(authCliDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(authCliDataDir, "uploads"), { recursive: true, force: true });
  fs.rmSync(path.join(authCliDataDir, "homes"), { recursive: true, force: true });
  initializeDatabase();
}

function runCli(args: string[], options: CliRunOptions): string {
  return execFileSync(tsxPath, ["src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "3199",
      API_KEY: "test-api-key",
      DATABASE_PATH: authCliDatabasePath,
      UPLOAD_DIR: authCliUploadDir,
      OCR_STUB_MODE: "true",
      EMBEDDING_ALLOW_STUB_FALLBACK: "true",
      HOME: options.homeDir,
      RESEND_API_KEY: "",
      WROBO_API_TOKEN: "",
      ...options.env,
    },
    encoding: "utf8",
  });
}

function runCliFailure(args: string[], options: CliRunOptions): string {
  try {
    runCli(args, options);
  } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }

  throw new Error(`Expected CLI command to fail: ${args.join(" ")}`);
}

function makeHomeDir(name: string): string {
  const homeDir = path.join(authCliDataDir, "homes", name);
  fs.mkdirSync(homeDir, { recursive: true });
  return homeDir;
}

function sessionFilePath(homeDir: string): string {
  return path.join(homeDir, ".config", "wrobo", "session.json");
}

function writeSessionFile(
  homeDir: string,
  session: { sessionToken: string; expiresAt: string },
): void {
  const filePath = sessionFilePath(homeDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        baseUrl: "http://localhost:3199",
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
      },
      null,
      2,
    )}\n`,
  );
}

beforeEach(async () => {
  await resetTestState();
});

describe("auth CLI", () => {
  it("logs in, writes a session file, resolves whoami, and logs out", async () => {
    const homeDir = makeHomeDir("login-logout");
    const { createUser } = await import("../src/services/users.js");
    const { requireActiveSession } = await import("../src/services/user-sessions.js");
    const owner = await createUser({
      email: "owner@example.com",
      displayName: "Owner",
      role: "owner",
      password: "owner-password",
    });

    const login = JSON.parse(
      runCli(
        [
          "auth",
          "login",
          "--email",
          "owner@example.com",
          "--password",
          "owner-password",
        ],
        { homeDir },
      ),
    ) as {
      userId: string;
      baseUrl: string;
      sessionToken: string;
      expiresAt: string;
      user: { email: string; role: string };
    };
    expect(login).toMatchObject({
      userId: owner.userId,
      baseUrl: "http://localhost:3199",
      sessionToken: expect.stringMatching(/^sess_/),
      user: {
        email: "owner@example.com",
        role: "owner",
      },
    });

    const storedSession = JSON.parse(
      fs.readFileSync(sessionFilePath(homeDir), "utf8"),
    ) as { sessionToken: string; expiresAt: string };
    expect(storedSession).toMatchObject({
      sessionToken: login.sessionToken,
      expiresAt: login.expiresAt,
    });

    const whoami = JSON.parse(runCli(["auth", "whoami"], { homeDir })) as {
      source: string;
      user: { email: string };
    };
    expect(whoami).toMatchObject({
      source: "session",
      user: { email: "owner@example.com" },
    });

    expect(JSON.parse(runCli(["auth", "logout"], { homeDir }))).toEqual({
      ok: true,
    });
    expect(fs.existsSync(sessionFilePath(homeDir))).toBe(false);
    expect(() => requireActiveSession(login.sessionToken)).toThrow(
      /invalid or expired/i,
    );
  }, 15000);

  it("consumes a magic-link token into the same CLI session file shape", async () => {
    const homeDir = makeHomeDir("magic-link");
    const { createMagicLink } = await import("../src/services/magic-link-tokens.js");
    const { createUser } = await import("../src/services/users.js");
    await createUser({
      email: "magic@example.com",
      displayName: "Magic User",
      role: "member",
    });
    const magicLink = createMagicLink({
      email: "magic@example.com",
      purpose: "login",
    });

    const result = JSON.parse(
      runCli(["auth", "magic-link", "consume", magicLink.token], { homeDir }),
    ) as { sessionToken: string; user: { email: string } };
    expect(result).toMatchObject({
      sessionToken: expect.stringMatching(/^sess_/),
      user: { email: "magic@example.com" },
    });

    const storedSession = JSON.parse(
      fs.readFileSync(sessionFilePath(homeDir), "utf8"),
    ) as { baseUrl: string; sessionToken: string; expiresAt: string };
    expect(storedSession).toMatchObject({
      baseUrl: "http://localhost:3199",
      sessionToken: result.sessionToken,
      expiresAt: expect.any(String),
    });
  }, 15000);

  it("prefers explicit tokens and WROBO_API_TOKEN over stored sessions", async () => {
    const homeDir = makeHomeDir("credential-precedence");
    const { createToken } = await import("../src/services/personal-access-tokens.js");
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const storedUser = await createUser({
      email: "stored@example.com",
      displayName: "Stored User",
      role: "admin",
    });
    const tokenUser = await createUser({
      email: "token@example.com",
      displayName: "Token User",
      role: "admin",
    });
    const envTokenUser = await createUser({
      email: "env-token@example.com",
      displayName: "Env Token User",
      role: "admin",
    });
    writeSessionFile(homeDir, createSession(storedUser.userId));
    const explicitToken = createToken(tokenUser.userId, {
      name: "Explicit token",
      actorType: "user",
      scopes: ["read"],
    });
    const envToken = createToken(envTokenUser.userId, {
      name: "Env token",
      actorType: "user",
      scopes: ["read"],
    });

    const explicitWhoami = JSON.parse(
      runCli(["auth", "whoami", "--token", explicitToken.plaintext], {
        homeDir,
      }),
    ) as { source: string; user: { email: string } };
    expect(explicitWhoami).toMatchObject({
      source: "pat",
      user: { email: "token@example.com" },
    });

    const envWhoami = JSON.parse(
      runCli(["auth", "whoami"], {
        homeDir,
        env: { WROBO_API_TOKEN: envToken.plaintext },
      }),
    ) as { source: string; user: { email: string } };
    expect(envWhoami).toMatchObject({
      source: "pat",
      user: { email: "env-token@example.com" },
    });
  }, 15000);

  it("requires auth for protected business commands and clears stale sessions on logout", async () => {
    const homeDir = makeHomeDir("protected-command-auth");
    const pamEnv = { HUB_AUTH_MODE: "pam", API_KEY: "" };

    expect(
      runCliFailure(["company-card", "get"], {
        homeDir,
        env: pamEnv,
      }),
    ).toContain("CLI authentication is required");

    writeSessionFile(homeDir, {
      sessionToken: "sess_missing",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(
      runCliFailure(["company-card", "get"], {
        homeDir,
        env: pamEnv,
      }),
    ).toContain("Session is invalid or expired");

    expect(
      JSON.parse(
        runCli(["auth", "logout"], {
          homeDir,
          env: pamEnv,
        }),
      ),
    ).toEqual({ ok: true });
    expect(fs.existsSync(sessionFilePath(homeDir))).toBe(false);
  }, 15000);
});

describe("users CLI", () => {
  it("lets admin credentials manage users and invitations", async () => {
    const homeDir = makeHomeDir("users-admin");
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const owner = await createUser({
      email: "owner@example.com",
      displayName: "Owner",
      role: "owner",
    });
    const admin = await createUser({
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
    });
    const member = await createUser({
      email: "member@example.com",
      displayName: "Member",
      role: "member",
    });
    writeSessionFile(homeDir, createSession(admin.userId));

    const users = JSON.parse(runCli(["users", "list"], { homeDir })) as Array<{
      userId: string;
    }>;
    expect(users.map((user) => user.userId)).toEqual([
      owner.userId,
      admin.userId,
      member.userId,
    ]);

    const invitation = JSON.parse(
      runCli(
        [
          "users",
          "invite",
          "--email",
          "Teammate@Example.com",
          "--role",
          "member",
        ],
        { homeDir },
      ),
    ) as { invitationId: string; email: string; role: string; acceptUrl: string };
    expect(invitation).toMatchObject({
      invitationId: expect.stringMatching(/^inv_/),
      email: "teammate@example.com",
      role: "member",
      acceptUrl: expect.stringContaining("/accept-invite/mlt_"),
    });

    const revoked = JSON.parse(
      runCli(["users", "revoke-invite", invitation.invitationId], { homeDir }),
    ) as { invitationId: string; revokedAt: string };
    expect(revoked).toMatchObject({
      invitationId: invitation.invitationId,
      revokedAt: expect.any(String),
    });

    const promoted = JSON.parse(
      runCli(["users", "set-role", member.userId, "--role", "admin"], {
        homeDir,
      }),
    ) as { userId: string; role: string };
    expect(promoted).toMatchObject({
      userId: member.userId,
      role: "admin",
    });

    expect(JSON.parse(runCli(["users", "delete", member.userId], { homeDir }))).toEqual({
      ok: true,
      userId: member.userId,
    });

    const afterDelete = JSON.parse(
      runCli(["users", "list"], { homeDir }),
    ) as Array<{ userId: string }>;
    expect(afterDelete.map((user) => user.userId)).toEqual([
      owner.userId,
      admin.userId,
    ]);
  }, 15000);

  it("rejects member credentials and read-only admin tokens for protected user mutations", async () => {
    const homeDir = makeHomeDir("users-rejected");
    const { createToken } = await import("../src/services/personal-access-tokens.js");
    const { createUser } = await import("../src/services/users.js");
    const admin = await createUser({
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
    });
    const member = await createUser({
      email: "member@example.com",
      displayName: "Member",
      role: "member",
    });
    const memberToken = createToken(member.userId, {
      name: "Member admin-scope token",
      actorType: "user",
      scopes: ["admin"],
    });
    const readOnlyAdminToken = createToken(admin.userId, {
      name: "Read-only admin token",
      actorType: "user",
      scopes: ["read"],
    });

    expect(
      runCliFailure(["users", "list"], {
        homeDir,
        env: { WROBO_API_TOKEN: memberToken.plaintext },
      }),
    ).toContain("Requires admin role");
    expect(
      runCliFailure(
        [
          "users",
          "invite",
          "--email",
          "blocked@example.com",
          "--role",
          "member",
        ],
        {
          homeDir,
          env: { WROBO_API_TOKEN: readOnlyAdminToken.plaintext },
        },
      ),
    ).toContain("Requires write scope");
  }, 15000);
});
