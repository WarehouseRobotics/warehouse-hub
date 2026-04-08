import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { validateBody } from "../middleware/validate.js";
import { expenseInputSchema, expensePatchSchema } from "../schemas/expense.js";
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

expensesRouter.get("/", async (request, response, next) => {
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

expensesRouter.post("/", validateBody(expenseInputSchema), (request, response) => {
  response.status(201).json(createExpense(request.body));
});

expensesRouter.get("/:id", (request, response) => {
  response.json(getExpense(getRouteParam(request.params.id)));
});

expensesRouter.patch("/:id", validateBody(expensePatchSchema), (request, response) => {
  response.json(updateExpense(getRouteParam(request.params.id), request.body));
});

expensesRouter.delete("/:id", (request, response) => {
  softDeleteExpense(getRouteParam(request.params.id));
  response.status(204).send();
});
