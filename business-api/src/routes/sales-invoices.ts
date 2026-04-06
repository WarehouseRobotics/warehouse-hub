import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { salesInvoiceGenerateSchema, salesInvoicePatchSchema } from "../schemas/sales-invoice.js";
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

salesInvoicesRouter.get("/", (request, response) => {
  response.json(
    listSalesInvoices({
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      customerContactId:
        typeof request.query.customerContactId === "string" ? request.query.customerContactId : undefined,
    }),
  );
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
