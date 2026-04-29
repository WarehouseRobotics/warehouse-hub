import { AppError } from "./errors.js";
import { normalizeMoneyString } from "./money.js";
import type { BankCsvImportOptions } from "@warehouse-hub/business-schemas";
import type { BankCsvRowInput } from "../services/bank.js";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashDate = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (slashDate) {
    return `${slashDate[3]}-${slashDate[2].padStart(2, "0")}-${slashDate[1].padStart(2, "0")}`;
  }

  throw new AppError(`Invalid bank CSV transaction date: ${value}`, {
    statusCode: 400,
    code: "invalid_bank_csv_date",
  });
}

function requireColumn(headers: string[], column: string): number {
  const index = headers.findIndex((header) => header === column);
  if (index < 0) {
    throw new AppError(`Bank CSV is missing required column: ${column}`, {
      statusCode: 400,
      code: "missing_bank_csv_column",
    });
  }

  return index;
}

function optionalColumn(headers: string[], column: string | undefined): number | undefined {
  if (!column) {
    return undefined;
  }

  const index = headers.findIndex((header) => header === column);
  return index >= 0 ? index : undefined;
}

export function parseBankCsvRows(csvText: string, options: BankCsvImportOptions): BankCsvRowInput[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const dateIndex = requireColumn(headers, options.dateColumn);
  const amountIndex = requireColumn(headers, options.amountColumn);
  const descriptionIndex = requireColumn(headers, options.descriptionColumn);
  const referenceIndex = optionalColumn(headers, options.referenceColumn);
  const balanceIndex = optionalColumn(headers, options.balanceColumn);
  const currencyIndex = optionalColumn(headers, options.currencyColumn);

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const currency = currencyIndex !== undefined ? cells[currencyIndex]?.trim() : options.defaultCurrency;
    if (!currency) {
      throw new AppError(`Bank CSV row ${rowIndex + 2} is missing currency`, {
        statusCode: 400,
        code: "missing_bank_csv_currency",
      });
    }

    return {
      transactionDate: normalizeDate(cells[dateIndex] ?? ""),
      amount: normalizeMoneyString(cells[amountIndex] ?? ""),
      description: cells[descriptionIndex] ?? "",
      reference: referenceIndex !== undefined ? cells[referenceIndex] || undefined : undefined,
      runningBalance: balanceIndex !== undefined && cells[balanceIndex]
        ? normalizeMoneyString(cells[balanceIndex])
        : undefined,
      currency,
    };
  });
}
