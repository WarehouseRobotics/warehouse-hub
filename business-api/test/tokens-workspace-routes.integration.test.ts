import { afterEach, describe, expect, it } from "vitest";

import { closeAuthApp, createAuthApp } from "./helpers/auth-app.js";

const createRoutesApp = createAuthApp;

afterEach(closeAuthApp);

describe("tokens routes", () => {
  it("lets an authenticated user create, list, and revoke their own PATs", async () => {
    const baseUrl = await createRoutesApp();
    const { listAuditLogEntries } = await import("../src/services/audit-log.js");
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
      email: "member@example.com",
      displayName: "Member",
      role: "member",
    });
    const session = createSession(user.userId);
    const headers = {
      "content-type": "application/json",
      cookie: `wh_session=${session.sessionToken}`,
    };

    const createResponse = await fetch(`${baseUrl}/api/v1/tokens`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Claude Desktop",
        actorType: "agent",
        scopes: ["write"],
        expiresAt: null,
      }),
    });
    const created = (await createResponse.json()) as {
      tokenId: string;
      plaintext: string;
    };
    expect(createResponse.status).toBe(201);
    expect(created).toMatchObject({
      tokenId: expect.stringMatching(/^pat_/),
      plaintext: expect.stringMatching(/^wpat_/),
    });

    const listResponse = await fetch(`${baseUrl}/api/v1/tokens`, { headers });
    const tokens = (await listResponse.json()) as Array<{
      tokenId: string;
      plaintext?: string;
      tokenHash?: string;
      revokedAt: string | null;
    }>;
    expect(listResponse.status).toBe(200);
    expect(tokens).toEqual([
      expect.objectContaining({
        tokenId: created.tokenId,
        revokedAt: null,
      }),
    ]);
    expect(tokens[0].plaintext).toBeUndefined();
    expect(tokens[0].tokenHash).toBeUndefined();

    const deleteResponse = await fetch(
      `${baseUrl}/api/v1/tokens/${created.tokenId}`,
      {
        method: "DELETE",
        headers,
      },
    );
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await fetch(`${baseUrl}/api/v1/tokens`, {
      headers,
    });
    const afterDeleteTokens = (await afterDeleteResponse.json()) as Array<{
      tokenId: string;
      revokedAt: string | null;
    }>;
    expect(afterDeleteTokens).toEqual([
      expect.objectContaining({
        tokenId: created.tokenId,
        revokedAt: expect.any(String),
      }),
    ]);

    expect(listAuditLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: user.userId,
          action: "personal_access_token.create",
          objectType: "personal_access_token",
          objectId: created.tokenId,
        }),
        expect.objectContaining({
          actorUserId: user.userId,
          action: "personal_access_token.revoke",
          objectType: "personal_access_token",
          objectId: created.tokenId,
        }),
      ]),
    );
  });

  it("keeps token revocation scoped to the current user", async () => {
    const baseUrl = await createRoutesApp();
    const { createToken, requireActiveToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const firstUser = await createUser({
      email: "first@example.com",
      displayName: "First",
      role: "member",
    });
    const secondUser = await createUser({
      email: "second@example.com",
      displayName: "Second",
      role: "member",
    });
    const secondUserToken = createToken(secondUser.userId, {
      name: "Other user's token",
      actorType: "user",
      scopes: ["read"],
    });
    const session = createSession(firstUser.userId);

    const response = await fetch(
      `${baseUrl}/api/v1/tokens/${secondUserToken.tokenId}`,
      {
        method: "DELETE",
        headers: { cookie: `wh_session=${session.sessionToken}` },
      },
    );

    expect(response.status).toBe(404);
    expect(requireActiveToken(secondUserToken.plaintext).tokenId).toBe(
      secondUserToken.tokenId,
    );
  });

  it("requires auth and write scope for mutating token routes", async () => {
    const baseUrl = await createRoutesApp();
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
      email: "readonly@example.com",
      displayName: "Read Only",
      role: "member",
    });
    const readOnlyToken = createToken(user.userId, {
      name: "Read only",
      actorType: "user",
      scopes: ["read"],
    });

    const missingResponse = await fetch(`${baseUrl}/api/v1/tokens`);
    expect(missingResponse.status).toBe(401);

    const readOnlyCreateResponse = await fetch(`${baseUrl}/api/v1/tokens`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${readOnlyToken.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Blocked",
        actorType: "user",
        scopes: ["read"],
      }),
    });
    expect(readOnlyCreateResponse.status).toBe(403);

    const readOnlyDeleteResponse = await fetch(
      `${baseUrl}/api/v1/tokens/${readOnlyToken.tokenId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${readOnlyToken.plaintext}` },
      },
    );
    expect(readOnlyDeleteResponse.status).toBe(403);
  });
});

describe("workspace routes", () => {
  it("returns the singleton workspace to authenticated users", async () => {
    const baseUrl = await createRoutesApp();
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
      email: "member@example.com",
      displayName: "Member",
      role: "member",
    });
    const session = createSession(user.userId);

    const response = await fetch(`${baseUrl}/api/v1/workspace`, {
      headers: { cookie: `wh_session=${session.sessionToken}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: expect.stringMatching(/^ws_/),
      slug: "default",
      name: "Default Workspace",
      deletedAt: null,
    });
  });

  it("lets admins patch the workspace and audits the update", async () => {
    const baseUrl = await createRoutesApp();
    const { listAuditLogEntries } = await import("../src/services/audit-log.js");
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const admin = await createUser({
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
    });
    const session = createSession(admin.userId);

    const response = await fetch(`${baseUrl}/api/v1/workspace`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `wh_session=${session.sessionToken}`,
      },
      body: JSON.stringify({
        name: "Warehouse Robotics",
        slug: "warehouse-robotics",
      }),
    });
    const workspace = (await response.json()) as { id: string };

    expect(response.status).toBe(200);
    expect(workspace).toMatchObject({
      slug: "warehouse-robotics",
      name: "Warehouse Robotics",
    });
    expect(listAuditLogEntries()).toEqual([
      expect.objectContaining({
        actorUserId: admin.userId,
        action: "workspace.update",
        objectType: "workspace",
        objectId: workspace.id,
      }),
    ]);
  });

  it("requires admin role for workspace patches", async () => {
    const baseUrl = await createRoutesApp();
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const member = await createUser({
      email: "member@example.com",
      displayName: "Member",
      role: "member",
    });
    const session = createSession(member.userId);

    const response = await fetch(`${baseUrl}/api/v1/workspace`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `wh_session=${session.sessionToken}`,
      },
      body: JSON.stringify({ name: "Blocked" }),
    });

    expect(response.status).toBe(403);
  });
});
