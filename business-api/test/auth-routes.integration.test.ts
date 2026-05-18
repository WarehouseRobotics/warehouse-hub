import { afterEach, describe, expect, it, vi } from "vitest";

import { closeAuthApp, createAuthApp, getCookie } from "./helpers/auth-app.js";

afterEach(closeAuthApp);

describe("auth routes", () => {
  it("logs in with a password, sets a session cookie, and returns /auth/me", async () => {
    const baseUrl = await createAuthApp();
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
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
    const meBody = await meResponse.json();

    expect(meResponse.status).toBe(200);
    expect(meBody).toMatchObject({
      user: {
        id: user.userId,
        email: "owner@example.com",
        displayName: "Owner",
        role: "owner",
      },
      workspace: {
        slug: "default",
        name: "Default Workspace",
      },
    });
    expect(meBody).not.toHaveProperty("role");
  });

  it("rejects wrong passwords and disabled password login", async () => {
    let baseUrl = await createAuthApp();
    const { createUser } = await import("../src/services/users.js");
    await createUser({
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

    await closeAuthApp();

    baseUrl = await createAuthApp({ HUB_PASSWORD_LOGIN: "0" });
    const { createUser: createDisabledUser } =
      await import("../src/services/users.js");
    await createDisabledUser({
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

    await closeAuthApp();

    baseUrl = await createAuthApp({
      AUTH_PASSWORD_LOGIN_ENABLED: "false",
      HUB_PASSWORD_LOGIN: "1",
    });
    const { createUser: createCanonicalDisabledUser } =
      await import("../src/services/users.js");
    await createCanonicalDisabledUser({
      email: "canonical-disabled@example.com",
      displayName: "Canonical Disabled",
      password: "owner-password",
      role: "owner",
    });

    const canonicalDisabledResponse = await fetch(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "canonical-disabled@example.com",
          password: "owner-password",
        }),
      },
    );
    const canonicalDisabledBody = (await canonicalDisabledResponse.json()) as {
      error: { code: string };
    };

    expect(canonicalDisabledResponse.status).toBe(403);
    expect(canonicalDisabledBody.error.code).toBe("password_login_disabled");
  });

  it("rate limits login attempts by normalized email before password verification", async () => {
    const baseUrl = await createAuthApp({
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_LOGIN_IP_LIMIT: "100",
      AUTH_LOGIN_EMAIL_LIMIT: "2",
    });
    const { createUser } = await import("../src/services/users.js");
    await createUser({
      email: "limited@example.com",
      displayName: "Limited User",
      password: "owner-password",
      role: "owner",
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Limited@Example.com",
          password: "wrong-password",
        }),
      });
      expect(response.status).toBe(401);
    }

    const limitedResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "limited@example.com",
        password: "owner-password",
      }),
    });
    const limitedBody = (await limitedResponse.json()) as {
      error: {
        code: string;
        retryAfterSeconds: number;
        limit: number;
        windowMs: number;
      };
    };

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("retry-after")).toBe("60");
    expect(limitedResponse.headers.get("set-cookie")).toBeNull();
    expect(limitedBody.error).toMatchObject({
      code: "rate_limit_exceeded",
      retryAfterSeconds: 60,
      limit: 2,
      windowMs: 60000,
    });
  });

  it("rate limits login attempts by caller IP across emails", async () => {
    const baseUrl = await createAuthApp({
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_LOGIN_IP_LIMIT: "2",
      AUTH_LOGIN_EMAIL_LIMIT: "100",
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `missing-${attempt}@example.com`,
          password: "wrong-password",
        }),
      });
      expect(response.status).toBe(401);
    }

    const limitedResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "another-missing@example.com",
        password: "wrong-password",
      }),
    });
    const limitedBody = (await limitedResponse.json()) as {
      error: { code: string; limit: number; windowMs: number };
    };

    expect(limitedResponse.status).toBe(429);
    expect(limitedBody.error).toMatchObject({
      code: "rate_limit_exceeded",
      limit: 2,
      windowMs: 60000,
    });
  });

  it("always returns 204 for magic-link requests and only emails known users", async () => {
    const baseUrl = await createAuthApp();
    const { getOrm } = await import("../src/db/connection.js");
    const { magicLinkTokens } = await import("../src/db/schema/index.js");
    const { logger } = await import("../src/lib/logger.js");
    const { createUser } = await import("../src/services/users.js");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    await createUser({
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
    await new Promise((resolve) => setImmediate(resolve));
    expect(getOrm().select().from(magicLinkTokens).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "magic@example.com",
          purpose: "login",
        }),
        expect.objectContaining({
          email: "magic-link-request-sink@warehouse-hub.invalid",
          purpose: "login",
        }),
      ]),
    );
    expect(getOrm().select().from(magicLinkTokens).all()).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "Email delivery skipped because RESEND_API_KEY is unset",
      expect.objectContaining({
        to: "magic@example.com",
        subject: "Your Warehouse Hub sign-in link",
      }),
    );
  });

  it("rate limits magic-link requests without creating extra tokens or emails", async () => {
    const baseUrl = await createAuthApp({
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_MAGIC_LINK_REQUEST_IP_LIMIT: "100",
      AUTH_MAGIC_LINK_REQUEST_EMAIL_LIMIT: "2",
    });
    const { getOrm } = await import("../src/db/connection.js");
    const { magicLinkTokens } = await import("../src/db/schema/index.js");
    const { logger } = await import("../src/lib/logger.js");
    const { createUser } = await import("../src/services/users.js");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    await createUser({
      email: "magic-limited@example.com",
      displayName: "Magic Limited",
      role: "member",
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(
        `${baseUrl}/api/v1/auth/magic-link/request`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "Magic-Limited@Example.com" }),
        },
      );
      expect(response.status).toBe(204);
    }

    const limitedResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/request`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "magic-limited@example.com" }),
      },
    );
    const limitedBody = (await limitedResponse.json()) as {
      error: { code: string; limit: number; windowMs: number };
    };

    await new Promise((resolve) => setImmediate(resolve));
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("retry-after")).toBe("60");
    expect(limitedBody.error).toMatchObject({
      code: "rate_limit_exceeded",
      limit: 2,
      windowMs: 60000,
    });
    expect(getOrm().select().from(magicLinkTokens).all()).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("rejects magic-link request and consume when magic links are disabled", async () => {
    const baseUrl = await createAuthApp({ AUTH_MAGIC_LINK_ENABLED: "false" });

    const requestResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/request`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "magic@example.com" }),
      },
    );
    const consumeResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/consume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "mlt_disabled" }),
      },
    );

    expect(requestResponse.status).toBe(403);
    expect(
      (await requestResponse.json()) as { error: { code: string } },
    ).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "magic_link_disabled" }),
      }),
    );
    expect(consumeResponse.status).toBe(403);
    expect(
      (await consumeResponse.json()) as { error: { code: string } },
    ).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "magic_link_disabled" }),
      }),
    );
  });

  it("consumes magic links into sessions and rejects reuse or invalid tokens", async () => {
    const baseUrl = await createAuthApp();
    const { createMagicLink } =
      await import("../src/services/magic-link-tokens.js");
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
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

  it("rate limits magic-link consume attempts by token hash", async () => {
    const baseUrl = await createAuthApp({
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_MAGIC_LINK_CONSUME_IP_LIMIT: "100",
      AUTH_MAGIC_LINK_CONSUME_TOKEN_LIMIT: "2",
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(
        `${baseUrl}/api/v1/auth/magic-link/consume`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: "mlt_unknown" }),
        },
      );
      expect(response.status).toBe(401);
    }

    const limitedResponse = await fetch(
      `${baseUrl}/api/v1/auth/magic-link/consume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "mlt_unknown" }),
      },
    );
    const limitedBody = (await limitedResponse.json()) as {
      error: { code: string; limit: number; windowMs: number };
    };

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("retry-after")).toBe("60");
    expect(limitedBody.error).toMatchObject({
      code: "rate_limit_exceeded",
      limit: 2,
      windowMs: 60000,
    });
  });

  it("can disable auth rate limiting through config", async () => {
    const baseUrl = await createAuthApp({
      AUTH_RATE_LIMIT_ENABLED: "false",
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_LOGIN_IP_LIMIT: "1",
      AUTH_LOGIN_EMAIL_LIMIT: "1",
    });
    const { createUser } = await import("../src/services/users.js");
    await createUser({
      email: "unlimited@example.com",
      displayName: "Unlimited User",
      password: "owner-password",
      role: "owner",
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "unlimited@example.com",
          password: "wrong-password",
        }),
      });
      expect(response.status).toBe(401);
    }

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "unlimited@example.com",
        password: "owner-password",
      }),
    });

    expect(loginResponse.status).toBe(200);
    expect(
      getCookie(loginResponse.headers.get("set-cookie"), "wh_session"),
    ).toMatch(/^wh_session=sess_/);
  });

  it("logs out by revoking the active session and clearing the cookie", async () => {
    const baseUrl = await createAuthApp();
    const { createSession } = await import("../src/services/user-sessions.js");
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
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
    const { createToken } =
      await import("../src/services/personal-access-tokens.js");
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
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
    const patBody = await patResponse.json();
    expect(patResponse.status).toBe(200);
    expect(patBody).toMatchObject({
      user: {
        id: user.userId,
        email: "agent-owner@example.com",
        role: "admin",
      },
    });
    expect(patBody).not.toHaveProperty("role");

    const legacyResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: "Bearer test-api-key" },
    });
    const legacyBody = await legacyResponse.json();
    expect(legacyResponse.status).toBe(200);
    expect(legacyBody).toMatchObject({
      user: null,
      workspace: {
        slug: "default",
        name: "Default Workspace",
      },
    });
    expect(legacyBody).not.toHaveProperty("role");
  });
});
