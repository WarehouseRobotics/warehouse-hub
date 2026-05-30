import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");

async function resetTestState() {
  const { resetDatabase, initializeDatabase } = await import("../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(testDataDir, "uploads"), { recursive: true, force: true });
  initializeDatabase();
}

function runCli(args: string[]): string {
  const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");
  return execFileSync(tsxPath, ["src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "3199",
      API_KEY: "test-api-key",
      DATABASE_PATH: "./test-data/business-api.sqlite",
      UPLOAD_DIR: "./test-data/uploads",
      OCR_STUB_MODE: "true",
      EMBEDDING_ALLOW_STUB_FALLBACK: "true",
    },
    encoding: "utf8",
  });
}

describe("data-cache service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates caches, validates entries, and finds nearest fallback values", async () => {
    const { createCache, getCache, upsertEntry, lookup } = await import("../src/services/data-caches.js");

    const created = createCache({
      slug: "currency-rates-eur-usd",
      displayName: "Currency Rates EUR/USD",
      keyType: "date",
    });

    expect(created.valueSchema).toEqual({
      type: "object",
      properties: {
        value: {},
      },
      required: ["value"],
    });
    expect(getCache("currency-rates-eur-usd").id).toMatch(/^dche_/);

    upsertEntry("currency-rates-eur-usd", "2026-04-20", { value: "1.10" });
    upsertEntry("currency-rates-eur-usd", "2026-04-24", { value: "1.12" });

    await expect(
      lookup("currency-rates-eur-usd", "2026-04-23", {
        strategy: "fallback_only",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        key: "2026-04-24",
        source: "fallback",
        isStale: true,
      }),
    );
  });

  it("rejects invalid schemas and invalid entry values", async () => {
    const { createCache, upsertEntry } = await import("../src/services/data-caches.js");

    expect(() =>
      createCache({
        slug: "broken",
        displayName: "Broken",
        keyType: "string",
        valueSchema: {
          type: "object",
          required: "value",
        } as never,
      }),
    ).toThrowError(/Invalid value schema/);

    createCache({
      slug: "materials",
      displayName: "Materials",
      keyType: "string",
      valueSchema: {
        type: "object",
        properties: {
          price: { type: "string" },
        },
        required: ["price"],
      },
    });

    expect(() => upsertEntry("materials", "SKU-1", { value: "10.00" })).toThrowError(
      /Entry value does not match cache schema/,
    );
  });

  it("returns an agent instruction for missing fetch-enabled values and accepts fetched submissions", async () => {
    const { createCache, lookup, listCacheEntries, submitFetchedEntry } = await import("../src/services/data-caches.js");

    createCache({
      slug: "currency-rates-eur-usd",
      displayName: "Currency Rates EUR/USD",
      keyType: "date",
      valueSchema: {
        type: "object",
        properties: {
          rate: { type: "string" },
          base: { type: "string" },
          target: { type: "string" },
        },
        required: ["rate", "base", "target"],
      },
      fetcherConfig: {
        prompt: "Look up the {{ config.base_currency }}/{{ config.target_currency }} exchange rate for {{ key }}.",
        base_currency: "EUR",
        target_currency: "USD",
      },
    });

    const result = await lookup("currency-rates-eur-usd", "2026-04-26", {
      strategy: "fetch_on_miss",
      fetchTimeoutMs: 1000,
    });

    expect(result).toEqual(
      expect.objectContaining({
        key: "2026-04-26",
        source: "needs_fetch",
        valueSchema: expect.objectContaining({ required: ["rate", "base", "target"] }),
        submission: expect.objectContaining({
          method: "POST",
          path: "/api/v1/data-caches/currency-rates-eur-usd/fetch-submissions",
        }),
        retry: expect.objectContaining({
          method: "POST",
          path: "/api/v1/data-caches/currency-rates-eur-usd/lookup",
        }),
      }),
    );
    expect(result?.source === "needs_fetch" ? result.instructionPrompt : "").toContain("JSON response schema:");
    expect(result?.source === "needs_fetch" ? result.instructionPrompt : "").toContain("/fetch-submissions");

    submitFetchedEntry("currency-rates-eur-usd", "2026-04-26", {
      rate: "1.0831",
      base: "EUR",
      target: "USD",
    });

    const retryResult = await lookup("currency-rates-eur-usd", "2026-04-26", {
      strategy: "fetch_on_miss",
    });

    expect(retryResult).toEqual(
      expect.objectContaining({
        key: "2026-04-26",
        source: "exact",
        isStale: false,
        value: {
          rate: "1.0831",
          base: "EUR",
          target: "USD",
        },
      }),
    );

    expect(listCacheEntries("currency-rates-eur-usd")).toHaveLength(1);
    expect(listCacheEntries("currency-rates-eur-usd")[0].source).toBe("fetcher");
  });

  it("uses staleness windows for ordered key types and degrades to fetch-on-miss for string keys", async () => {
    const { createCache, upsertEntry, lookup } = await import("../src/services/data-caches.js");

    createCache({
      slug: "numeric-cache",
      displayName: "Numeric Cache",
      keyType: "numeric",
      valueSchema: {
        type: "object",
        properties: { reading: { type: "string" } },
        required: ["reading"],
      },
    });
    upsertEntry("numeric-cache", "10", { reading: "10.0" });

    const withinWindow = await lookup("numeric-cache", "12", {
      strategy: "staleness_window",
      maxStalenessWindow: 3,
    });
    expect(withinWindow?.source).toBe("fallback");
    expect(withinWindow?.source === "fallback" ? withinWindow.staleDays : undefined).toBe(2);

    createCache({
      slug: "materials",
      displayName: "Materials",
      keyType: "string",
      valueSchema: {
        type: "object",
        properties: { price: { type: "string" } },
        required: ["price"],
      },
      fetcherConfig: {
        prompt: "Return price for {{ key }}",
      },
    });

    const fetchInstruction = await lookup("materials", "SKU-001", {
      strategy: "staleness_window",
      maxStalenessWindow: 7,
    });

    expect(fetchInstruction?.source).toBe("needs_fetch");
    expect(fetchInstruction?.key).toBe("SKU-001");

    const fallbackOnly = await lookup("materials", "SKU-002", {
      strategy: "fallback_only",
    });
    expect(fallbackOnly).toBeNull();
  });
});

