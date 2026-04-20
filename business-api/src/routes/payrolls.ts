import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { validateBody } from "../middleware/validate.js";
import { payrollInputSchema, payrollPatchSchema } from "@warehouse-hub/business-schemas";
import {
  createPayroll,
  getPayroll,
  listPayrolls,
  softDeletePayroll,
  updatePayroll,
} from "../services/payrolls.js";

export const payrollsRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

payrollsRouter.get("/", async (request, response, next) => {
  try {
    response.json(
      await listPayrolls({
        ...parseListFilters({
          similar: typeof request.query.similar === "string" ? request.query.similar : undefined,
          limit: typeof request.query.limit === "string" ? request.query.limit : undefined,
          since: typeof request.query.since === "string" ? request.query.since : undefined,
          before: typeof request.query.before === "string" ? request.query.before : undefined,
          after: typeof request.query.after === "string" ? request.query.after : undefined,
        }),
        employeeContactId:
          typeof request.query.employeeContactId === "string" ? request.query.employeeContactId : undefined,
        countryCode: typeof request.query.countryCode === "string" ? request.query.countryCode : undefined,
        status: typeof request.query.status === "string" ? request.query.status : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

payrollsRouter.post("/", validateBody(payrollInputSchema), (request, response) => {
  response.status(201).json(createPayroll(request.body));
});

payrollsRouter.get("/:id", (request, response) => {
  response.json(getPayroll(getRouteParam(request.params.id)));
});

payrollsRouter.patch("/:id", validateBody(payrollPatchSchema), (request, response) => {
  response.json(updatePayroll(getRouteParam(request.params.id), request.body));
});

payrollsRouter.delete("/:id", (request, response) => {
  softDeletePayroll(getRouteParam(request.params.id));
  response.status(204).send();
});
