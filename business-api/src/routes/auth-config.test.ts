import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";

import { createApp } from "../app.js";
import { config } from "../config.js";

describe("auth config route", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it("returns public auth method capabilities without credentials", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/config`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      passwordLoginEnabled: config.AUTH_PASSWORD_LOGIN_ENABLED,
      magicLinkEnabled: config.AUTH_MAGIC_LINK_ENABLED,
    });
  });
});