describe("data-cache HTTP routes", () => {
  let server: Server | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    await resetTestState();
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server!.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error: Error | undefined) => (error ? reject(error) : resolve()));
      });
    }
    server = undefined;
  });

  it("creates caches, entries, and lookup results through the API", async () => {
    const createResponse = await fetch(`${baseUrl}/api/v1/data-caches`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        slug: "materials",
        displayName: "Materials",
        keyType: "string",
        valueSchema: {
          type: "object",
          properties: {
            price: { type: "string" },
          },
          required: ["price"],
        },
      }),
    });

    expect(createResponse.status).toBe(201);

    const upsertResponse = await fetch(`${baseUrl}/api/v1/data-caches/materials/entries`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: "SKU-001",
        value: {
          price: "12.00",
        },
      }),
    });

    expect(upsertResponse.status).toBe(201);

    const lookupResponse = await fetch(`${baseUrl}/api/v1/data-caches/materials/lookup`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: "SKU-001",
        strategy: "fetch_on_miss",
      }),
    });

    expect(lookupResponse.status).toBe(200);
    expect((await lookupResponse.json()) as unknown).toEqual(
      expect.objectContaining({
        key: "SKU-001",
        source: "exact",
      }),
    );
  });

  it("returns fetch instructions and accepts fetched submissions through the API", async () => {
    const createResponse = await fetch(`${baseUrl}/api/v1/data-caches`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        slug: "currency-rates",
        displayName: "Currency Rates",
        keyType: "date",
        valueSchema: {
          type: "object",
          properties: {
            rate: { type: "string" },
          },
          required: ["rate"],
        },
        fetcherConfig: {
          prompt: "Find the EUR/USD exchange rate for {{ key }}.",
        },
      }),
    });

    expect(createResponse.status).toBe(201);

    const lookupResponse = await fetch(`${baseUrl}/api/v1/data-caches/currency-rates/lookup`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: "2026-04-26",
        strategy: "fetch_on_miss",
      }),
    });

    expect(lookupResponse.status).toBe(200);
    expect((await lookupResponse.json()) as unknown).toEqual(
      expect.objectContaining({
        key: "2026-04-26",
        source: "needs_fetch",
        submission: expect.objectContaining({
          path: "/api/v1/data-caches/currency-rates/fetch-submissions",
        }),
      }),
    );

    const invalidSubmission = await fetch(`${baseUrl}/api/v1/data-caches/currency-rates/fetch-submissions`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: "2026-04-26",
        value: {
          value: "1.0800",
        },
      }),
    });
    expect(invalidSubmission.status).toBe(400);

    const validSubmission = await fetch(`${baseUrl}/api/v1/data-caches/currency-rates/fetch-submissions`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: "2026-04-26",
        value: {
          rate: "1.0800",
        },
      }),
    });
    expect(validSubmission.status).toBe(201);
    expect((await validSubmission.json()) as unknown).toEqual(
      expect.objectContaining({
        key: "2026-04-26",
        source: "fetcher",
      }),
    );

    const retryResponse = await fetch(`${baseUrl}/api/v1/data-caches/currency-rates/lookup`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        key: "2026-04-26",
        strategy: "fetch_on_miss",
      }),
    });
    expect(retryResponse.status).toBe(200);
    expect((await retryResponse.json()) as unknown).toEqual(
      expect.objectContaining({
        key: "2026-04-26",
        source: "exact",
      }),
    );
  });
});

