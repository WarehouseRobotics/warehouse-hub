import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { requireApiKey } from "./middleware/auth.js";
import { companyCardRouter } from "./routes/company-card.js";
import { contactsRouter } from "./routes/contacts.js";
import { dealsRouter } from "./routes/deals.js";
import { documentsRouter } from "./routes/documents.js";
import { expensesRouter } from "./routes/expenses.js";
import { projectsRouter } from "./routes/projects.js";
import { salesInvoicesRouter } from "./routes/sales-invoices.js";
import { tasksRouter } from "./routes/tasks.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/v1", requireApiKey);
  app.use("/api/v1/company-card", companyCardRouter);
  app.use("/api/v1/contacts", contactsRouter);
  app.use("/api/v1/documents", documentsRouter);
  app.use("/api/v1/expenses", expensesRouter);
  app.use("/api/v1/deals", dealsRouter);
  app.use("/api/v1/sales-invoices", salesInvoicesRouter);
  app.use("/api/v1/projects", projectsRouter);
  app.use("/api/v1/tasks", tasksRouter);

  app.use(errorHandler);

  return app;
}
