import { createHash } from "node:crypto";

export function hashEmbeddingContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function createStubEmbedding(text: string, dimensions = 1536): number[] {
  const hash = hashEmbeddingContent(text);
  const values = Array.from({ length: dimensions }, (_, index) => {
    const pair = hash.slice((index * 2) % hash.length, ((index * 2) % hash.length) + 2);
    return Number.parseInt(pair.padEnd(2, "0"), 16) / 255;
  });

  return values;
}
