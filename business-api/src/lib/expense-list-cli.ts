import { AppError } from "./errors.js";
import { compareDateDesc, parseCliListFilters, type ListFilters } from "./list-filters.js";

type ExpenseListItem = {
  expenseId: string;
  invoiceDate: string | null;
  createdAt: string;
};

type PayrollListItem = {
  payrollId: string;
  periodEnd: string | null;
  paymentDate: string | null;
  createdAt: string;
};

export type ExpenseListCliFilters = ListFilters & {
  includePayrolls: boolean;
  status?: string;
};

export type CombinedExpenseListItem =
  | ({ entryType: "expense" } & ExpenseListItem & Record<string, unknown>)
  | ({ entryType: "payroll" } & PayrollListItem & Record<string, unknown>);

export function parseExpenseListCliFilters(args: string[]): ExpenseListCliFilters {
  const forwardedArgs: string[] = [];
  let includePayrolls = false;
  let status: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--include-payrolls") {
      if (includePayrolls) {
        throw new AppError(`Duplicate list option: ${arg}`, {
          statusCode: 400,
          code: "validation_error",
        });
      }

      includePayrolls = true;
      continue;
    }

    if (arg === "--status") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new AppError(`Missing value for option: ${arg}`, {
          statusCode: 400,
          code: "validation_error",
        });
      }

      if (status !== undefined) {
        throw new AppError(`Duplicate list option: ${arg}`, {
          statusCode: 400,
          code: "validation_error",
        });
      }

      status = value;
      index += 1;
      continue;
    }

    forwardedArgs.push(arg);
    if (arg?.startsWith("--")) {
      const value = args[index + 1];
      if (value && !value.startsWith("--")) {
        forwardedArgs.push(value);
        index += 1;
      }
    }
  }

  return {
    ...parseCliListFilters(forwardedArgs),
    includePayrolls,
    status,
  };
}

export function mergeExpenseAndPayrollListItems(
  expenses: Array<Record<string, unknown> & ExpenseListItem>,
  payrolls: Array<Record<string, unknown> & PayrollListItem>,
): CombinedExpenseListItem[] {
  return [
    ...expenses.map((expense) => ({
      ...expense,
      entryType: "expense" as const,
    })),
    ...payrolls.map((payroll) => ({
      ...payroll,
      entryType: "payroll" as const,
    })),
  ].sort((left, right) => {
    const leftEffectiveDate =
      left.entryType === "expense" ? left.invoiceDate ?? left.createdAt : left.periodEnd ?? left.paymentDate ?? left.createdAt;
    const rightEffectiveDate =
      right.entryType === "expense"
        ? right.invoiceDate ?? right.createdAt
        : right.periodEnd ?? right.paymentDate ?? right.createdAt;

    return (
      compareDateDesc(leftEffectiveDate, rightEffectiveDate)
      || compareDateDesc(left.createdAt, right.createdAt)
      || (
        left.entryType === "expense"
          ? left.expenseId.localeCompare(right.entryType === "expense" ? right.expenseId : right.payrollId)
          : left.payrollId.localeCompare(right.entryType === "expense" ? right.expenseId : right.payrollId)
      ) * -1
    );
  });
}
