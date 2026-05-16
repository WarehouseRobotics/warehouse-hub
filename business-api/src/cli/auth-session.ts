import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import {
  requireActiveToken,
  type AuthScope,
  type PersonalAccessToken,
} from "../services/personal-access-tokens.js";
import {
  requireActiveSession,
  type CreatedUserSession,
  type UserSession,
} from "../services/user-sessions.js";
import type { User } from "../services/users.js";
import type { Workspace } from "../services/workspaces.js";

export type CliSessionFile = {
  baseUrl: string;
  sessionToken: string;
  expiresAt: string;
};

export type CliAuthContext = {
  userId: string | null;
  user: User | null;
  role: User["role"] | null;
  scopes: AuthScope[];
  source: "session" | "pat" | "legacy";
  sessionId: string | null;
  tokenId: string | null;
};

const scopeRank: Record<AuthScope, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

const roleRank: Record<User["role"], number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

function getCliSessionFilePath(): string {
  return path.join(os.homedir(), ".config", "wrobo", "session.json");
}

function getBaseUrl(): string {
  return `http://localhost:${config.PORT}`;
}

function parseSessionFile(value: string): CliSessionFile | null {
  const parsed = JSON.parse(value) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as CliSessionFile).sessionToken !== "string" ||
    typeof (parsed as CliSessionFile).expiresAt !== "string"
  ) {
    return null;
  }

  return {
    baseUrl:
      typeof (parsed as CliSessionFile).baseUrl === "string"
        ? (parsed as CliSessionFile).baseUrl
        : getBaseUrl(),
    sessionToken: (parsed as CliSessionFile).sessionToken,
    expiresAt: (parsed as CliSessionFile).expiresAt,
  };
}

function mapSessionContext(session: UserSession): CliAuthContext {
  return {
    userId: session.userId,
    user: session.user ?? null,
    role: session.user?.role ?? null,
    scopes: ["admin"],
    source: "session",
    sessionId: session.sessionId,
    tokenId: null,
  };
}

function mapTokenContext(token: PersonalAccessToken): CliAuthContext {
  return {
    userId: token.userId,
    user: token.user ?? null,
    role: token.user?.role ?? null,
    scopes: token.scopes,
    source: "pat",
    sessionId: null,
    tokenId: token.tokenId,
  };
}

function mapLegacyContext(): CliAuthContext {
  return {
    userId: null,
    user: null,
    role: null,
    scopes: ["admin"],
    source: "legacy",
    sessionId: null,
    tokenId: null,
  };
}

function resolveExplicitCredential(rest: string[]): {
  token: string | undefined;
  rest: string[];
} {
  const nextRest: string[] = [];
  let token: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg !== "--token") {
      nextRest.push(arg);
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Missing value for option: --token");
    }

    token = value;
    index += 1;
  }

  return { token, rest: nextRest };
}

export function splitCliCredentialOption(rest: string[]): {
  token: string | undefined;
  rest: string[];
} {
  return resolveExplicitCredential(rest);
}

export function writeCliSession(session: CreatedUserSession): CliSessionFile {
  const sessionFile = {
    baseUrl: getBaseUrl(),
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
  };
  const filePath = getCliSessionFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sessionFile, null, 2)}\n`, {
    mode: 0o600,
  });
  return sessionFile;
}

export function readCliSession(): CliSessionFile | null {
  const filePath = getCliSessionFilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return parseSessionFile(fs.readFileSync(filePath, "utf8"));
}

export function clearCliSession(): void {
  fs.rmSync(getCliSessionFilePath(), { force: true });
}

export function resolveCliAuth(rest: string[] = []): CliAuthContext {
  const explicit = resolveExplicitCredential(rest).token;
  const token = explicit ?? process.env.WROBO_API_TOKEN;

  if (token?.startsWith("sess_")) {
    return mapSessionContext(requireActiveSession(token));
  }

  if (token?.startsWith("wpat_")) {
    return mapTokenContext(requireActiveToken(token));
  }

  if (
    token &&
    config.HUB_AUTH_MODE === "api-key" &&
    config.API_KEY &&
    token === config.API_KEY
  ) {
    return mapLegacyContext();
  }

  if (token) {
    throw new AppError("CLI credential is invalid or expired", {
      statusCode: 401,
      code: "unauthorized",
    });
  }

  const session = readCliSession();
  if (session) {
    return mapSessionContext(requireActiveSession(session.sessionToken));
  }

  if (config.HUB_AUTH_MODE === "api-key" && config.API_KEY) {
    return mapLegacyContext();
  }

  throw new AppError("CLI authentication is required", {
    statusCode: 401,
    code: "unauthorized",
  });
}

export function requireCliScope(
  auth: CliAuthContext,
  requiredScope: AuthScope,
): void {
  const authorized = auth.scopes.some(
    (scope) => scopeRank[scope] >= scopeRank[requiredScope],
  );
  if (!authorized) {
    throw new AppError(`Requires ${requiredScope} scope`, {
      statusCode: 403,
      code: "forbidden",
    });
  }
}

export function requireCliRole(
  auth: CliAuthContext,
  requiredRole: User["role"],
): void {
  const authorized = Boolean(
    auth.role && roleRank[auth.role] >= roleRank[requiredRole],
  );
  if (!authorized) {
    throw new AppError(`Requires ${requiredRole} role`, {
      statusCode: 403,
      code: "forbidden",
    });
  }
}

export function mapCliPublicUser(user: User | null) {
  if (!user) {
    return null;
  }

  return {
    id: user.userId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function mapCliPublicWorkspace(workspace: Workspace) {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
  };
}
