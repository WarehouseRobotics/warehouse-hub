import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { requireScope } from "../middleware/auth.js";
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

bankAccountsRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listBankAccounts({
      status: typeof request.query.status === "string" ? request.query.status : undefined,
    }),
  );
});

bankAccountsRouter.post("/", requireScope("write"), validateBody(bankAccountInputSchema), (request, response) => {
  const account = createBankAccount(request.body);
  response.locals.audit = {
    action: "bank_account.create",
    objectType: "bank_account",
    objectId: account.bankAccountId,
  };
  response.status(201).json(account);
});

bankAccountsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getBankAccount(getRouteParam(request.params.id)));
});

bankAccountsRouter.patch("/:id", requireScope("write"), validateBody(bankAccountPatchSchema), (request, response) => {
  const account = updateBankAccount(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "bank_account.update",
    objectType: "bank_account",
    objectId: account.bankAccountId,
  };
  response.json(account);
});

bankAccountsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const account = getBankAccount(id);
  softDeleteBankAccount(id);
  response.locals.audit = {
    action: "bank_account.delete",
    objectType: "bank_account",
    objectId: account.bankAccountId,
  };
  response.status(204).send();
});

bankTransactionsRouter.get("/", requireScope("read"), async (request, response, next) => {
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

bankTransactionsRouter.post("/", requireScope("write"), validateBody(bankTransactionInputSchema), (request, response) => {
  const transaction = createBankTransaction(request.body);
  response.locals.audit = {
    action: "bank_transaction.create",
    objectType: "bank_transaction",
    objectId: transaction.bankTransactionId,
  };
  response.status(201).json(transaction);
});

bankTransactionsRouter.post("/upsert", requireScope("write"), validateBody(bankTransactionUpsertSchema), (request, response) => {
  const result = upsertBankTransaction(request.body);
  response.locals.audit = {
    action: `bank_transaction.${result.action}`,
    objectType: "bank_transaction",
    objectId: result.transaction.bankTransactionId,
  };
  response.status(201).json(result);
});

bankTransactionsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getBankTransaction(getRouteParam(request.params.id)));
});

bankTransactionsRouter.patch("/:id", requireScope("write"), validateBody(bankTransactionPatchSchema), (request, response) => {
  const transaction = updateBankTransaction(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "bank_transaction.update",
    objectType: "bank_transaction",
    objectId: transaction.bankTransactionId,
  };
  response.json(transaction);
});

bankTransactionsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const transaction = getBankTransaction(id);
  softDeleteBankTransaction(id);
  response.locals.audit = {
    action: "bank_transaction.delete",
    objectType: "bank_transaction",
    objectId: transaction.bankTransactionId,
  };
  response.status(204).send();
});

bankTransactionsRouter.post("/:id/match", requireScope("write"), (request, response) => {
  const result = matchBankTransaction(getRouteParam(request.params.id));
  response.locals.audit = {
    action: "bank_transaction.match",
    objectType: "bank_transaction",
    objectId: result.bankTransactionId,
    metadata: {
      autoConfirmed: result.autoConfirmed,
      matchCount: result.matches.length,
    },
  };
  response.json(result);
});

bankBalanceSnapshotsRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listBankBalanceSnapshots({
      ...getListFilters(request.query),
      bankAccountId: typeof request.query.bankAccountId === "string" ? request.query.bankAccountId : undefined,
    }),
  );
});

bankBalanceSnapshotsRouter.post("/", requireScope("write"), validateBody(bankBalanceSnapshotInputSchema), (request, response) => {
  const snapshot = createBankBalanceSnapshot(request.body);
  response.locals.audit = {
    action: "bank_balance_snapshot.create",
    objectType: "bank_balance_snapshot",
    objectId: snapshot.bankBalanceSnapshotId,
  };
  response.status(201).json(snapshot);
});

bankTransactionMatchesRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listBankTransactionMatches({
      bankTransactionId:
        typeof request.query.bankTransactionId === "string" ? request.query.bankTransactionId : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
    }),
  );
});

bankTransactionMatchesRouter.post("/", requireScope("write"), validateBody(bankTransactionMatchInputSchema), (request, response) => {
  const match = createBankTransactionMatch(request.body);
  response.locals.audit = {
    action: "bank_transaction_match.create",
    objectType: "bank_transaction_match",
    objectId: match.bankTransactionMatchId,
  };
  response.status(201).json(match);
});

bankTransactionMatchesRouter.patch("/:id", requireScope("write"), validateBody(bankTransactionMatchPatchSchema), (request, response) => {
  const match = updateBankTransactionMatch(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "bank_transaction_match.update",
    objectType: "bank_transaction_match",
    objectId: match.bankTransactionMatchId,
  };
  response.json(match);
});
