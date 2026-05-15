import type { NextFunction, Request, Response } from "express";

import { config } from "../config.js";
import type { UserRole } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import {
  requireActiveToken,
  type AuthScope,
} from "../services/personal-access-tokens.js";
import { requireActiveSession } from "../services/user-sessions.js";
import type { User } from "../services/users.js";

export type RequestContext = {
  userId: string | null;
  user: User | null;
  role: UserRole | null;
  scopes: AuthScope[];
  actorType: "user" | "agent" | "system";
  sessionId: string | null;
  tokenId: string | null;
  source: "session" | "pat" | "legacy";
};

const scopeRank: Record<AuthScope, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

const roleRank: Record<UserRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

function getCookieValue(request: Request, name: string): string | undefined {
  const cookieHeader = request.header("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    const value = rawValueParts.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

function getBearerToken(request: Request): string | undefined {
  const authorization = request.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function getPresentedPat(request: Request): string | undefined {
  const bearerToken = getBearerToken(request);
  if (bearerToken?.startsWith("wpat_")) {
    return bearerToken;
  }

  const apiKey = request.header("x-api-key");
  if (apiKey?.startsWith("wpat_")) {
    return apiKey;
  }

  return undefined;
}

function getPresentedLegacyApiKey(request: Request): string | undefined {
  const bearerToken = getBearerToken(request);
  if (bearerToken && !bearerToken.startsWith("wpat_")) {
    return bearerToken;
  }

  const apiKey = request.header("x-api-key");
  if (apiKey && !apiKey.startsWith("wpat_")) {
    return apiKey;
  }

  return undefined;
}

function hasScope(context: RequestContext, requiredScope: AuthScope): boolean {
  return context.scopes.some(
    (scope) => scopeRank[scope] >= scopeRank[requiredScope],
  );
}

function hasRole(context: RequestContext, requiredRole: UserRole): boolean {
  return Boolean(
    context.role && roleRank[context.role] >= roleRank[requiredRole],
  );
}

function throwUnauthorized(): never {
  throw new AppError("Unauthorized", {
    statusCode: 401,
    code: "unauthorized",
  });
}

function createForbiddenError(message: string): AppError {
  return new AppError(message, {
    statusCode: 403,
    code: "forbidden",
  });
}

export function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  try {
    let credentialError: unknown;

    const sessionToken = getCookieValue(request, "wh_session");
    if (sessionToken) {
      try {
        const session = requireActiveSession(sessionToken);
        request.context = {
          userId: session.userId,
          user: session.user ?? null,
          role: session.user?.role ?? null,
          scopes: ["admin"],
          actorType: "user",
          sessionId: session.sessionId,
          tokenId: null,
          source: "session",
        };
        next();
        return;
      } catch (error) {
        credentialError = error;
      }
    }

    const pat = getPresentedPat(request);
    if (pat) {
      try {
        const token = requireActiveToken(pat);
        request.context = {
          userId: token.userId,
          user: token.user ?? null,
          role: token.user?.role ?? null,
          scopes: token.scopes,
          actorType: token.actorType,
          sessionId: null,
          tokenId: token.tokenId,
          source: "pat",
        };
        next();
        return;
      } catch (error) {
        credentialError = error;
      }
    }

    const legacyApiKey = getPresentedLegacyApiKey(request);
    if (
      config.HUB_AUTH_MODE === "api-key" &&
      config.API_KEY &&
      legacyApiKey === config.API_KEY
    ) {
      request.context = {
        userId: null,
        user: null,
        role: null,
        scopes: ["admin"],
        actorType: "system",
        sessionId: null,
        tokenId: null,
        source: "legacy",
      };
      next();
      return;
    }

    if (credentialError) {
      throw credentialError;
    }

    throwUnauthorized();
  } catch (error) {
    next(error);
  }
}

export function requireCurrentUserId(request: Request): string {
  const userId = request.context?.userId;
  if (!userId) {
    throw new AppError("Current-user routes require user auth", {
      statusCode: 403,
      code: "forbidden",
    });
  }

  return userId;
}

export function requireScope(requiredScope: AuthScope) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const context = request.context;
    if (!context) {
      next(
        new AppError("Authentication context is missing", {
          statusCode: 401,
          code: "unauthorized",
        }),
      );
      return;
    }

    if (!hasScope(context, requiredScope)) {
      next(createForbiddenError(`Requires ${requiredScope} scope`));
      return;
    }

    next();
  };
}

export function requireRole(requiredRole: UserRole) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const context = request.context;
    if (!context) {
      next(
        new AppError("Authentication context is missing", {
          statusCode: 401,
          code: "unauthorized",
        }),
      );
      return;
    }

    if (!hasRole(context, requiredRole)) {
      next(createForbiddenError(`Requires ${requiredRole} role`));
      return;
    }

    next();
  };
}
