import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resetTestState,
  restoreServiceTestEnvironment,
} from "./helpers/services.js";

describe("auth service layer", () => {
  beforeEach(async () => {
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
});
