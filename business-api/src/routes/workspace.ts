import { Router } from "express";
import { z } from "zod";

import { requireRole, requireScope } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { getWorkspace, updateWorkspace } from "../services/workspaces.js";

export const workspaceRouter = Router();

const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  })
  .refine(
    (patch) => patch.name !== undefined || patch.slug !== undefined,
    "At least one field must be provided",
  );

workspaceRouter.get("/", requireScope("read"), (_request, response, next) => {
  try {
    response.json(getWorkspace());
  } catch (error) {
    next(error);
  }
});

workspaceRouter.patch(
  "/",
  requireScope("write"),
  requireRole("admin"),
  validateBody(updateWorkspaceSchema),
  (request, response, next) => {
    try {
      const workspace = updateWorkspace(request.body);
      response.locals.audit = {
        action: "workspace.update",
        objectType: "workspace",
        objectId: workspace.id,
        metadata: {
          slug: workspace.slug,
          name: workspace.name,
        },
      };
      response.json(workspace);
    } catch (error) {
      next(error);
    }
  },
);
