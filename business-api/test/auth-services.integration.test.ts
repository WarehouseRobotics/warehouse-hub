import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendSendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: resendSendMock,
    },
  })),
}));

import {
  resetTestState,
  restoreServiceTestEnvironment,
} from "./helpers/services.js";

describe("auth service layer", () => {
  beforeEach(async () => {
    const { Resend } = await import("resend");
    resendSendMock.mockReset();
    vi.mocked(Resend).mockImplementation(
      () =>
        ({
          emails: {
            send: resendSendMock,
          },
        }) as never,
    );
    await resetTestState();
  });

  afterEach(async () => {
    await restoreServiceTestEnvironment();
  });

  it("creates, lists, updates, verifies, and soft-deletes users", async () => {
    const { getOrm } = await import("../src/db/connection.js");
    const { users } = await import("../src/db/schema/index.js");
    const {
      createUser,
      getUser,
      listUsers,
      softDeleteUser,
      updateUser,
      verifyUserPassword,
    } = await import("../src/services/users.js");

    const owner = createUser({
      email: "Owner@Example.com",
      displayName: "Owner",
      password: "owner-password",
      role: "owner",
    });
    const member = createUser({
      email: " Member@Example.com ",
      displayName: "Member",
      password: "member-password",
      role: "member",
    });
    const passwordless = createUser({
      email: "magic@example.com",
      displayName: "Magic Link",
      role: "member",
    });

    expect(member).toMatchObject({
      userId: expect.stringMatching(/^usr_/),
      email: "member@example.com",
      role: "member",
      deletedAt: null,
    });
    expect(getUser("MEMBER@example.com")).toEqual(member);
    expect(passwordless).toMatchObject({ email: "magic@example.com" });
    expect(() =>
      createUser({
        email: "second-owner@example.com",
        displayName: "Second Owner",
        password: "owner-password",
        role: "owner",
      }),
    ).toThrow(/active owner/i);

    const memberRow = getOrm()
      .select()
      .from(users)
      .where(eq(users.id, member.userId))
      .get();
    const passwordlessRow = getOrm()
      .select()
      .from(users)
      .where(eq(users.id, passwordless.userId))
      .get();
    expect(memberRow?.passwordHash).not.toBe("member-password");
    expect(memberRow?.passwordHash?.startsWith("$2")).toBe(true);
    expect(
      await bcrypt.compare("member-password", memberRow?.passwordHash ?? ""),
    ).toBe(true);
    expect(passwordlessRow?.passwordHash).toBeNull();

    expect(verifyUserPassword("member@example.com", "member-password")).toEqual(
      expect.objectContaining({
        userId: member.userId,
        lastLoginAt: expect.any(String),
      }),
    );
    expect(() =>
      verifyUserPassword("member@example.com", "wrong-password"),
    ).toThrow(/invalid email or password/i);
    expect(() => verifyUserPassword("magic@example.com", "anything")).toThrow(
      /invalid email or password/i,
    );

    expect(
      updateUser(member.userId, {
        displayName: "Ops Member",
        role: "admin",
        password: null,
      }),
    ).toEqual(
      expect.objectContaining({
        userId: member.userId,
        displayName: "Ops Member",
        role: "admin",
      }),
    );
    expect(() => updateUser(owner.userId, { role: "admin" })).toThrow(
      /owner user role cannot be changed/i,
    );
    expect(() => updateUser(member.userId, { role: "owner" })).toThrow(
      /active owner/i,
    );
    const clearedPasswordRow = getOrm()
      .select()
      .from(users)
      .where(eq(users.id, member.userId))
      .get();
    expect(clearedPasswordRow?.passwordHash).toBeNull();

    expect(() => softDeleteUser(owner.userId)).toThrow(
      /owner user cannot be deleted/i,
    );
    softDeleteUser(member.userId);
    expect(listUsers().map((user) => user.userId)).toEqual([
      owner.userId,
      passwordless.userId,
    ]);
    expect(() => getUser(member.userId)).toThrow(/user not found/i);
  });

  it("creates active sessions, renews them on use, and revokes them", async () => {
    const { getOrm } = await import("../src/db/connection.js");
    const { userSessions } = await import("../src/db/schema/index.js");
    const { createUser } = await import("../src/services/users.js");
    const {
      createSession,
      requireActiveSession,
      revokeAllSessionsForUser,
      revokeSession,
    } = await import("../src/services/user-sessions.js");

    const user = createUser({
      email: "session@example.com",
      displayName: "Session User",
      password: "password",
      role: "member",
    });
    const session = createSession(user.userId, {
      ttlDays: 1,
      userAgent: "Vitest",
    });

    expect(session).toEqual(
      expect.objectContaining({
        sessionId: expect.stringMatching(/^sess_/),
        sessionToken: expect.stringMatching(/^sess_/),
        userId: user.userId,
        userAgent: "Vitest",
        lastUsedAt: null,
      }),
    );
    expect("tokenHash" in session).toBe(false);

    const sessionRow = getOrm()
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, session.sessionId))
      .get();
    expect(sessionRow?.tokenHash).not.toBe(session.sessionToken);
    expect(sessionRow?.tokenHash).toHaveLength(64);

    const active = requireActiveSession(session.sessionToken);
    expect(active).toEqual(
      expect.objectContaining({
        sessionId: session.sessionId,
        userId: user.userId,
        lastUsedAt: expect.any(String),
        user: expect.objectContaining({ userId: user.userId }),
      }),
    );
    expect(Date.parse(active.expiresAt)).toBeGreaterThan(
      Date.parse(session.expiresAt),
    );

    const expired = createSession(user.userId, { ttlDays: -1 });
    expect(() => requireActiveSession(expired.sessionToken)).toThrow(
      /invalid or expired/i,
    );
    expect(() => requireActiveSession("not-a-session")).toThrow(
      /invalid or expired/i,
    );
    expect(() => requireActiveSession("sess_unknown")).toThrow(
      /invalid or expired/i,
    );

    revokeSession(session.sessionId);
    expect(() => requireActiveSession(session.sessionToken)).toThrow(
      /invalid or expired/i,
    );

    const first = createSession(user.userId);
    const second = createSession(user.userId);
    revokeAllSessionsForUser(user.userId);
    expect(() => requireActiveSession(first.sessionToken)).toThrow(
      /invalid or expired/i,
    );
    expect(() => requireActiveSession(second.sessionToken)).toThrow(
      /invalid or expired/i,
    );
  });

  it("creates, lists, validates, uses, and revokes personal access tokens", async () => {
    const { getOrm } = await import("../src/db/connection.js");
    const { personalAccessTokens } = await import("../src/db/schema/index.js");
    const { createUser } = await import("../src/services/users.js");
    const { createToken, listTokensForUser, requireActiveToken, revokeToken } =
      await import("../src/services/personal-access-tokens.js");

    const user = createUser({
      email: "token@example.com",
      displayName: "Token User",
      password: "password",
      role: "admin",
    });
    const token = createToken(user.userId, {
      name: "Claude Desktop",
      actorType: "agent",
      scopes: ["write"],
      expiresAt: null,
    });

    expect(token).toEqual(
      expect.objectContaining({
        tokenId: expect.stringMatching(/^pat_/),
        plaintext: expect.stringMatching(/^wpat_/),
        userId: user.userId,
        actorType: "agent",
        scopes: ["write"],
        lastUsedAt: null,
      }),
    );
    expect("tokenHash" in token).toBe(false);

    const tokenRow = getOrm()
      .select()
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.id, token.tokenId))
      .get();
    expect(tokenRow?.tokenHash).not.toBe(token.plaintext);
    expect(tokenRow?.tokenHash).toHaveLength(64);
    expect(tokenRow?.scopes).toBe(JSON.stringify(["write"]));

    const listed = listTokensForUser(user.userId);
    expect(listed).toEqual([
      expect.objectContaining({
        tokenId: token.tokenId,
        scopes: ["write"],
      }),
    ]);
    expect("plaintext" in listed[0]).toBe(false);
    expect("tokenHash" in listed[0]).toBe(false);

    const active = requireActiveToken(token.plaintext);
    expect(active).toEqual(
      expect.objectContaining({
        tokenId: token.tokenId,
        userId: user.userId,
        lastUsedAt: expect.any(String),
        user: expect.objectContaining({ userId: user.userId }),
      }),
    );

    expect(() =>
      createToken(user.userId, {
        name: "Invalid scopes",
        actorType: "agent",
        scopes: [],
      }),
    ).toThrow(/scopes are invalid/i);
    expect(() => requireActiveToken("not-a-pat")).toThrow(
      /invalid or expired/i,
    );
    expect(() => requireActiveToken("wpat_unknown")).toThrow(
      /invalid or expired/i,
    );

    const expired = createToken(user.userId, {
      name: "Expired",
      actorType: "user",
      scopes: ["read"],
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(() => requireActiveToken(expired.plaintext)).toThrow(
      /invalid or expired/i,
    );

    revokeToken(token.tokenId, user.userId);
    expect(() => requireActiveToken(token.plaintext)).toThrow(
      /invalid or expired/i,
    );
  });

  it("writes and queries audit log entries", async () => {
    const { createUser } = await import("../src/services/users.js");
    const { createToken } =
      await import("../src/services/personal-access-tokens.js");
    const { listAuditLogEntries, writeAuditLogEntry } =
      await import("../src/services/audit-log.js");

    const user = createUser({
      email: "audit@example.com",
      displayName: "Audit User",
      password: "password",
      role: "admin",
    });
    const token = createToken(user.userId, {
      name: "Audit Agent",
      actorType: "agent",
      scopes: ["write"],
    });

    const first = writeAuditLogEntry({
      at: "2026-05-15T09:00:00.000Z",
      actorUserId: user.userId,
      actorType: "user",
      action: "expense.create",
      objectType: "expense",
      objectId: "exp_001",
      requestId: "req_001",
      metadata: { source: "dashboard", amount: 120 },
    });
    const second = writeAuditLogEntry({
      at: "2026-05-15T10:00:00.000Z",
      actorUserId: user.userId,
      actorTokenId: token.tokenId,
      actorType: "agent",
      action: "task.update",
      objectType: "task",
      objectId: "tsk_001",
      requestId: "req_002",
      metadata: { fields: ["status"] },
    });
    const third = writeAuditLogEntry({
      at: "2026-05-15T11:00:00.000Z",
      actorType: "system",
      action: "workspace.bootstrap",
      objectType: "workspace",
      objectId: "ws_default",
      requestId: "req_003",
      metadata: { seeded: true },
    });

    expect(first).toEqual(
      expect.objectContaining({
        auditEntryId: expect.stringMatching(/^aud_/),
        metadata: { source: "dashboard", amount: 120 },
      }),
    );
    expect(second.metadata).toEqual({ fields: ["status"] });
    expect(third.actorUserId).toBeNull();
    expect(third.actorTokenId).toBeNull();

    expect(listAuditLogEntries().map((entry) => entry.auditEntryId)).toEqual([
      third.auditEntryId,
      second.auditEntryId,
      first.auditEntryId,
    ]);
    expect(
      listAuditLogEntries({ actorUserId: user.userId }).map(
        (entry) => entry.auditEntryId,
      ),
    ).toEqual([second.auditEntryId, first.auditEntryId]);
    expect(
      listAuditLogEntries({ actorTokenId: token.tokenId }).map(
        (entry) => entry.auditEntryId,
      ),
    ).toEqual([second.auditEntryId]);
    expect(
      listAuditLogEntries({ actorType: "system" }).map(
        (entry) => entry.auditEntryId,
      ),
    ).toEqual([third.auditEntryId]);
    expect(
      listAuditLogEntries({ objectType: "expense", objectId: "exp_001" }).map(
        (entry) => entry.auditEntryId,
      ),
    ).toEqual([first.auditEntryId]);
    expect(
      listAuditLogEntries({ action: "task.update" }).map(
        (entry) => entry.auditEntryId,
      ),
    ).toEqual([second.auditEntryId]);
    expect(
      listAuditLogEntries({ requestId: "req_003" }).map(
        (entry) => entry.auditEntryId,
      ),
    ).toEqual([third.auditEntryId]);
    expect(
      listAuditLogEntries({
        after: "2026-05-15T09:30:00.000Z",
        before: "2026-05-15T10:30:00.000Z",
      }).map((entry) => entry.auditEntryId),
    ).toEqual([second.auditEntryId]);
    expect(listAuditLogEntries({ limit: 1 })).toHaveLength(1);
    expect(listAuditLogEntries({ limit: 0 })).toHaveLength(1);
  });

  it("creates, consumes, rejects, and expires magic-link tokens", async () => {
    const { getOrm } = await import("../src/db/connection.js");
    const { magicLinkTokens } = await import("../src/db/schema/index.js");
    const { createMagicLink, consumeMagicLink, expireMagicLinks } =
      await import("../src/services/magic-link-tokens.js");

    const magicLink = createMagicLink({
      email: " Login@Example.com ",
      purpose: "login",
    });

    expect(magicLink).toEqual(
      expect.objectContaining({
        magicLinkTokenId: expect.stringMatching(/^mlt_/),
        token: expect.stringMatching(/^mlt_/),
        email: "login@example.com",
        purpose: "login",
        consumedAt: null,
      }),
    );
    expect("tokenHash" in magicLink).toBe(false);

    const tokenRow = getOrm()
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.id, magicLink.magicLinkTokenId))
      .get();
    expect(tokenRow?.tokenHash).not.toBe(magicLink.token);
    expect(tokenRow?.tokenHash).toHaveLength(64);

    const consumed = consumeMagicLink(magicLink.token, "login");
    expect(consumed).toEqual(
      expect.objectContaining({
        magicLinkTokenId: magicLink.magicLinkTokenId,
        consumedAt: expect.any(String),
      }),
    );
    expect(
      getOrm()
        .select()
        .from(magicLinkTokens)
        .where(eq(magicLinkTokens.id, magicLink.magicLinkTokenId))
        .get()?.consumedAt,
    ).toEqual(consumed.consumedAt);

    expect(() => consumeMagicLink(magicLink.token, "login")).toThrow(
      /invalid or expired/i,
    );
    expect(() => consumeMagicLink("not-a-token", "login")).toThrow(
      /invalid or expired/i,
    );
    expect(() => consumeMagicLink("mlt_unknown", "login")).toThrow(
      /invalid or expired/i,
    );

    const wrongPurpose = createMagicLink({
      email: "invite@example.com",
      purpose: "invite_accept",
    });
    expect(() => consumeMagicLink(wrongPurpose.token, "login")).toThrow(
      /invalid or expired/i,
    );

    const expired = createMagicLink({
      email: "expired@example.com",
      purpose: "login",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(() => consumeMagicLink(expired.token, "login")).toThrow(
      /invalid or expired/i,
    );

    const oldActive = createMagicLink({
      email: "old@example.com",
      purpose: "login",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const stillActive = createMagicLink({
      email: "active@example.com",
      purpose: "login",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(expireMagicLinks({ purpose: "login" })).toBeGreaterThanOrEqual(2);

    const expiredRow = getOrm()
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.id, oldActive.magicLinkTokenId))
      .get();
    const activeRow = getOrm()
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.id, stillActive.magicLinkTokenId))
      .get();
    expect(expiredRow?.consumedAt).toEqual(expect.any(String));
    expect(activeRow?.consumedAt).toBeNull();
  });

  it("creates, accepts, lists, and revokes user invitations", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { getOrm } = await import("../src/db/connection.js");
    const { magicLinkTokens, userInvitations, users } =
      await import("../src/db/schema/index.js");
    const { createUser, softDeleteUser } = await import(
      "../src/services/users.js"
    );
    const {
      acceptInvitation,
      createInvitation,
      listPendingInvitations,
      revokeInvitation,
    } = await import("../src/services/user-invitations.js");

    const inviter = createUser({
      email: "admin@example.com",
      displayName: "Admin User",
      password: "admin-password",
      role: "admin",
    });
    const invitation = await createInvitation({
      email: " Teammate@Example.com ",
      invitedByUserId: inviter.userId,
      role: "member",
    });

    expect(invitation).toEqual(
      expect.objectContaining({
        invitationId: expect.stringMatching(/^inv_/),
        email: "teammate@example.com",
        invitedByUserId: inviter.userId,
        role: "member",
        magicLinkTokenId: expect.stringMatching(/^mlt_/),
        acceptUrl: expect.stringContaining("/accept-invite/mlt_"),
      }),
    );
    expect(listPendingInvitations().map((item) => item.invitationId)).toEqual([
      invitation.invitationId,
    ]);

    const token = new URL(invitation.acceptUrl).pathname.split("/").at(-1);
    expect(token).toEqual(expect.stringMatching(/^mlt_/));

    const accepted = acceptInvitation(token ?? "", {
      displayName: "Teammate",
      password: "member-password",
      userAgent: "Vitest",
    });
    expect(accepted).toEqual(
      expect.objectContaining({
        invitation: expect.objectContaining({
          invitationId: invitation.invitationId,
          acceptedAt: expect.any(String),
        }),
        user: expect.objectContaining({
          email: "teammate@example.com",
          displayName: "Teammate",
          role: "member",
        }),
        session: expect.objectContaining({
          sessionToken: expect.stringMatching(/^sess_/),
          userAgent: "Vitest",
        }),
      }),
    );

    const userRow = getOrm()
      .select()
      .from(users)
      .where(eq(users.id, accepted.user.userId))
      .get();
    expect(userRow?.passwordHash).not.toBe("member-password");
    expect(userRow?.passwordHash?.startsWith("$2")).toBe(true);
    expect(
      await bcrypt.compare("member-password", userRow?.passwordHash ?? ""),
    ).toBe(true);

    expect(() =>
      acceptInvitation(token ?? "", { displayName: "Second Try" }),
    ).toThrow(/invalid or expired/i);
    expect(listPendingInvitations()).toEqual([]);

    softDeleteUser(accepted.user.userId);
    const reInvitation = await createInvitation({
      email: " Teammate@Example.com ",
      invitedByUserId: inviter.userId,
      role: "member",
    });
    const reToken = new URL(reInvitation.acceptUrl).pathname.split("/").at(-1);
    const reAccepted = acceptInvitation(reToken ?? "", {
      displayName: "Teammate Again",
    });
    expect(reAccepted.user).toEqual(
      expect.objectContaining({
        email: "teammate@example.com",
        displayName: "Teammate Again",
      }),
    );
    expect(reAccepted.user.userId).not.toBe(accepted.user.userId);

    const active = await createInvitation({
      email: "active-invite@example.com",
      invitedByUserId: inviter.userId,
      role: "admin",
    });
    const revoked = await createInvitation({
      email: "revoked-invite@example.com",
      invitedByUserId: inviter.userId,
      role: "member",
    });
    const revokedToken = new URL(revoked.acceptUrl).pathname.split("/").at(-1);
    expect(revokeInvitation(revoked.invitationId)).toEqual(
      expect.objectContaining({
        invitationId: revoked.invitationId,
        revokedAt: expect.any(String),
      }),
    );
    expect(() =>
      acceptInvitation(revokedToken ?? "", { displayName: "Revoked" }),
    ).toThrow(/invalid or expired/i);
    expect(listPendingInvitations().map((item) => item.invitationId)).toEqual([
      active.invitationId,
    ]);

    const expired = await createInvitation({
      email: "expired-invite@example.com",
      invitedByUserId: inviter.userId,
      role: "member",
    });
    const expiredToken = new URL(expired.acceptUrl).pathname.split("/").at(-1);
    getOrm()
      .update(magicLinkTokens)
      .set({ expiresAt: new Date(Date.now() - 1_000).toISOString() })
      .where(eq(magicLinkTokens.id, expired.magicLinkTokenId))
      .run();
    expect(() =>
      acceptInvitation(expiredToken ?? "", { displayName: "Expired" }),
    ).toThrow(/invalid or expired/i);
    expect(() =>
      acceptInvitation("not-a-token", { displayName: "Invalid" }),
    ).toThrow(/invalid or expired/i);

    const race = await createInvitation({
      email: "race@example.com",
      invitedByUserId: inviter.userId,
      role: "member",
    });
    const raceToken = new URL(race.acceptUrl).pathname.split("/").at(-1);
    createUser({
      email: "race@example.com",
      displayName: "Race Winner",
      role: "member",
    });
    expect(() =>
      acceptInvitation(raceToken ?? "", { displayName: "Race Loser" }),
    ).toThrow(/user already exists/i);

    await expect(
      createInvitation({
        email: "owner-invite@example.com",
        invitedByUserId: inviter.userId,
        role: "owner" as never,
      }),
    ).rejects.toThrow(/role is invalid/i);
    await expect(
      createInvitation({
        email: "missing-inviter@example.com",
        invitedByUserId: "usr_missing",
        role: "member",
      }),
    ).rejects.toThrow(/user not found/i);

    const storedInvitation = getOrm()
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.id, invitation.invitationId))
      .get();
    expect(storedInvitation?.acceptedAt).toEqual(expect.any(String));
  });

  it("builds auth email URLs and skips delivery when Resend is unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { logger } = await import("../src/lib/logger.js");
    const { buildMagicLinkLoginUrl, buildUserInviteUrl, magicLinkLoginEmail } =
      await import("../src/services/email.js");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    expect(buildMagicLinkLoginUrl("mlt_login")).toBe(
      "http://localhost:5173/auth/consume?token=mlt_login",
    );
    expect(buildUserInviteUrl("mlt_invite")).toBe(
      "http://localhost:5173/accept-invite/mlt_invite",
    );

    await magicLinkLoginEmail({
      to: "login@example.com",
      token: "mlt_login",
      expiresAt: "2026-05-15T12:00:00.000Z<script>",
    });

    expect(resendSendMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Email delivery skipped because RESEND_API_KEY is unset",
      expect.objectContaining({
        to: "login@example.com",
        subject: "Your Warehouse Hub sign-in link",
        html: expect.stringContaining(
          "http://localhost:5173/auth/consume?token=mlt_login",
        ),
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "Email delivery skipped because RESEND_API_KEY is unset",
      expect.objectContaining({
        html: expect.stringContaining(
          "2026-05-15T12:00:00.000Z&lt;script&gt;",
        ),
      }),
    );
  });

  it("sends auth emails through Resend and surfaces delivery errors", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    resendSendMock.mockResolvedValueOnce({
      data: { id: "email_123" },
      error: null,
    });
    resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "domain not verified" },
    });
    const { userInviteEmail, magicLinkLoginEmail } =
      await import("../src/services/email.js");

    await userInviteEmail({
      to: "invite@example.com",
      inviterName: "Admin <Owner>",
      workspaceName: "Warehouse & Co",
      token: "mlt_invite",
      expiresAt: '2026-05-15T12:00:00.000Z"><img src=x>',
    });

    expect(resendSendMock).toHaveBeenCalledWith({
      from: "Warehouse Hub <onboarding@wrobo.io>",
      to: "invite@example.com",
      subject: "Invitation to Warehouse & Co",
      html: [
        "<p>Admin &lt;Owner&gt; invited you to Warehouse &amp; Co.</p>",
        '<p><a href="http://localhost:5173/accept-invite/mlt_invite">Accept invitation</a></p>',
        "<p>This invitation expires at 2026-05-15T12:00:00.000Z&quot;&gt;&lt;img src=x&gt;.</p>",
      ].join(""),
    });

    await expect(
      magicLinkLoginEmail({
        to: "login@example.com",
        token: "mlt_login",
        expiresAt: "2026-05-15T12:00:00.000Z",
      }),
    ).rejects.toThrow(/domain not verified/i);
  });
});
