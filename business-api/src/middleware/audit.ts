import type { NextFunction, Request, Response } from "express";

import { createPrefixedId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import { writeAuditLogEntry } from "../services/audit-log.js";

export type AuditLocals = {
  action: string;
  objectType: string;
  objectId: string;
  metadata?: Record<string, unknown>;
};

function getRequestId(request: Request): string {
  const header = request.header("x-request-id");
  return header?.trim() || createPrefixedId("req_");
}

export function auditMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = getRequestId(request);
  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);

  response.on("finish", () => {
    const audit = response.locals.audit;
    if (request.method === "GET" || response.statusCode >= 400 || !audit) {
      return;
    }

    try {
      writeAuditLogEntry({
        actorUserId: request.context?.userId ?? null,
        actorTokenId: request.context?.tokenId ?? null,
        actorType: request.context?.actorType ?? "system",
        action: audit.action,
        objectType: audit.objectType,
        objectId: audit.objectId,
        requestId,
        metadata: audit.metadata,
      });
    } catch (error) {
      logger.error("Failed to write audit log entry", {
        error,
        requestId,
        action: audit.action,
        objectType: audit.objectType,
        objectId: audit.objectId,
      });
    }
  });

  next();
}
