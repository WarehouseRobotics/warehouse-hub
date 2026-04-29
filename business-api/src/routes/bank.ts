import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { validateBody } from "../middleware/validate.js";
import {
  createBankAccount,
  createBankBalanceSnapshot,
  createBankTransaction,
  createBankTransactionMatch,
  getBankAccount,
  getBankTransaction,
  listBankAccounts,
  listBankBalanceSnapshots,
  listBankTransactionMatches,
  listBankTransactions,
  matchBankTransaction,
  softDeleteBankAccount,
  softDeleteBankTransaction,
  updateBankAccount,
  updateBankTransaction,
  updateBankTransactionMatch,
  upsertBankTransaction,
} from "../services/bank.js";
import {
  bankAccountInputSchema,
  bankAccountPatchSchema,
  bankBalanceSnapshotInputSchema,
  bankTransactionInputSchema,
  bankTransactionMatchInputSchema,
  bankTransactionMatchPatchSchema,
  bankTransactionPatchSchema,
  bankTransactionUpsertSchema,
} from "@warehouse-hub/business-schemas";

export const bankAccountsRouter = Router();
export const bankTransactionsRouter = Router();
export const bankBalanceSnapshotsRouter = Router();
export const bankTransactionMatchesRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function getListFilters(query: Record<string, unknown>) {
  return parseListFilters({
    limit: typeof query.limit === "string" ? query.limit : undefined,
    since: typeof query.since === "string" ? query.since : undefined,
    before: typeof query.before === "string" ? query.before : undefined,
    after: typeof query.after === "string" ? query.after : undefined,
  });
}

bankAccountsRouter.get("/", (request, response) => {
  response.json(
    listBankAccounts({
      status: typeof request.query.status === "string" ? request.query.status : undefined,
    }),
  );
});

bankAccountsRouter.post("/", validateBody(bankAccountInputSchema), (request, response) => {
  response.status(201).json(createBankAccount(request.body));
});

bankAccountsRouter.get("/:id", (request, response) => {
  response.json(getBankAccount(getRouteParam(request.params.id)));
});

bankAccountsRouter.patch("/:id", validateBody(bankAccountPatchSchema), (request, response) => {
  response.json(updateBankAccount(getRouteParam(request.params.id), request.body));
});

bankAccountsRouter.delete("/:id", (request, response) => {
  softDeleteBankAccount(getRouteParam(request.params.id));
  response.status(204).send();
});

bankTransactionsRouter.get("/", async (request, response, next) => {
  try {
    response.json(
      await listBankTransactions({
        ...getListFilters(request.query),
        bankAccountId: typeof request.query.bankAccountId === "string" ? request.query.bankAccountId : undefined,
        status: typeof request.query.status === "string" ? request.query.status : undefined,
        kind: typeof request.query.kind === "string" ? request.query.kind : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

bankTransactionsRouter.post("/", validateBody(bankTransactionInputSchema), (request, response) => {
  response.status(201).json(createBankTransaction(request.body));
});

bankTransactionsRouter.post("/upsert", validateBody(bankTransactionUpsertSchema), (request, response) => {
  response.status(201).json(upsertBankTransaction(request.body));
});

bankTransactionsRouter.get("/:id", (request, response) => {
  response.json(getBankTransaction(getRouteParam(request.params.id)));
});

bankTransactionsRouter.patch("/:id", validateBody(bankTransactionPatchSchema), (request, response) => {
  response.json(updateBankTransaction(getRouteParam(request.params.id), request.body));
});

bankTransactionsRouter.delete("/:id", (request, response) => {
  softDeleteBankTransaction(getRouteParam(request.params.id));
  response.status(204).send();
});

bankTransactionsRouter.post("/:id/match", (request, response) => {
  response.json(matchBankTransaction(getRouteParam(request.params.id)));
});

bankBalanceSnapshotsRouter.get("/", (request, response) => {
  response.json(
    listBankBalanceSnapshots({
      ...getListFilters(request.query),
      bankAccountId: typeof request.query.bankAccountId === "string" ? request.query.bankAccountId : undefined,
    }),
  );
});

bankBalanceSnapshotsRouter.post("/", validateBody(bankBalanceSnapshotInputSchema), (request, response) => {
  response.status(201).json(createBankBalanceSnapshot(request.body));
});

bankTransactionMatchesRouter.get("/", (request, response) => {
  response.json(
    listBankTransactionMatches({
      bankTransactionId:
        typeof request.query.bankTransactionId === "string" ? request.query.bankTransactionId : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
    }),
  );
});

bankTransactionMatchesRouter.post("/", validateBody(bankTransactionMatchInputSchema), (request, response) => {
  response.status(201).json(createBankTransactionMatch(request.body));
});

bankTransactionMatchesRouter.patch("/:id", validateBody(bankTransactionMatchPatchSchema), (request, response) => {
  response.json(updateBankTransactionMatch(getRouteParam(request.params.id), request.body));
});
