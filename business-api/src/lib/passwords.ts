import { createRequire } from "node:module";

import type bcrypt from "bcrypt";

export const PASSWORD_HASH_ROUNDS = 12;

const require = createRequire(import.meta.url);

function getBcrypt(): typeof bcrypt {
  return require("bcrypt") as typeof bcrypt;
}

export async function hashPassword(password: string): Promise<string> {
  return getBcrypt().hash(password, PASSWORD_HASH_ROUNDS);
}

export function hashPasswordSync(password: string): string {
  return getBcrypt().hashSync(password, PASSWORD_HASH_ROUNDS);
}

export async function comparePassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return getBcrypt().compare(password, passwordHash);
}
