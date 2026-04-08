import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");
const llmConfigPath = path.join(testDataDir, "llms.mock.yaml");

async function resetEmbeddingModules() {
  vi.resetModules();
  const { resetEmbeddingProviderConfigCache } = await import("../src/lib/llm-config.js");
  resetEmbeddingProviderConfigCache();
}

async function resetDatabaseState() {
  const { resetDatabase, initializeDatabase } = await import("../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(testDataDir, "uploads"), { recursive: true, force: true });
  fs.rmSync(llmConfigPath, { force: true });
  fs.writeFileSync(
    llmConfigPath,
    [
      "llms:",
      "  embedding:",
      "    style: openai-compatible",
      "    endpoint: http://mocked-embeddings.local/v1",
      "    model_name: mocked-embedding-model",
      "    apiKey: mocked-key",
      "    default_dims: 3",
      "",
    ].join("\n"),
  );
  initializeDatabase();
}

describe("embedding service with mocked provider", () => {
  beforeEach(async () => {
    process.env.LLMS_CONFIG_PATH = "./test-data/llms.mock.yaml";
    process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "false";
    await resetEmbeddingModules();
    await resetDatabaseState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates embeddings through the configured OpenAI-compatible provider", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          model: "mocked-embedding-model",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createTextEmbedding } = await import("../src/lib/embedding-provider.js");
    const result = await createTextEmbedding("warehouse automation");

    expect(result).toEqual({
      model: "mocked-embedding-model",
      vector: [0.1, 0.2, 0.3],
      dimensions: 3,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.at(0)?.at(0)).toBe("http://mocked-embeddings.local/v1/embeddings");
  });

  it("upserts and queries embeddings using provider-backed vectors", async () => {
    const embeddingMap = new Map<string, number[]>([
      ["warehouse robot automation", [1, 0, 0]],
      ["garden supplies and flowers", [0, 1, 0]],
      ["warehouse robot automation query", [1, 0, 0]],
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { input: string[] };
        return new Response(
          JSON.stringify({
            data: body.input.map((value, index) => ({
              index,
              embedding: embeddingMap.get(value) ?? [0, 0, 1],
            })),
            model: "mocked-embedding-model",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { upsertEmbedding, findSimilar } = await import("../src/lib/embeddings.js");
    const { getOrm } = await import("../src/db/connection.js");
    const { entityEmbeddings } = await import("../src/db/schema/index.js");

    await upsertEmbedding("task", "task_warehouse", "warehouse robot automation");
    await upsertEmbedding("task", "task_garden", "garden supplies and flowers");

    const rows = getOrm().select().from(entityEmbeddings).all();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.model).toBe("mocked-embedding-model");

    const similar = await findSimilar("task", "warehouse robot automation query", 2);
    expect(similar[0]?.entityId).toBe("task_warehouse");
  });

  it("builds rich sales invoice embedding text including customer and line item details", async () => {
    const { computeEmbeddingText } = await import("../src/lib/embeddings.js");

    const text = computeEmbeddingText("sales_invoice", {
      invoiceNumber: "2026-0001",
      status: "draft",
      customerDisplayName: "Acme Retail GmbH",
      customerLegalName: "Acme Retail GmbH",
      customerEmail: "ap@acme-retail.example",
      currency: "EUR",
      issueDate: "2026-04-02",
      serviceDate: "2026-03-31",
      dueDate: "2026-05-02",
      lineItems: [
        {
          description: "Warehouse audit and automation proposal",
          quantity: "1",
          unitPrice: "1500.00",
          taxRate: "21.00",
        },
      ],
    });

    expect(text).toContain("2026-0001");
    expect(text).toContain("Acme Retail GmbH");
    expect(text).toContain("Warehouse audit and automation proposal");
    expect(text).toContain("EUR");
  });
});
