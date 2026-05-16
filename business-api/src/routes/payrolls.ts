import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { requireScope } from "../middleware/auth.js";
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

payrollsRouter.get("/", requireScope("read"), async (request, response, next) => {
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

payrollsRouter.post("/", requireScope("write"), validateBody(payrollInputSchema), (request, response) => {
  const payroll = createPayroll(request.body);
  response.locals.audit = {
    action: "payroll.create",
    objectType: "payroll",
    objectId: payroll.payrollId,
  };
  response.status(201).json(payroll);
});

payrollsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getPayroll(getRouteParam(request.params.id)));
});

payrollsRouter.patch("/:id", requireScope("write"), validateBody(payrollPatchSchema), (request, response) => {
  const payroll = updatePayroll(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "payroll.update",
    objectType: "payroll",
    objectId: payroll.payrollId,
  };
  response.json(payroll);
});

payrollsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const payroll = getPayroll(id);
  softDeletePayroll(id);
  response.locals.audit = {
    action: "payroll.delete",
    objectType: "payroll",
    objectId: payroll.payrollId,
  };
  response.status(204).send();
});
