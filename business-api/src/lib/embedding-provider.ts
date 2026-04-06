import { z } from "zod";

import { config } from "../config.js";
import { AppError } from "./errors.js";
import { loadEmbeddingProviderConfig } from "./llm-config.js";

const embeddingResponseSchema = z
  .object({
    data: z
      .array(
        z.object({
          index: z.number().int().nonnegative(),
          embedding: z.array(z.number()),
        }),
      )
      .min(1),
    model: z.string().min(1),
  })
  .passthrough();

export type EmbeddingResult = {
  model: string;
  vectors: number[][];
  dimensions: number;
};

export async function createTextEmbeddings(inputs: string[]): Promise<EmbeddingResult> {
  if (inputs.length === 0) {
    throw new AppError("At least one embedding input is required", {
      statusCode: 400,
      code: "invalid_embedding_input",
    });
  }

  const embeddingConfig = loadEmbeddingProviderConfig();
  if (!embeddingConfig) {
    throw new AppError("Embedding provider is not configured", {
      statusCode: 500,
      code: "embedding_provider_not_configured",
    });
  }

  const response = await fetch(`${embeddingConfig.endpoint}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(embeddingConfig.apiKey ? { authorization: `Bearer ${embeddingConfig.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: embeddingConfig.model_name,
      input: inputs,
      ...(embeddingConfig.default_dims ? { dimensions: embeddingConfig.default_dims } : {}),
    }),
    signal: AbortSignal.timeout(config.EMBEDDING_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new AppError(`Embedding provider request failed with status ${response.status}`, {
      statusCode: 502,
      code: "embedding_provider_failed",
      details: await safeReadText(response),
    });
  }

  const payload = embeddingResponseSchema.parse(await response.json());
  const orderedVectors = [...payload.data]
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);

  return {
    model: payload.model,
    vectors: orderedVectors,
    dimensions: orderedVectors[0]?.length ?? 0,
  };
}

export async function createTextEmbedding(input: string): Promise<{ model: string; vector: number[]; dimensions: number }> {
  const result = await createTextEmbeddings([input]);
  return {
    model: result.model,
    vector: result.vectors[0] ?? [],
    dimensions: result.dimensions,
  };
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
