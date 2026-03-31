import type { NextFunction, Request, Response } from "express";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

export function requireApiKey(request: Request, _response: Response, next: NextFunction): void {
  if (!config.API_KEY) {
    next();
    return;
  }

  const provided = request.header("x-api-key") ?? request.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== config.API_KEY) {
    next(new AppError("Unauthorized", { statusCode: 401, code: "unauthorized" }));
    return;
  }

  next();
}
