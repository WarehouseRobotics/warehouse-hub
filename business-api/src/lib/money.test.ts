import { describe, expect, it } from "vitest";

import { computeLineItemTotals, normalizeMoneyString } from "./money.js";

describe("money normalization", () => {
  it("normalizes money values with comma thousands and dot decimals", () => {
    expect(normalizeMoneyString("9,975.00")).toBe("9975.00");
  });

  it("normalizes money values with dot thousands and comma decimals", () => {
    expect(normalizeMoneyString("9.975,00")).toBe("9975.00");
  });

  it("computes totals from localized line item values", () => {
    expect(
      computeLineItemTotals([
        {
          quantity: "2",
          unitPrice: "9,975.00",
          taxRate: "21,00",
        },
      ]),
    ).toEqual({
      net: "19950.00",
      tax: "4189.50",
      gross: "24139.50",
      taxLines: [
        {
          rate: "21.00",
          base: "19950.00",
          amount: "4189.50",
        },
      ],
    });
  });
});
