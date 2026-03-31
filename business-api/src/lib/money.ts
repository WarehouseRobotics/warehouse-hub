import { AppError } from "./errors.js";

export function normalizeMoneyString(value: string): string {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw new AppError(`Invalid money value: ${value}`, {
      statusCode: 400,
      code: "invalid_money",
    });
  }

  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
