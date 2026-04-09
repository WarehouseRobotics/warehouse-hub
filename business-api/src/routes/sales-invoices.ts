import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { validateBody } from "../middleware/validate.js";
import { salesInvoiceGenerateSchema, salesInvoicePatchSchema } from "@warehouse-hub/business-schemas";
import {
  generateSalesInvoice,
  getSalesInvoice,
  listSalesInvoices,
  softDeleteSalesInvoice,
  updateSalesInvoice,
} from "../services/sales-invoices.js";

export const salesInvoicesRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

salesInvoicesRouter.get("/", async (request, response, next) => {
  try {
    response.json(
      await listSalesInvoices({
        ...parseListFilters({
          similar: typeof request.query.similar === "string" ? request.query.similar : undefined,
          limit: typeof request.query.limit === "string" ? request.query.limit : undefined,
          since: typeof request.query.since === "string" ? request.query.since : undefined,
          before: typeof request.query.before === "string" ? request.query.before : undefined,
          after: typeof request.query.after === "string" ? request.query.after : undefined,
        }),
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      customerContactId:
        typeof request.query.customerContactId === "string" ? request.query.customerContactId : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

salesInvoicesRouter.post("/", validateBody(salesInvoiceGenerateSchema), (request, response) => {
  response.status(201).json(generateSalesInvoice(request.body));
});

salesInvoicesRouter.get("/:id", (request, response) => {
  response.json(getSalesInvoice(getRouteParam(request.params.id)));
});

salesInvoicesRouter.patch("/:id", validateBody(salesInvoicePatchSchema), (request, response) => {
  response.json(updateSalesInvoice(getRouteParam(request.params.id), request.body));
});

salesInvoicesRouter.delete("/:id", (request, response) => {
  softDeleteSalesInvoice(getRouteParam(request.params.id));
  response.status(204).send();
});
