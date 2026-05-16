import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { dealInputSchema, dealPatchSchema } from "@warehouse-hub/business-schemas";
import { createDeal, getDeal, listDeals, softDeleteDeal, updateDeal } from "../services/deals.js";
import { requireScope } from "../middleware/auth.js";

export const dealsRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

dealsRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listDeals({
      stage: typeof request.query.stage === "string" ? request.query.stage : undefined,
      customerContactId:
        typeof request.query.customerContactId === "string" ? request.query.customerContactId : undefined,
    }),
  );
});

dealsRouter.post("/", requireScope("write"), validateBody(dealInputSchema), (request, response) => {
  const deal = createDeal(request.body);
  response.locals.audit = {
    action: "deal.create",
    objectType: "deal",
    objectId: deal.dealId,
  };
  response.status(201).json(deal);
});

dealsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getDeal(getRouteParam(request.params.id)));
});

dealsRouter.patch("/:id", requireScope("write"), validateBody(dealPatchSchema), (request, response) => {
  const deal = updateDeal(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "deal.update",
    objectType: "deal",
    objectId: deal.dealId,
  };
  response.json(deal);
});

dealsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const deal = getDeal(id);
  softDeleteDeal(id);
  response.locals.audit = {
    action: "deal.delete",
    objectType: "deal",
    objectId: deal.dealId,
  };
  response.status(204).send();
});
