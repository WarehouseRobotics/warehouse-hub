import { describe, expect, it } from "vitest";

import { mergeExpenseAndPayrollListItems, parseExpenseListCliFilters } from "./expense-list-cli.js";

describe("expense list CLI helpers", () => {
  it("parses expense list flags including payroll inclusion", () => {
    expect(parseExpenseListCliFilters(["--status", "recorded", "--include-payrolls", "--since", "1m"])).toEqual({
      similar: undefined,
      limit: undefined,
      since: "1m",
      before: undefined,
      after: undefined,
      includePayrolls: true,
      status: "recorded",
    });
  });

  it("rejects duplicate expense-specific flags", () => {
    expect(() => parseExpenseListCliFilters(["--include-payrolls", "--include-payrolls"])).toThrow(
      /Duplicate list option/,
    );
    expect(() => parseExpenseListCliFilters(["--status", "recorded", "--status", "paid"])).toThrow(
      /Duplicate list option/,
    );
  });

  it("merges expenses and payrolls using the combined effective date sort", () => {
    const merged = mergeExpenseAndPayrollListItems(
      [
        {
          expenseId: "exp_001",
          invoiceDate: "2026-03-12",
          createdAt: "2026-03-12T09:00:00.000Z",
          supplierDisplayName: "Acme Supplies",
        },
        {
          expenseId: "exp_002",
          invoiceDate: null,
          createdAt: "2026-03-20T09:00:00.000Z",
          supplierDisplayName: "Late Invoice",
        },
      ],
      [
        {
          payrollId: "pay_001",
          periodEnd: "2026-03-31",
          paymentDate: "2026-04-02",
          createdAt: "2026-04-01T09:00:00.000Z",
          employeeDisplayName: "Ada Lovelace",
        },
        {
          payrollId: "pay_002",
          periodEnd: null,
          paymentDate: "2026-03-21",
          createdAt: "2026-03-16T09:00:00.000Z",
          employeeDisplayName: "Grace Hopper",
        },
      ],
    );

    expect(merged.map((item) => `${item.entryType}:${item.entryType === "expense" ? item.expenseId : item.payrollId}`)).toEqual([
      "payroll:pay_001",
      "payroll:pay_002",
      "expense:exp_002",
      "expense:exp_001",
    ]);
  });
});
