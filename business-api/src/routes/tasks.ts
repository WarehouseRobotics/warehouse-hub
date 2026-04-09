import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { taskInputSchema, taskPatchSchema } from "@warehouse-hub/business-schemas";
import { createTask, getTask, listTasks, softDeleteTask, updateTask } from "../services/tasks.js";

export const tasksRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

tasksRouter.get("/", (request, response) => {
  response.json(
    listTasks({
      projectId: typeof request.query.projectId === "string" ? request.query.projectId : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      parentTaskId:
        typeof request.query.parentTaskId === "string" ? request.query.parentTaskId : undefined,
    }),
  );
});

tasksRouter.post("/", validateBody(taskInputSchema), (request, response) => {
  response.status(201).json(createTask(request.body));
});

tasksRouter.get("/:id", (request, response) => {
  response.json(getTask(getRouteParam(request.params.id)));
});

tasksRouter.patch("/:id", validateBody(taskPatchSchema), (request, response) => {
  response.json(updateTask(getRouteParam(request.params.id), request.body));
});

tasksRouter.delete("/:id", (request, response) => {
  softDeleteTask(getRouteParam(request.params.id));
  response.status(204).send();
});
