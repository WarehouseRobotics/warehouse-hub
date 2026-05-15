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

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = getRequestId(request);
  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
}

export function auditMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.on("finish", () => {
    const audit = response.locals.audit;
    if (request.method === "GET" || response.statusCode >= 400 || !audit) {
      return;
    }

    try {
      // Audit writes are best-effort in v1; mutation responses stay successful
      // and failures are surfaced through structured logs for alerting.
      writeAuditLogEntry({
        actorUserId: request.context?.userId ?? null,
        actorTokenId: request.context?.tokenId ?? null,
        actorType: request.context?.actorType ?? "system",
        action: audit.action,
        objectType: audit.objectType,
        objectId: audit.objectId,
        requestId: request.requestId ?? getRequestId(request),
        metadata: audit.metadata,
      });
    } catch (error) {
      logger.error("Failed to write audit log entry", {
        error,
        requestId: request.requestId,
        action: audit.action,
        objectType: audit.objectType,
        objectId: audit.objectId,
      });
    }
  });

  next();
}
