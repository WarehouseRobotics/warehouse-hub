const adjectives = ["blue", "red", "green", "yellow", "purple", "orange", "brown", "gray", 
  "black", "white", "brisk", "calm", "bright", "steady", "silver", "gold", "smiling", "happy", 
  "sad", "angry", "frustrated", "excited", "bored", "tired", "hungry", "thirsty", "sleepy", 
  "sick", "injured", "broken", "lost", "found", "saved", "helped", "taught", "learned", 
  "taught", "learned", "taught", "learned"];
const adverbs = ["quickly", "slowly", "firmly", "easily", "quickly", "slowly", "jazzy", "mighty", 
  "truly", "gently", "daily", "near", "far", "deep", "high", "low", "wide", "narrow", "long", "short", 
  "tall", "mostly", "still"];
const nouns = ["river", "forge", "signal", "harbor", "summit", "trail", "jazz", "train", 
  "lake", "sky", "bird", "dog", "cat", "horse", "rabbit", "snake", "tiger", "lion", "zebra", 
  "elephant", "monkey", "penguin", "koala", "kangaroo", "panda", "bear", "fox", "wolf", "bus", "truck", 
  "plane", "ship", "table", "chair", "door", "window", "hook", "book", "pen", "role", "town", "road"];

function hashText(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function createSlug(seed: string): string {
  const hash = hashText(seed);
  const adverb = adverbs[hash % adverbs.length];
  const adjective = adjectives[hash % adjectives.length];
  const noun = nouns[(hash >>> 3) % nouns.length];
  const noun2 = nouns[Math.floor(Math.random() * nouns.length)];
  let parts = [adverb, adjective, noun, noun2];

  // Randomly shuffle the parts
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return parts.join("-");
}
