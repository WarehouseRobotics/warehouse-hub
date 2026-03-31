import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 10);

export function createPrefixedId(prefix: string): string {
  return `${prefix}${nanoid()}`;
}
