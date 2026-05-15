import type { RequestContext } from "../middleware/auth.js";
import type { AuditLocals } from "../middleware/audit.js";

declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
      requestId?: string;
    }

    interface Locals {
      audit?: AuditLocals;
    }
  }
}

export {};
