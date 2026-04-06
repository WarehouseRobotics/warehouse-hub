import { Decimal } from "decimal.js";

import { AppError } from "./errors.js";

type TaxableLineItem = {
  quantity: string | number;
  unitPrice: string;
  taxRate?: string;
};

export type ComputedTaxLine = {
  rate: string;
  base: string;
  amount: string;
};

function parseDecimalInput(value: string | number, label: string): Decimal {
  const normalized = typeof value === "number" ? value.toString() : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new AppError(`Invalid ${label}: ${value}`, {
      statusCode: 400,
      code: `invalid_${label.replace(/\s+/g, "_")}`,
    });
  }

  return new Decimal(normalized);
}

function formatMoney(decimal: Decimal): string {
  return decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function normalizeMoneyString(value: string): string {
  return formatMoney(parseDecimalInput(value, "money value"));
}

export function normalizeQuantityString(value: string | number): string {
  const decimal = parseDecimalInput(value, "quantity");
  if (decimal.lte(0)) {
    throw new AppError(`Invalid quantity: ${value}`, {
      statusCode: 400,
      code: "invalid_quantity",
    });
  }

  return decimal.toString();
}

export function addMoney(...values: string[]): string {
  const total = values.reduce((sum, value) => sum.plus(parseDecimalInput(value, "money value")), new Decimal(0));
  return formatMoney(total);
}

export function multiplyMoney(amount: string, quantity: string | number): string {
  const result = parseDecimalInput(amount, "money value").times(parseDecimalInput(quantity, "quantity"));
  return formatMoney(result);
}

export function computeTaxAmount(base: string, rate: string): string {
  const result = parseDecimalInput(base, "money value")
    .times(parseDecimalInput(rate, "tax rate"))
    .div(100);

  return formatMoney(result);
}

export function computeTaxLine(base: string, rate: string): ComputedTaxLine {
  return {
    rate: normalizeMoneyString(rate),
    base: normalizeMoneyString(base),
    amount: computeTaxAmount(base, rate),
  };
}

export function computeLineItemTotals(
  lineItems: TaxableLineItem[],
): { net: string; tax: string; gross: string; taxLines: ComputedTaxLine[] } {
  const aggregatedTaxLines = new Map<string, { base: Decimal; amount: Decimal }>();
  let net = new Decimal(0);

  for (const lineItem of lineItems) {
    const lineBase = parseDecimalInput(lineItem.unitPrice, "money value").times(
      parseDecimalInput(lineItem.quantity, "quantity"),
    );
    net = net.plus(lineBase);

    const normalizedRate = normalizeMoneyString(lineItem.taxRate ?? "0");
    const lineTax = parseDecimalInput(computeTaxAmount(lineBase.toString(), normalizedRate), "money value");
    const current = aggregatedTaxLines.get(normalizedRate) ?? {
      base: new Decimal(0),
      amount: new Decimal(0),
    };

    aggregatedTaxLines.set(normalizedRate, {
      base: current.base.plus(lineBase),
      amount: current.amount.plus(lineTax),
    });
  }

  const taxLines = Array.from(aggregatedTaxLines.entries()).map(([rate, values]) => {
    return {
      rate,
      base: formatMoney(values.base),
      amount: formatMoney(values.amount),
    };
  });

  const tax = taxLines.reduce((sum, line) => sum.plus(parseDecimalInput(line.amount, "money value")), new Decimal(0));
  const gross = net.plus(tax);

  return {
    net: formatMoney(net),
    tax: formatMoney(tax),
    gross: formatMoney(gross),
    taxLines,
  };
}
