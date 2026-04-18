import { AppError } from "./errors.js";
import type { EmbeddingEntityType } from "./embeddings.js";
import { findSimilar } from "./embeddings.js";

export type ListFilterInput = {
  similar?: string;
  limit?: string | number;
  since?: string;
  before?: string;
  after?: string;
};

export type ListFilters = {
  similar?: string;
  limit?: number;
  since?: string;
  before?: string;
  after?: string;
};

export type ResolvedListFilters = {
  similar?: string;
  limit?: number;
  sinceDate?: string;
  beforeDate?: string;
  afterDate?: string;
};

const CLI_LIST_FILTER_ALIASES: Record<string, string> = {
  last: "since",
  until: "before",
  from: "after",
};

const CLI_LIST_FILTER_KEYS = new Set(["similar", "limit", "since", "before", "after"]);

export function parseCliListFilters(args: string[]): ListFilters {
  const values: Record<string, string | undefined> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      throw new AppError(`Unknown list option: ${arg}`, {
        statusCode: 400,
        code: "validation_error",
      });
    }

    const rawKey = arg.slice(2);
    const key = CLI_LIST_FILTER_ALIASES[rawKey] ?? rawKey;
    if (!CLI_LIST_FILTER_KEYS.has(key)) {
      throw new AppError(`Unknown list option: ${arg}`, {
        statusCode: 400,
        code: "validation_error",
      });
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new AppError(`Missing value for option: ${arg}`, {
        statusCode: 400,
        code: "validation_error",
      });
    }

    if (values[key] !== undefined) {
      throw new AppError(`Duplicate list option for '${key}': ${arg}`, {
        statusCode: 400,
        code: "validation_error",
      });
    }

    values[key] = value;
    index += 1;
  }

  return parseListFilters(values);
}

export function parseListFilters(input: ListFilterInput): ListFilters {
  const similar = input.similar?.trim() ? input.similar.trim() : undefined;
  const since = input.since?.trim() ? input.since.trim() : undefined;
  const before = input.before?.trim() ? input.before.trim() : undefined;
  const after = input.after?.trim() ? input.after.trim() : undefined;

  let limit: number | undefined;
  if (input.limit !== undefined) {
    const parsed =
      typeof input.limit === "number" ? input.limit : Number.parseInt(String(input.limit).trim(), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError("List filter 'limit' must be a positive integer", {
        statusCode: 400,
        code: "validation_error",
      });
    }
    limit = parsed;
  }

  if (before && !isIsoDate(before)) {
    throw new AppError("List filter 'before' must use YYYY-MM-DD", {
      statusCode: 400,
      code: "validation_error",
    });
  }

  if (after && !isIsoDate(after)) {
    throw new AppError("List filter 'after' must use YYYY-MM-DD", {
      statusCode: 400,
      code: "validation_error",
    });
  }

  if (since && !/^\d+[dwmy]$/.test(since)) {
    throw new AppError("List filter 'since' must use a relative duration like 1d, 1w, or 2m", {
      statusCode: 400,
      code: "validation_error",
    });
  }

  return { similar, limit, since, before, after };
}

export function resolveListFilters(filters: ListFilters, now = new Date()): ResolvedListFilters {
  return {
    similar: filters.similar,
    limit: filters.limit,
    beforeDate: filters.before,
    afterDate: filters.after,
    sinceDate: filters.since ? parseSinceToDate(filters.since, now) : undefined,
  };
}

export function extractDateOnly(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (isIsoDate(value)) {
    return value;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match?.[1];
}

export function matchesResolvedDateFilters(
  value: string | null | undefined,
  filters: ResolvedListFilters,
): boolean {
  if (!filters.sinceDate && !filters.beforeDate && !filters.afterDate) {
    return true;
  }

  const candidate = extractDateOnly(value);
  if (!candidate) {
    return false;
  }

  if (filters.sinceDate && candidate < filters.sinceDate) {
    return false;
  }

  if (filters.beforeDate && candidate >= filters.beforeDate) {
    return false;
  }

  if (filters.afterDate && candidate <= filters.afterDate) {
    return false;
  }

  return true;
}

export async function applySimilarityFilter<T>(
  items: T[],
  options: {
    entityType: EmbeddingEntityType;
    similar?: string;
    limit?: number;
    getEntityId: (item: T) => string;
  },
): Promise<T[]> {
  if (!options.similar) {
    return items;
  }

  const similarIds = await findSimilar(options.entityType, options.similar, options.limit ?? 5);
  const rankById = new Map(similarIds.map((row, index) => [row.entityId, index]));

  return items
    .filter((item) => rankById.has(options.getEntityId(item)))
    .sort((left, right) => {
      const leftRank = rankById.get(options.getEntityId(left)) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankById.get(options.getEntityId(right)) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
}

function parseSinceToDate(value: string, now: Date): string {
  const match = value.match(/^(\d+)([dwmy])$/);
  if (!match) {
    throw new AppError("List filter 'since' must use a relative duration like 1d, 1w, or 2m", {
      statusCode: 400,
      code: "validation_error",
    });
  }

  const amount = Number.parseInt(match[1] ?? "0", 10);
  const unit = match[2];
  const date = new Date(now);

  switch (unit) {
    case "d":
      date.setUTCDate(date.getUTCDate() - amount);
      break;
    case "w":
      date.setUTCDate(date.getUTCDate() - amount * 7);
      break;
    case "m":
      date.setUTCMonth(date.getUTCMonth() - amount);
      break;
    case "y":
      date.setUTCFullYear(date.getUTCFullYear() - amount);
      break;
    default:
      throw new AppError("Unsupported relative date unit", {
        statusCode: 400,
        code: "validation_error",
      });
  }

  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
