import { Router } from "express";

import { validateBody } from "../middleware/validate.js";
import { companyCardInputSchema } from "../schemas/company-card.js";
import { getCompanyCard, upsertCompanyCard } from "../services/company-card.js";

export const companyCardRouter = Router();

companyCardRouter.get("/", (_request, response) => {
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

companyCardRouter.put("/", validateBody(companyCardInputSchema), (request, response) => {
  const record = upsertCompanyCard(request.body);
  response.json(record);
});
