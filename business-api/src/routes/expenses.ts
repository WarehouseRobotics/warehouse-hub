import { Router } from "express";

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

expensesRouter.get("/", (request, response) => {
  response.json(
    listExpenses({
      supplierContactId:
        typeof request.query.supplierContactId === "string" ? request.query.supplierContactId : undefined,
      category: typeof request.query.category === "string" ? request.query.category : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
    }),
  );
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
