import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "../lib/errors.js";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    const extra = error.details && typeof error.details === "object" && !Array.isArray(error.details)
      ? error.details
      : {};
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...extra,
        details: error.details,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  response.status(500).json({
    error: {
      code: "internal_error",
      message,
    },
  });
}
