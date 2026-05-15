import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { AppError } from "../lib/errors.js";
import { validateBody } from "../middleware/validate.js";
import {
  createToken,
  listTokensForUser,
  revokeToken,
} from "../services/personal-access-tokens.js";

export const tokensRouter = Router();

const authScopeSchema = z.enum(["read", "write", "admin"]);

const createTokenSchema = z.object({
  name: z.string().trim().min(1),
  actorType: z.enum(["user", "agent"]),
  scopes: z.array(authScopeSchema).nonempty(),
  expiresAt: z.string().datetime().nullable().optional(),
});

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function requireCurrentUserId(request: Request): string {
  const userId = request.context?.userId;
  if (!userId) {
    throw new AppError("Current-user token routes require user auth", {
      statusCode: 403,
      code: "forbidden",
    });
  }

  return userId;
}

tokensRouter.get("/", (request, response, next) => {
  try {
    response.json(listTokensForUser(requireCurrentUserId(request)));
  } catch (error) {
    next(error);
  }
});

tokensRouter.post(
  "/",
  validateBody(createTokenSchema),
  (request: Request, response: Response, next) => {
    try {
      const token = createToken(requireCurrentUserId(request), request.body);
      response.locals.audit = {
        action: "personal_access_token.create",
        objectType: "personal_access_token",
        objectId: token.tokenId,
        metadata: {
          actorType: token.actorType,
          scopes: token.scopes,
        },
      };
      response.status(201).json(token);
    } catch (error) {
      next(error);
    }
  },
);

tokensRouter.delete("/:id", (request, response, next) => {
  try {
    const tokenId = getRouteParam(request.params.id);
    revokeToken(tokenId, requireCurrentUserId(request));
    response.locals.audit = {
      action: "personal_access_token.revoke",
      objectType: "personal_access_token",
      objectId: tokenId,
    };
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
