import fs from "node:fs";
import path from "node:path";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");

async function resetEmbeddingState() {
  vi.resetModules();
  const { resetEmbeddingProviderConfigCache } = await import("../src/lib/llm-config.js");
  resetEmbeddingProviderConfigCache();
  const { resetDatabase, initializeDatabase } = await import("../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(testDataDir, "uploads"), { recursive: true, force: true });
  fs.rmSync(path.join(testDataDir, "llms.mock.yaml"), { force: true });
  initializeDatabase();
}

describe("embedding service against the configured local API", () => {
  beforeAll(() => {
    process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "false";
    process.env.LLMS_CONFIG_PATH = "./config/llms.yaml";
  });

  beforeEach(async () => {
    await resetEmbeddingState();
  });

  it("creates a real embedding from the configured provider", async () => {
    const { createTextEmbedding } = await import("../src/lib/embedding-provider.js");
    const { getConfiguredEmbeddingDimensions } = await import("../src/lib/llm-config.js");

    const result = await createTextEmbedding("Warehouse robotics control tasks and invoice matching");

    expect(result.model.length).toBeGreaterThan(0);
    expect(result.vector.length).toBe(getConfiguredEmbeddingDimensions());
    expect(result.vector.some((value) => value !== 0)).toBe(true);
  }, 30000);

  it("stores and retrieves nearest neighbors using real embeddings", async () => {
    const { upsertEmbedding, findSimilar } = await import("../src/lib/embeddings.js");
    const firstText = "Warehouse robotics control tasks and automation planning";
    const secondText = "Gardening supply invoices and flower catalog management";

    await upsertEmbedding("task", "task_match", firstText);
    await upsertEmbedding("task", "task_other", secondText);

    const similar = await findSimilar("task", firstText, 2);

    expect(similar).toHaveLength(2);
    expect(similar[0]?.entityId).toBe("task_match");
    expect(similar[0]!.distance).toBeLessThanOrEqual(similar[1]!.distance);
  }, 30000);
});
