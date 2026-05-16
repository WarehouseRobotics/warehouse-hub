import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { taskInputSchema, taskPatchSchema } from "@warehouse-hub/business-schemas";
import { createTask, getTask, listTasks, softDeleteTask, updateTask } from "../services/tasks.js";
import { requireScope } from "../middleware/auth.js";

export const tasksRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

tasksRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listTasks({
      projectId: typeof request.query.projectId === "string" ? request.query.projectId : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      parentTaskId:
        typeof request.query.parentTaskId === "string" ? request.query.parentTaskId : undefined,
    }),
  );
});

tasksRouter.post("/", requireScope("write"), validateBody(taskInputSchema), (request, response) => {
  const task = createTask(request.body);
  response.locals.audit = {
    action: "task.create",
    objectType: "task",
    objectId: task.taskId,
  };
  response.status(201).json(task);
});

tasksRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getTask(getRouteParam(request.params.id)));
});

tasksRouter.patch("/:id", requireScope("write"), validateBody(taskPatchSchema), (request, response) => {
  const task = updateTask(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "task.update",
    objectType: "task",
    objectId: task.taskId,
  };
  response.json(task);
});

tasksRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const task = getTask(id);
  softDeleteTask(id);
  response.locals.audit = {
    action: "task.delete",
    objectType: "task",
    objectId: task.taskId,
  };
  response.status(204).send();
});
