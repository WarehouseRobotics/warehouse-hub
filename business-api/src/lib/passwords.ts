import { createRequire } from "node:module";

import type bcrypt from "bcrypt";

export const PASSWORD_HASH_ROUNDS = 12;

const require = createRequire(import.meta.url);

function getBcrypt(): typeof bcrypt {
  return require("bcrypt") as typeof bcrypt;
}

export function hashPassword(password: string): string {
  return getBcrypt().hashSync(password, PASSWORD_HASH_ROUNDS);
}

export function comparePassword(password: string, passwordHash: string): boolean {
  return getBcrypt().compareSync(password, passwordHash);
}
