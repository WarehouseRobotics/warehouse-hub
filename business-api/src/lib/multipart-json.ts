import { AppError } from "./errors.js";

export function parseMultipartJson<T>(
  value: T | string | undefined,
  label = "multipart JSON field",
): T | undefined {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new AppError(`Invalid ${label}`, {
      statusCode: 400,
      code: "validation_error",
    });
  }
}
