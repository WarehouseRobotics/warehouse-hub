import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { auditMiddleware } from "./middleware/audit.js";
import { requireAuth, requireScope } from "./middleware/auth.js";
import {
  bankAccountsRouter,
  bankBalanceSnapshotsRouter,
  bankTransactionMatchesRouter,
  bankTransactionsRouter,
} from "./routes/bank.js";
import { authRouter } from "./routes/auth.js";
import {
  bookingAssignmentProfilesRouter,
  bookingAvailabilityExceptionsRouter,
  bookingsRouter,
} from "./routes/bookings.js";
import { companyCardRouter } from "./routes/company-card.js";
import { commentsRouter } from "./routes/comments.js";
import { contactsRouter } from "./routes/contacts.js";
import { dataCachesRouter } from "./routes/data-caches.js";
import { dealsRouter } from "./routes/deals.js";
import { documentsRouter } from "./routes/documents.js";
import { expensesRouter } from "./routes/expenses.js";
import { payrollsRouter } from "./routes/payrolls.js";
import { projectsRouter } from "./routes/projects.js";
import { salesInvoicesRouter } from "./routes/sales-invoices.js";
import { tasksRouter } from "./routes/tasks.js";
import {
  taxCarryforwardsRouter,
  taxReportsRouter,
} from "./routes/tax-reports.js";
import { tokensRouter } from "./routes/tokens.js";
import { publicUsersRouter, usersRouter } from "./routes/users.js";
import { workspaceRouter } from "./routes/workspace.js";

export function createApp() {
  const app = express();

  app.use((request, response, next) => {
    response.header("Access-Control-Allow-Origin", "*");
    response.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Api-Key, X-Request-Id",
    );
    response.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS",
    );

    if (request.method === "OPTIONS") {
      response.status(204).send();
      return;
    }

    next();
  });

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", publicUsersRouter);

  app.use("/api/v1", requireAuth);
  app.use("/api/v1", (request, response, next) => {
    const requiredScope =
      request.method === "GET" || request.method === "HEAD" ? "read" : "write";
    requireScope(requiredScope)(request, response, next);
  });
  app.use("/api/v1", auditMiddleware);
  app.use("/api/v1/bank-accounts", bankAccountsRouter);
  app.use("/api/v1/bank-transactions", bankTransactionsRouter);
  app.use("/api/v1/bank-balance-snapshots", bankBalanceSnapshotsRouter);
  app.use("/api/v1/bank-transaction-matches", bankTransactionMatchesRouter);
  app.use("/api/v1/bookings", bookingsRouter);
  app.use(
    "/api/v1/booking-assignment-profiles",
    bookingAssignmentProfilesRouter,
  );
  app.use(
    "/api/v1/booking-availability-exceptions",
    bookingAvailabilityExceptionsRouter,
  );
  app.use("/api/v1/company-card", companyCardRouter);
  app.use("/api/v1/comments", commentsRouter);
  app.use("/api/v1/contacts", contactsRouter);
  app.use("/api/v1/data-caches", dataCachesRouter);
  app.use("/api/v1/documents", documentsRouter);
  app.use("/api/v1/expenses", expensesRouter);
  app.use("/api/v1/payrolls", payrollsRouter);
  app.use("/api/v1/deals", dealsRouter);
  app.use("/api/v1/sales-invoices", salesInvoicesRouter);
  app.use("/api/v1/projects", projectsRouter);
  app.use("/api/v1/tasks", tasksRouter);
  app.use("/api/v1/tax-reports", taxReportsRouter);
  app.use("/api/v1/tax-carryforwards", taxCarryforwardsRouter);
  app.use("/api/v1/tokens", tokensRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/workspace", workspaceRouter);

  app.use(errorHandler);

  return app;
}
