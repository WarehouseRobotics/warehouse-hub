import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  buildMagicLinkLoginUrl,
  magicLinkLoginEmail,
} from "../services/email.js";
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
  (request, response, next) => {
    try {
      if (!config.HUB_PASSWORD_LOGIN) {
        throw new AppError("Password login is disabled", {
          statusCode: 403,
          code: "password_login_disabled",
        });
      }

      const user = verifyUserPassword(request.body.email, request.body.password);
      sendSessionResponse(response, user, {
        userAgent: request.header("user-agent") ?? null,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/magic-link/request",
  validateBody(magicLinkRequestSchema),
  asyncRoute(async (request, response) => {
    try {
      const user = getUser(request.body.email);
      const magicLink = createMagicLink({
        email: user.email,
        purpose: request.body.purpose,
      });

      try {
        await magicLinkLoginEmail({
          to: user.email,
          token: magicLink.token,
          expiresAt: magicLink.expiresAt,
        });
      } catch (error) {
        logger.warn("Magic link email delivery failed", {
          email: user.email,
          loginUrl: buildMagicLinkLoginUrl(magicLink.token),
          error,
        });
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    response.status(204).send();
  }),
);

authRouter.post(
  "/magic-link/consume",
  validateBody(magicLinkConsumeSchema),
  (request, response, next) => {
    try {
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
    } catch (error) {
      next(error);
    }
  },
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
