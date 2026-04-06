import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { load as loadYaml } from "js-yaml";
import { z } from "zod";

import { config } from "../config.js";

const embeddingProviderSchema = z
  .object({
    style: z.literal("openai-compatible"),
    endpoint: z.string().url(),
    model_name: z.string().min(1),
    apiKey: z.string().min(1).optional(),
    default_dims: z.number().int().positive().optional(),
  })
  .strict();

const llmsConfigSchema = z
  .object({
    llms: z
      .object({
        embedding: embeddingProviderSchema.optional(),
      })
      .passthrough(),
  })
  .strict();

export type EmbeddingProviderConfig = z.infer<typeof embeddingProviderSchema>;

let cachedEmbeddingConfig: EmbeddingProviderConfig | null | undefined;

function resolveCandidatePaths(): string[] {
  const candidates = [config.llmsConfigPath, path.join(os.homedir(), ".wrobo-hub/llms.yaml")];
  return Array.from(new Set(candidates));
}

export function loadEmbeddingProviderConfig(): EmbeddingProviderConfig | null {
  if (cachedEmbeddingConfig !== undefined) {
    return cachedEmbeddingConfig;
  }

  for (const candidatePath of resolveCandidatePaths()) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const parsed = llmsConfigSchema.parse(loadYaml(fs.readFileSync(candidatePath, "utf8")));
    cachedEmbeddingConfig = parsed.llms.embedding ?? null;
    return cachedEmbeddingConfig;
  }

  cachedEmbeddingConfig = null;
  return cachedEmbeddingConfig;
}

export function resetEmbeddingProviderConfigCache(): void {
  cachedEmbeddingConfig = undefined;
}

export function getConfiguredEmbeddingDimensions(): number {
  return loadEmbeddingProviderConfig()?.default_dims ?? 1536;
}
