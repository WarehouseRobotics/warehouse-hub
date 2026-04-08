import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { load as loadYaml } from "js-yaml";
import { z } from "zod";

import { config } from "../config.js";

const openAiCompatibleProviderSchema = z
  .object({
    style: z.literal("openai-compatible"),
    endpoint: z.string().url(),
    model_name: z.string().min(1),
    apiKey: z.string().min(1).optional(),
    default_dims: z.number().int().positive().optional(),
  })
  .passthrough();

const embeddingProviderSchema = openAiCompatibleProviderSchema;
const structuredOcrProviderSchema = openAiCompatibleProviderSchema;

const llmsConfigSchema = z
  .object({
    llms: z
      .object({
        embedding: embeddingProviderSchema.optional(),
        structured_ocr: structuredOcrProviderSchema.optional(),
      })
      .passthrough(),
  })
  .strict();

export type EmbeddingProviderConfig = z.infer<typeof embeddingProviderSchema>;
export type StructuredOcrProviderConfig = z.infer<typeof structuredOcrProviderSchema>;

let cachedEmbeddingConfig: EmbeddingProviderConfig | null | undefined;
let cachedStructuredOcrConfig: StructuredOcrProviderConfig | null | undefined;

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

export function loadStructuredOcrProviderConfig(): StructuredOcrProviderConfig | null {
  if (cachedStructuredOcrConfig !== undefined) {
    return cachedStructuredOcrConfig;
  }

  for (const candidatePath of resolveCandidatePaths()) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const parsed = llmsConfigSchema.parse(loadYaml(fs.readFileSync(candidatePath, "utf8")));
    cachedStructuredOcrConfig = parsed.llms.structured_ocr ?? null;
    return cachedStructuredOcrConfig;
  }

  cachedStructuredOcrConfig = null;
  return cachedStructuredOcrConfig;
}

export function resetEmbeddingProviderConfigCache(): void {
  cachedEmbeddingConfig = undefined;
  cachedStructuredOcrConfig = undefined;
}

export function getConfiguredEmbeddingDimensions(): number {
  return loadEmbeddingProviderConfig()?.default_dims ?? 1536;
}
