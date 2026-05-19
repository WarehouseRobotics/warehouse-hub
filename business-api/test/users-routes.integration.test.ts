import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { closeAuthApp, createAuthApp, getCookie } from "./helpers/auth-app.js";

const createUsersApp = createAuthApp;

afterEach(closeAuthApp);

async function getOrCreateOwner() {
  const usersService = await import("../src/services/users.js");
  const existingOwner = usersService
    .listUsers()
    .find((user) => user.role === "owner");
  if (existingOwner) {
    return existingOwner;
  }

  try {
    return usersService.getUser("owner@example.com");
  } catch {
    return await usersService.createUser({
      email: "owner@example.com",
      displayName: "Owner",
      role: "owner",
    });
  }
}

describe("users routes", () => {
  it("lets admins list users, manage invitations, patch users, delete members, and audit mutations", async () => {
    const baseUrl = await createUsersApp();
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const { listAuditLogEntries } = await import("../src/services/audit-log.js");
    const owner = await getOrCreateOwner();
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
    const session = createSession(admin.userId);
    const headers = {
      "content-type": "application/json",
      cookie: `wh_session=${session.sessionToken}`,
    };

    const listResponse = await fetch(`${baseUrl}/api/v1/users`, { headers });
    const users = (await listResponse.json()) as Array<{ userId: string }>;
    expect(listResponse.status).toBe(200);
    expect(users.map((user) => user.userId)).toEqual([
      owner.userId,
      admin.userId,
      member.userId,
    ]);

    const inviteResponse = await fetch(`${baseUrl}/api/v1/users/invitations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "Invited@Example.com",
        role: "member",
      }),
    });
    const invitation = (await inviteResponse.json()) as {
      invitationId: string;
      email: string;
      invitedByUserId: string;
      role: string;
      acceptUrl: string;
    };
    expect(inviteResponse.status).toBe(201);
    expect(invitation).toMatchObject({
      invitationId: expect.stringMatching(/^inv_/),
      email: "invited@example.com",
      invitedByUserId: admin.userId,
      role: "member",
      acceptUrl: expect.stringContaining("/accept-invite/mlt_"),
    });

    const invitationsResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations`,
      { headers },
    );
    const invitations = (await invitationsResponse.json()) as Array<{
      invitationId: string;
      email: string;
      acceptedAt: string | null;
      revokedAt: string | null;
    }>;
    expect(invitationsResponse.status).toBe(200);
    expect(invitations).toEqual([
      expect.objectContaining({
        invitationId: invitation.invitationId,
        email: "invited@example.com",
        acceptedAt: null,
        revokedAt: null,
      }),
    ]);

    const revokeResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations/${invitation.invitationId}`,
      {
        method: "DELETE",
        headers,
      },
    );
    const revoked = (await revokeResponse.json()) as { revokedAt: string };
    expect(revokeResponse.status).toBe(200);
    expect(revoked.revokedAt).toEqual(expect.any(String));

    const afterRevokeInvitationsResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations`,
      { headers },
    );
    expect(afterRevokeInvitationsResponse.status).toBe(200);
    await expect(afterRevokeInvitationsResponse.json()).resolves.toEqual([]);

    const patchResponse = await fetch(
      `${baseUrl}/api/v1/users/${member.userId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          displayName: "Promoted Member",
          role: "admin",
        }),
      },
    );
    expect(patchResponse.status).toBe(200);
    expect(await patchResponse.json()).toMatchObject({
      userId: member.userId,
      displayName: "Promoted Member",
      role: "admin",
    });

    const deleteResponse = await fetch(
      `${baseUrl}/api/v1/users/${member.userId}`,
      {
        method: "DELETE",
        headers,
      },
    );
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await fetch(`${baseUrl}/api/v1/users`, {
      headers,
    });
    const afterDeleteUsers = (await afterDeleteResponse.json()) as Array<{
      userId: string;
    }>;
    expect(afterDeleteUsers.map((user) => user.userId)).toEqual([
      owner.userId,
      admin.userId,
    ]);

    const auditEntries = listAuditLogEntries();
    expect(auditEntries).toHaveLength(4);
    expect(auditEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: admin.userId,
          action: "user.invitation.create",
          objectType: "user_invitation",
          objectId: invitation.invitationId,
        }),
        expect.objectContaining({
          actorUserId: admin.userId,
          action: "user.invitation.revoke",
          objectType: "user_invitation",
          objectId: invitation.invitationId,
        }),
        expect.objectContaining({
          actorUserId: admin.userId,
          action: "user.update",
          objectType: "user",
          objectId: member.userId,
        }),
        expect.objectContaining({
          actorUserId: admin.userId,
          action: "user.delete",
          objectType: "user",
          objectId: member.userId,
        }),
      ]),
    );
  });

  it("keeps protected users routes behind auth, write scope, and admin role", async () => {
    const baseUrl = await createUsersApp();
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
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
    const readOnlyAdminToken = createToken(admin.userId, {
      name: "Read-only admin",
      actorType: "user",
      scopes: ["read"],
    });
    const memberToken = createToken(member.userId, {
      name: "Member admin scope",
      actorType: "user",
      scopes: ["admin"],
    });

    const missingResponse = await fetch(`${baseUrl}/api/v1/users`);
    expect(missingResponse.status).toBe(401);

    const memberResponse = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { authorization: `Bearer ${memberToken.plaintext}` },
    });
    expect(memberResponse.status).toBe(403);

    const memberInvitationsResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations`,
      {
        headers: { authorization: `Bearer ${memberToken.plaintext}` },
      },
    );
    expect(memberInvitationsResponse.status).toBe(403);

    const readOnlyPostResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${readOnlyAdminToken.plaintext}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "invited@example.com",
          role: "member",
        }),
      },
    );
    expect(readOnlyPostResponse.status).toBe(403);
  });

  it("accepts invitations publicly into sessions and rejects bad invitation tokens", async () => {
    const baseUrl = await createUsersApp();
    const { getOrm } = await import("../src/db/connection.js");
    const { magicLinkTokens } = await import("../src/db/schema/index.js");
    const { createInvitation, revokeInvitation } = await import(
      "../src/services/user-invitations.js"
    );
    const owner = await getOrCreateOwner();
    const invitation = await createInvitation({
      email: "new-user@example.com",
      invitedByUserId: owner.userId,
      role: "member",
    });
    const token = new URL(invitation.acceptUrl).pathname.split("/").at(-1);

    const acceptResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations/${token}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "New User",
          password: "new-user-password",
        }),
      },
    );
    const body = await acceptResponse.json();
    const cookie = getCookie(
      acceptResponse.headers.get("set-cookie"),
      "wh_session",
    );
    expect(acceptResponse.status).toBe(200);
    expect(body).toMatchObject({
      sessionToken: expect.stringMatching(/^sess_/),
      user: {
        email: "new-user@example.com",
        displayName: "New User",
        role: "member",
      },
    });
    expect(acceptResponse.headers.get("set-cookie")).toContain("HttpOnly");

    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie },
    });
    expect(meResponse.status).toBe(200);

    const ownerSession = (await import("../src/services/user-sessions.js"))
      .createSession(owner.userId);
    const pendingAfterAcceptResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations`,
      {
        headers: {
          cookie: `wh_session=${ownerSession.sessionToken}`,
        },
      },
    );
    expect(pendingAfterAcceptResponse.status).toBe(200);
    await expect(pendingAfterAcceptResponse.json()).resolves.toEqual([]);

    const reusedResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations/${token}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Reuse" }),
      },
    );
    expect(reusedResponse.status).toBe(401);

    const revokedInvitation = await createInvitation({
      email: "revoked@example.com",
      invitedByUserId: owner.userId,
      role: "member",
    });
    revokeInvitation(revokedInvitation.invitationId);
    const revokedToken = new URL(revokedInvitation.acceptUrl).pathname
      .split("/")
      .at(-1);
    const revokedResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations/${revokedToken}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Revoked" }),
      },
    );
    expect(revokedResponse.status).toBe(401);
    expect(
      getOrm()
        .select()
        .from(magicLinkTokens)
        .where(eq(magicLinkTokens.id, revokedInvitation.magicLinkTokenId))
        .get()?.consumedAt,
    ).toBeNull();

    const expiredInvitation = await createInvitation({
      email: "expired@example.com",
      invitedByUserId: owner.userId,
      role: "member",
    });
    getOrm()
      .update(magicLinkTokens)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(magicLinkTokens.id, expiredInvitation.magicLinkTokenId))
      .run();
    const expiredToken = new URL(expiredInvitation.acceptUrl).pathname
      .split("/")
      .at(-1);
    const expiredResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations/${expiredToken}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Expired" }),
      },
    );
    expect(expiredResponse.status).toBe(401);

    const invalidResponse = await fetch(
      `${baseUrl}/api/v1/users/invitations/mlt_unknown/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Invalid" }),
      },
    );
    expect(invalidResponse.status).toBe(401);
  });

  it("refuses owner role changes and owner deletion", async () => {
    const baseUrl = await createUsersApp();
    const { createSession } = await import("../src/services/user-sessions.js");
    const owner = await getOrCreateOwner();
    const session = createSession(owner.userId);
    const headers = {
      "content-type": "application/json",
      cookie: `wh_session=${session.sessionToken}`,
    };

    const patchResponse = await fetch(`${baseUrl}/api/v1/users/${owner.userId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ role: "admin" }),
    });
    const patchBody = (await patchResponse.json()) as {
      error: { code: string };
    };
    expect(patchResponse.status).toBe(400);
    expect(patchBody.error.code).toBe("owner_role_change_forbidden");

    const deleteResponse = await fetch(
      `${baseUrl}/api/v1/users/${owner.userId}`,
      {
        method: "DELETE",
        headers,
      },
    );
    const deleteBody = (await deleteResponse.json()) as {
      error: { code: string };
    };
    expect(deleteResponse.status).toBe(400);
    expect(deleteBody.error.code).toBe("owner_delete_forbidden");
  });
});
