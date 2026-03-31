import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { requireApiKey } from "./middleware/auth.js";
import { companyCardRouter } from "./routes/company-card.js";
import { contactsRouter } from "./routes/contacts.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/v1", requireApiKey);
  app.use("/api/v1/company-card", companyCardRouter);
  app.use("/api/v1/contacts", contactsRouter);

  app.use(errorHandler);

  return app;
}
