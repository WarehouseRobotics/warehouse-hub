import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { requireScope } from "../middleware/auth.js";
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

salesInvoicesRouter.get("/", requireScope("read"), async (request, response, next) => {
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

salesInvoicesRouter.post("/", requireScope("write"), validateBody(salesInvoiceGenerateSchema), (request, response) => {
  const invoice = generateSalesInvoice(request.body);
  response.locals.audit = {
    action: "sales_invoice.create",
    objectType: "sales_invoice",
    objectId: invoice.salesInvoiceId,
  };
  response.status(201).json(invoice);
});

salesInvoicesRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getSalesInvoice(getRouteParam(request.params.id)));
});

salesInvoicesRouter.patch("/:id", requireScope("write"), validateBody(salesInvoicePatchSchema), (request, response) => {
  const invoice = updateSalesInvoice(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "sales_invoice.update",
    objectType: "sales_invoice",
    objectId: invoice.salesInvoiceId,
  };
  response.json(invoice);
});

salesInvoicesRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const invoice = getSalesInvoice(id);
  softDeleteSalesInvoice(id);
  response.locals.audit = {
    action: "sales_invoice.delete",
    objectType: "sales_invoice",
    objectId: invoice.salesInvoiceId,
  };
  response.status(204).send();
});
