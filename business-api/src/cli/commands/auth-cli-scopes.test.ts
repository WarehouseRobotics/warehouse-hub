import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type CliContextOutput = {
  json: unknown[];
  lines: string[][];
  context: {
    rawArgs: string[];
    printJson: (value: unknown) => void;
    printLines: (lines: string[]) => void;
  };
};

let resetDatabase: (() => void) | undefined;
let tempDir: string | undefined;
let previousEnv: Partial<Record<string, string | undefined>> = {};

const managedEnvKeys = [
  "NODE_ENV",
  "DATABASE_PATH",
  "UPLOAD_DIR",
  "TMP_DIR",
  "WORKSPACE_NAME",
  "WORKSPACE_SLUG",
  "BOOTSTRAP_OWNER_EMAIL",
  "BOOTSTRAP_OWNER_PASSWORD",
  "HUB_AUTH_MODE",
];

function createOutput(): CliContextOutput {
  const output: CliContextOutput = {
    json: [],
    lines: [],
    context: {
      rawArgs: [],
      printJson: (value) => {
        output.json.push(value);
      },
      printLines: (lines) => {
        output.lines.push(lines);
      },
    },
  };

  return output;
}

async function setupHarness() {
  vi.resetModules();
  previousEnv = Object.fromEntries(
    managedEnvKeys.map((key) => [key, process.env[key]]),
  );
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wh-auth-cli-"));
  process.env.NODE_ENV = "test";
  process.env.DATABASE_PATH = path.join(tempDir, "business-api.sqlite");
  process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
  process.env.TMP_DIR = path.join(tempDir, "tmp");
  process.env.WORKSPACE_NAME = "Test Workspace";
  process.env.WORKSPACE_SLUG = "test-workspace";
  process.env.BOOTSTRAP_OWNER_EMAIL = "owner@example.com";
  process.env.BOOTSTRAP_OWNER_PASSWORD = "owner-password";
  process.env.HUB_AUTH_MODE = "pam";

  const db = await import("../../db/connection.js");
  resetDatabase = db.resetDatabase;
  db.initializeDatabase();

  const users = await import("../../services/users.js");
  const sessions = await import("../../services/user-sessions.js");
  const tokens = await import("./tokens.js");
  const workspace = await import("./workspace.js");
  const owner = users.getUser("owner@example.com");
  const session = sessions.createSession(owner.userId, {
    userAgent: "auth-cli-scopes-test",
  });

  return {
    createUser: users.createUser,
    sessionToken: session.sessionToken,
    tokensCommand: tokens.commandDefinitions[0],
    workspaceCommand: workspace.commandDefinitions[0],
  };
}

afterEach(() => {
  resetDatabase?.();
  resetDatabase = undefined;
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
  for (const key of managedEnvKeys) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  previousEnv = {};
  vi.restoreAllMocks();
});

describe("auth CLI token and workspace scopes", () => {
  it("creates, lists, and revokes personal access tokens for the current user", async () => {
    const harness = await setupHarness();
    const output = createOutput();

    await harness.tokensCommand.handler({
      subcommand: "create",
      rest: [
        "--name",
        "claude-desktop",
        "--actor-type",
        "agent",
        "--scopes",
        "write",
        "--token",
        harness.sessionToken,
      ],
      rawArgs: [],
      positionalArgs: ["tokens", "create"],
      context: output.context,
    });

    const created = output.json[0] as {
      tokenId: string;
      plaintext: string;
      actorType: string;
      scopes: string[];
    };
    expect(created.tokenId).toMatch(/^pat_/);
    expect(created.plaintext).toMatch(/^wpat_/);
    expect(created.actorType).toEqual("agent");
    expect(created.scopes).toEqual(["write"]);

    await harness.tokensCommand.handler({
      subcommand: "list",
      rest: ["--token", harness.sessionToken],
      rawArgs: [],
      positionalArgs: ["tokens", "list"],
      context: output.context,
    });

    const listed = output.json[1] as Array<{ tokenId: string }>;
    expect(listed.map((token) => token.tokenId)).toContain(created.tokenId);

    await harness.tokensCommand.handler({
      subcommand: "revoke",
      rest: [created.tokenId, "--token", harness.sessionToken],
      rawArgs: [],
      positionalArgs: ["tokens", "revoke"],
      context: output.context,
    });
    expect(output.json[2]).toEqual({ ok: true, tokenId: created.tokenId });

    await harness.tokensCommand.handler({
      subcommand: "list",
      rest: ["--token", harness.sessionToken],
      rawArgs: [],
      positionalArgs: ["tokens", "list"],
      context: output.context,
    });

    const afterRevoke = output.json[3] as Array<{
      tokenId: string;
      revokedAt: string | null;
    }>;
    expect(
      afterRevoke.find((token) => token.tokenId === created.tokenId)?.revokedAt,
    ).toEqual(expect.any(String));
  });

  it("validates token create flags before creating a token", async () => {
    const harness = await setupHarness();
    const output = createOutput();

    await expect(
      harness.tokensCommand.handler({
        subcommand: "create",
        rest: [
          "--name",
          "bad-token",
          "--actor-type",
          "agent",
          "--scopes",
          "root",
          "--token",
          harness.sessionToken,
        ],
        rawArgs: [],
        positionalArgs: ["tokens", "create"],
        context: output.context,
      }),
    ).rejects.toThrow("Token scopes must be read, write, or admin");
  });

  it("gets and updates the workspace while enforcing admin role for updates", async () => {
    const harness = await setupHarness();
    const output = createOutput();

    await harness.workspaceCommand.handler({
      subcommand: "get",
      rest: ["--token", harness.sessionToken],
      rawArgs: [],
      positionalArgs: ["workspace", "get"],
      context: output.context,
    });
    expect(output.json[0]).toMatchObject({
      slug: "test-workspace",
      name: "Test Workspace",
    });

    await harness.workspaceCommand.handler({
      subcommand: "set",
      rest: [
        "--name",
        "Northwind Robotics",
        "--slug",
        "northwind-robotics",
        "--token",
        harness.sessionToken,
      ],
      rawArgs: [],
      positionalArgs: ["workspace", "set"],
      context: output.context,
    });
    expect(output.json[1]).toMatchObject({
      slug: "northwind-robotics",
      name: "Northwind Robotics",
    });

    const member = await harness.createUser({
      email: "member@example.com",
      displayName: "Member User",
      password: null,
      role: "member",
    });
    const sessions = await import("../../services/user-sessions.js");
    const memberSession = sessions.createSession(member.userId);

    await expect(
      harness.workspaceCommand.handler({
        subcommand: "set",
        rest: [
          "--name",
          "Member Rename",
          "--token",
          memberSession.sessionToken,
        ],
        rawArgs: [],
        positionalArgs: ["workspace", "set"],
        context: output.context,
      }),
    ).rejects.toThrow("Requires admin role");
  });
});
