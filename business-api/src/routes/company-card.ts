import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { companyCardInputSchema } from "@warehouse-hub/business-schemas";
import { getCompanyCard, upsertCompanyCard } from "../services/company-card.js";
import { requireScope } from "../middleware/auth.js";

export const companyCardRouter = Router();

companyCardRouter.get("/", requireScope("read"), (_request, response) => {
  const record = getCompanyCard();
  if (!record) {
    response.status(404).json({
      error: {
        code: "not_found",
        message: "Company card has not been created yet",
      },
    });
    return;
  }

  response.json(record);
});

companyCardRouter.put("/", requireScope("write"), validateBody(companyCardInputSchema), (request, response) => {
  const record = upsertCompanyCard(request.body);
  response.locals.audit = {
    action: "company_card.upsert",
    objectType: "company_card",
    objectId: record.companyId,
  };
  response.json(record);
});
