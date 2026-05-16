import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { projectInputSchema, projectPatchSchema } from "@warehouse-hub/business-schemas";
import { createProject, getProject, listProjects, softDeleteProject, updateProject } from "../services/projects.js";
import { requireScope } from "../middleware/auth.js";

export const projectsRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

projectsRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listProjects({
      ownerEntityId:
        typeof request.query.ownerEntityId === "string" ? request.query.ownerEntityId : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
    }),
  );
});

projectsRouter.post("/", requireScope("write"), validateBody(projectInputSchema), (request, response) => {
  const project = createProject(request.body);
  response.locals.audit = {
    action: "project.create",
    objectType: "project",
    objectId: project.projectId,
  };
  response.status(201).json(project);
});

projectsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getProject(getRouteParam(request.params.id)));
});

projectsRouter.patch("/:id", requireScope("write"), validateBody(projectPatchSchema), (request, response) => {
  const project = updateProject(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "project.update",
    objectType: "project",
    objectId: project.projectId,
  };
  response.json(project);
});

projectsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const project = getProject(id);
  softDeleteProject(id);
  response.locals.audit = {
    action: "project.delete",
    objectType: "project",
    objectId: project.projectId,
  };
  response.status(204).send();
});
