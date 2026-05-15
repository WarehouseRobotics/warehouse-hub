import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { magicLinkLoginEmail } from "../services/email.js";
import {
  consumeMagicLink,
  createMagicLink,
} from "../services/magic-link-tokens.js";
import { revokeSession } from "../services/user-sessions.js";
import {
  getUser,
  markUserLoggedIn,
  verifyUserPassword,
  type User,
} from "../services/users.js";
import { getWorkspace } from "../services/workspaces.js";
import {
  clearSessionCookie,
  mapPublicUser,
  mapPublicWorkspace,
  sendSessionResponse,
} from "./session-response.js";

export const authRouter = Router();

const MAGIC_LINK_REQUEST_SINK_EMAIL =
  "magic-link-request-sink@warehouse-hub.invalid";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const magicLinkRequestSchema = z.object({
  email: z.string().email(),
  purpose: z.literal("login").default("login"),
});

const magicLinkConsumeSchema = z.object({
  token: z.string().min(1),
});

function isNotFoundError(error: unknown): boolean {
  return error instanceof AppError && error.statusCode === 404;
}

function throwInvalidMagicLinkToken(): never {
  throw new AppError("Magic link token is invalid or expired", {
    statusCode: 401,
    code: "invalid_magic_link_token",
  });
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    handler(request, response).catch(next);
  };
}

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncRoute(async (request, response) => {
    if (!config.HUB_PASSWORD_LOGIN) {
      throw new AppError("Password login is disabled", {
        statusCode: 403,
        code: "password_login_disabled",
      });
    }

    const user = await verifyUserPassword(
      request.body.email,
      request.body.password,
    );
    sendSessionResponse(response, user, {
      userAgent: request.header("user-agent") ?? null,
    });
  }),
);

authRouter.post(
  "/magic-link/request",
  validateBody(magicLinkRequestSchema),
  asyncRoute(async (request, response) => {
    let user: User | null = null;
    try {
      user = getUser(request.body.email);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    const magicLink = createMagicLink({
      email: user?.email ?? MAGIC_LINK_REQUEST_SINK_EMAIL,
      purpose: request.body.purpose,
    });

    const knownUser = user;
    if (knownUser) {
      setImmediate(() => {
        void magicLinkLoginEmail({
          to: knownUser.email,
          token: magicLink.token,
          expiresAt: magicLink.expiresAt,
        }).catch((error: unknown) => {
          logger.warn("Magic link email delivery failed", {
            email: knownUser.email,
            magicLinkTokenId: magicLink.magicLinkTokenId,
            error,
          });
        });
      });
    }

    response.status(204).send();
  }),
);

authRouter.post(
  "/magic-link/consume",
  validateBody(magicLinkConsumeSchema),
  asyncRoute(async (request, response) => {
    const magicLink = consumeMagicLink(request.body.token, "login");
    let user: User;
    try {
      user = markUserLoggedIn(magicLink.email);
    } catch (error) {
      if (isNotFoundError(error)) {
        throwInvalidMagicLinkToken();
      }
      throw error;
    }

    sendSessionResponse(response, user, {
      userAgent: request.header("user-agent") ?? null,
    });
  }),
);

authRouter.post("/logout", requireAuth, (request, response, next) => {
  try {
    if (request.context?.sessionId) {
      revokeSession(request.context.sessionId);
    }

    clearSessionCookie(response);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, (request, response, next) => {
  try {
    const user = request.context?.userId
      ? mapPublicUser(getUser(request.context.userId))
      : null;
    response.json({
      user,
      role: user?.role ?? null,
      workspace: mapPublicWorkspace(getWorkspace()),
    });
  } catch (error) {
    next(error);
  }
});
