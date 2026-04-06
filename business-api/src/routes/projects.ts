import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { projectInputSchema, projectPatchSchema } from "../schemas/project.js";
import { createProject, getProject, listProjects, softDeleteProject, updateProject } from "../services/projects.js";

export const projectsRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

projectsRouter.get("/", (request, response) => {
  response.json(
    listProjects({
      ownerEntityId:
        typeof request.query.ownerEntityId === "string" ? request.query.ownerEntityId : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
    }),
  );
});

projectsRouter.post("/", validateBody(projectInputSchema), (request, response) => {
  response.status(201).json(createProject(request.body));
});

projectsRouter.get("/:id", (request, response) => {
  response.json(getProject(getRouteParam(request.params.id)));
});

projectsRouter.patch("/:id", validateBody(projectPatchSchema), (request, response) => {
  response.json(updateProject(getRouteParam(request.params.id), request.body));
});

projectsRouter.delete("/:id", (request, response) => {
  softDeleteProject(getRouteParam(request.params.id));
  response.status(204).send();
});
