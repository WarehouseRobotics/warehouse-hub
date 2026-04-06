import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { dealInputSchema, dealPatchSchema } from "../schemas/deal.js";
import { createDeal, getDeal, listDeals, softDeleteDeal, updateDeal } from "../services/deals.js";

export const dealsRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

dealsRouter.get("/", (request, response) => {
  response.json(
    listDeals({
      stage: typeof request.query.stage === "string" ? request.query.stage : undefined,
      customerContactId:
        typeof request.query.customerContactId === "string" ? request.query.customerContactId : undefined,
    }),
  );
});

dealsRouter.post("/", validateBody(dealInputSchema), (request, response) => {
  response.status(201).json(createDeal(request.body));
});

dealsRouter.get("/:id", (request, response) => {
  response.json(getDeal(getRouteParam(request.params.id)));
});

dealsRouter.patch("/:id", validateBody(dealPatchSchema), (request, response) => {
  response.json(updateDeal(getRouteParam(request.params.id), request.body));
});

dealsRouter.delete("/:id", (request, response) => {
  softDeleteDeal(getRouteParam(request.params.id));
  response.status(204).send();
});
