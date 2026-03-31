const adjectives = ["blue", "brisk", "calm", "bright", "steady", "silver"];
const nouns = ["river", "forge", "signal", "harbor", "summit", "trail"];

function hashText(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function createSlug(seed: string): string {
  const hash = hashText(seed);
  const adjective = adjectives[hash % adjectives.length];
  const noun = nouns[(hash >>> 3) % nouns.length];
  const suffix = String((hash % 9000) + 1000);
  return `${adjective}-${noun}-${suffix}`;
}
