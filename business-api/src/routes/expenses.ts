import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { requireScope } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { expenseInputSchema, expensePatchSchema } from "@warehouse-hub/business-schemas";
import {
  createExpense,
  getExpense,
  listExpenses,
  softDeleteExpense,
  updateExpense,
} from "../services/expenses.js";

export const expensesRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

expensesRouter.get("/", requireScope("read"), async (request, response, next) => {
  try {
    response.json(
      await listExpenses({
        ...parseListFilters({
          similar: typeof request.query.similar === "string" ? request.query.similar : undefined,
          limit: typeof request.query.limit === "string" ? request.query.limit : undefined,
          since: typeof request.query.since === "string" ? request.query.since : undefined,
          before: typeof request.query.before === "string" ? request.query.before : undefined,
          after: typeof request.query.after === "string" ? request.query.after : undefined,
        }),
      supplierContactId:
        typeof request.query.supplierContactId === "string" ? request.query.supplierContactId : undefined,
      category: typeof request.query.category === "string" ? request.query.category : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

expensesRouter.post("/", requireScope("write"), validateBody(expenseInputSchema), (request, response) => {
  const expense = createExpense(request.body);
  response.locals.audit = {
    action: "expense.create",
    objectType: "expense",
    objectId: expense.expenseId,
  };
  response.status(201).json(expense);
});

expensesRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getExpense(getRouteParam(request.params.id)));
});

expensesRouter.patch("/:id", requireScope("write"), validateBody(expensePatchSchema), (request, response) => {
  const expense = updateExpense(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "expense.update",
    objectType: "expense",
    objectId: expense.expenseId,
  };
  response.json(expense);
});

expensesRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const expense = getExpense(id);
  softDeleteExpense(id);
  response.locals.audit = {
    action: "expense.delete",
    objectType: "expense",
    objectId: expense.expenseId,
  };
  response.status(204).send();
});