describe("data-cache CLI", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates caches, imports JSON and CSV, and looks up values", () => {
    const jsonImportPath = path.join(testDataDir, "data-cache-import.json");
    const csvImportPath = path.join(testDataDir, "data-cache-import.csv");

    fs.writeFileSync(
      jsonImportPath,
      JSON.stringify({
        entries: [
          {
            key: "2026-04-26",
            value: {
              rate: "1.0800",
            },
          },
        ],
      }),
    );
    fs.writeFileSync(csvImportPath, ["SKU,Price,Currency", "SKU-001,10.00,EUR", "SKU-002,11.50,USD"].join("\n"));

    const created = JSON.parse(
      runCli([
        "data-cache",
        "create",
        "currency-rates",
        "--name",
        "Currency Rates",
        "--key-type",
        "date",
        "--value-schema",
        '{"type":"object","properties":{"rate":{"type":"string"}},"required":["rate"]}',
      ]),
    ) as { slug: string };
    expect(created.slug).toBe("currency-rates");

    const importResult = JSON.parse(
      runCli(["data-cache", "import", "currency-rates", "--file", jsonImportPath]),
    ) as { inserted: number; updated: number };
    expect(importResult).toEqual({ inserted: 1, updated: 0 });

    const lookupResult = JSON.parse(
      runCli([
        "data-cache",
        "lookup",
        "currency-rates",
        "2026-04-26",
        "--strategy",
        "fetch_on_miss",
      ]),
    ) as { source: string; key: string };
    expect(lookupResult).toEqual(
      expect.objectContaining({
        source: "exact",
        key: "2026-04-26",
      }),
    );

    runCli([
      "data-cache",
      "create",
      "missing-rates",
      "--name",
      "Missing Rates",
      "--key-type",
      "date",
      "--value-schema",
      '{"type":"object","properties":{"rate":{"type":"string"}},"required":["rate"]}',
      "--fetcher-config",
      '{"prompt":"Find the EUR/USD exchange rate for {{ key }}."}',
    ]);

    const needsFetchResult = JSON.parse(
      runCli([
        "data-cache",
        "lookup",
        "missing-rates",
        "2026-04-27",
        "--strategy",
        "fetch_on_miss",
      ]),
    ) as { source: string; key: string; submission: { path: string } };
    expect(needsFetchResult).toEqual(
      expect.objectContaining({
        source: "needs_fetch",
        key: "2026-04-27",
        submission: expect.objectContaining({
          path: "/api/v1/data-caches/missing-rates/fetch-submissions",
        }),
      }),
    );

    runCli([
      "data-cache",
      "create",
      "materials",
      "--name",
      "Materials",
      "--key-type",
      "string",
      "--value-schema",
      '{"type":"object","properties":{"value":{"type":"string"}},"required":["value"]}',
    ]);

    const csvResult = JSON.parse(
      runCli(["data-cache", "import", "materials", "--file", csvImportPath, "--key-col", "SKU", "--value-col", "Price"]),
    ) as { inserted: number; updated: number };
    expect(csvResult).toEqual({ inserted: 2, updated: 0 });
  }, 10000);
});
