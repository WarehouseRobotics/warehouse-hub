import AjvModule from "ajv/dist/2020.js"; // because of NodeNext in tsconfig.json
import { and, desc, eq } from "drizzle-orm";

import { getDatabase, getOrm } from "../db/connection.js";
import { dataCacheEntries, dataCaches } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import {
  defaultDataCacheValueSchema,
  type DataCacheInput,
  type DataCacheKeyType,
  type FetcherConfig,
  type JsonObject,
} from "../schemas/data-caches.js";

const Ajv = AjvModule.default ?? AjvModule;
const ajv = new Ajv({ allErrors: true });
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type EntrySource = "fetcher" | "manual" | "import";
type LookupStrategy = "fallback_only" | "fetch_on_miss" | "staleness_window";

type DataCacheRecord = typeof dataCaches.$inferSelect;
type DataCacheEntryRecord = typeof dataCacheEntries.$inferSelect;

type LookupOptions = {
  strategy: LookupStrategy;
  maxStalenessWindow?: number;
  fetchTimeoutMs?: number;
};

type FoundLookupResult = {
  key: string;
  value: JsonObject;
  source: "exact" | "fallback";
  fetchedAt: string;
  isStale: boolean;
  staleDays?: number;
};

type NeedsFetchLookupResult = {
  key: string;
  source: "needs_fetch";
  instructionPrompt: string;
  valueSchema: JsonObject;
  submission: {
    method: "POST";
    path: string;
    bodyExample: {
      key: string;
      value: JsonObject;
    };
  };
  retry: {
    method: "POST";
    path: string;
    body: {
      key: string;
      strategy: LookupStrategy;
      maxStalenessWindow?: number;
    };
  };
};

type LookupResult = FoundLookupResult | NeedsFetchLookupResult;

type ParsedDataCache = ReturnType<typeof mapCache>;
type ParsedDataCacheEntry = ReturnType<typeof mapEntry>;

function parseJsonObject(value: string, label: string): JsonObject {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new AppError(`Invalid stored ${label} JSON`, {
      statusCode: 500,
      code: "internal_error",
      details: { label, error: error instanceof Error ? error.message : String(error) },
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppError(`Stored ${label} JSON must be an object`, {
      statusCode: 500,
      code: "internal_error",
      details: { label },
    });
  }

  return parsed as JsonObject;
}

function assertValidJsonSchema(schema: JsonObject): void {
  try {
    ajv.compile(schema);
  } catch (error) {
    throw new AppError("Invalid value schema", {
      statusCode: 400,
      code: "validation_error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

function validateEntryValue(schema: JsonObject, value: JsonObject): void {
  let validate;

  try {
    validate = ajv.compile(schema);
  } catch (error) {
    throw new AppError("Invalid value schema", {
      statusCode: 400,
      code: "validation_error",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const valid = validate(value);
  if (!valid) {
    throw new AppError(`Entry value does not match cache schema. Data: ${JSON.stringify(value, null, 2)}. Schema: ${JSON.stringify(schema, null, 2)}`, {
      statusCode: 400,
      code: "validation_error",
      details: validate.errors ?? [],
    });
  }
}

function mapCache(record: DataCacheRecord) {
  return {
    id: record.id,
    slug: record.slug,
    displayName: record.displayName,
    description: record.description,
    keyType: record.keyType as DataCacheKeyType,
    valueSchema: parseJsonObject(record.valueSchema, "value_schema"),
    fetcherConfig: record.fetcherConfig ? parseJsonObject(record.fetcherConfig, "fetcher_config") : null,
    defaultTtlDays: record.defaultTtlDays,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapEntry(record: DataCacheEntryRecord) {
  return {
    id: record.id,
    cacheId: record.cacheId,
    key: record.entryKey,
    value: parseJsonObject(record.value, "entry value"),
    source: record.source as EntrySource,
    fetchedAt: record.fetchedAt,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}

function getCacheRecord(slug: string): DataCacheRecord | undefined {
  return getOrm().select().from(dataCaches).where(eq(dataCaches.slug, slug)).get();
}

function requireCacheRecord(slug: string): DataCacheRecord {
  const record = getCacheRecord(slug);
  if (!record) {
    throw new AppError(`Data cache not found: ${slug}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  return record;
}

function isEntryFresh(cache: ParsedDataCache, entry: ParsedDataCacheEntry, now = new Date()): boolean {
  if (entry.expiresAt) {
    return new Date(entry.expiresAt).getTime() > now.getTime();
  }

  if (cache.defaultTtlDays === null || cache.defaultTtlDays === undefined) {
    return true;
  }

  return new Date(entry.fetchedAt).getTime() + cache.defaultTtlDays * MS_PER_DAY > now.getTime();
}

function resolveExpiresAt(cache: ParsedDataCache, fetchedAt: string, expiresAt?: string): string | null {
  if (expiresAt) {
    return expiresAt;
  }

  if (cache.defaultTtlDays === null || cache.defaultTtlDays === undefined) {
    return null;
  }

  return new Date(new Date(fetchedAt).getTime() + cache.defaultTtlDays * MS_PER_DAY).toISOString();
}

function calculateStaleDistance(keyType: DataCacheKeyType, requestedKey: string, entryKey: string): number | undefined {
  if (keyType === "string") {
    return undefined;
  }

  if (keyType === "numeric") {
    return Math.abs(Number(entryKey) - Number(requestedKey));
  }

  return Math.abs(new Date(entryKey).getTime() - new Date(requestedKey).getTime()) / MS_PER_DAY;
}

function parseNearestEntry(cache: ParsedDataCache, row: DataCacheEntryRecord | undefined): ParsedDataCacheEntry | null {
  if (!row) {
    return null;
  }

  return mapEntry(row);
}

function getNearestEntry(cache: ParsedDataCache, key: string, maxDistance?: number): ParsedDataCacheEntry | null {
  if (cache.keyType === "string") {
    return null;
  }

  const database = getDatabase();
  let sql = "";
  let params: unknown[] = [];

  if (cache.keyType === "numeric") {
    sql = `
      SELECT
        id,
        cache_id AS cacheId,
        entry_key AS entryKey,
        value,
        source,
        fetched_at AS fetchedAt,
        expires_at AS expiresAt,
        created_at AS createdAt
      FROM data_cache_entries
      WHERE cache_id = ?
      ORDER BY ABS(CAST(entry_key AS REAL) - CAST(? AS REAL)) ASC, created_at DESC
      LIMIT 1
    `;
    params = [cache.id, key];
  } else {
    sql = `
      SELECT
        id,
        cache_id AS cacheId,
        entry_key AS entryKey,
        value,
        source,
        fetched_at AS fetchedAt,
        expires_at AS expiresAt,
        created_at AS createdAt
      FROM data_cache_entries
      WHERE cache_id = ?
      ORDER BY ABS(julianday(entry_key) - julianday(?)) ASC, created_at DESC
      LIMIT 1
    `;
    params = [cache.id, key];
  }

  const row = database.prepare(sql).get(...params) as DataCacheEntryRecord | undefined;
  const entry = parseNearestEntry(cache, row);
  if (!entry) {
    return null;
  }

  if (maxDistance === undefined) {
    return entry;
  }

  const distance = calculateStaleDistance(cache.keyType, key, entry.key);
  if (distance === undefined || distance > maxDistance) {
    return null;
  }

  return entry;
}

function buildFallbackResult(cache: ParsedDataCache, requestedKey: string, entry: ParsedDataCacheEntry): FoundLookupResult {
  const staleDays = calculateStaleDistance(cache.keyType, requestedKey, entry.key);

  return {
    key: entry.key,
    value: entry.value,
    source: "fallback",
    fetchedAt: entry.fetchedAt,
    isStale: true,
    ...(staleDays === undefined ? {} : { staleDays }),
  };
}

function buildPrompt(fetcherConfig: FetcherConfig, key: string, valueSchema: JsonObject): string {
  const promptTemplate = fetcherConfig.prompt;
  const interpolated = promptTemplate.replace(/\{\{\s*(key|config\.[^}]+)\s*\}\}/g, (match, placeholder: string) => {
    if (placeholder === "key") {
      return key;
    }

    if (!placeholder.startsWith("config.")) {
      return match;
    }

    const configKey = placeholder.slice("config.".length);
    const value = (fetcherConfig as Record<string, unknown>)[configKey];
    return value === undefined ? "" : String(value);
  });

  return `${interpolated}\n\nJSON response schema:\n\`\`\`json\n${JSON.stringify(valueSchema, null, 2)}\n\`\`\``;
}

function buildNeedsFetchResult(
  cache: ParsedDataCache,
  key: string,
  opts: LookupOptions,
): NeedsFetchLookupResult {
  const submissionPath = `/api/v1/data-caches/${encodeURIComponent(cache.slug)}/fetch-submissions`;
  const lookupPath = `/api/v1/data-caches/${encodeURIComponent(cache.slug)}/lookup`;
  const retryBody = {
    key,
    strategy: opts.strategy,
    ...(opts.maxStalenessWindow === undefined ? {} : { maxStalenessWindow: opts.maxStalenessWindow }),
  };
  const fetchPrompt = buildPrompt(cache.fetcherConfig as FetcherConfig, key, cache.valueSchema);
  const instructionPrompt = `${fetchPrompt}

When you have the value, submit it to the Warehouse Business API using the caller's existing Business API authentication.

POST ${submissionPath}
\`\`\`json
${JSON.stringify({ key, value: {} }, null, 2)}
\`\`\`

The value property must be a JSON object matching the schema above. After a successful submission, retry the lookup:

POST ${lookupPath}
\`\`\`json
${JSON.stringify(retryBody, null, 2)}
\`\`\``;

  return {
    key,
    source: "needs_fetch",
    instructionPrompt,
    valueSchema: cache.valueSchema,
    submission: {
      method: "POST",
      path: submissionPath,
      bodyExample: {
        key,
        value: {},
      },
    },
    retry: {
      method: "POST",
      path: lookupPath,
      body: retryBody,
    },
  };
}

export function createCache(input: DataCacheInput) {
  const existing = getCacheRecord(input.slug);
  if (existing) {
    throw new AppError(`Data cache already exists: ${input.slug}`, {
      statusCode: 409,
      code: "conflict",
    });
  }

  const valueSchema = input.valueSchema ?? defaultDataCacheValueSchema;
  assertValidJsonSchema(valueSchema);

  const now = new Date().toISOString();
  const id = createPrefixedId("dche_");

  getOrm()
    .insert(dataCaches)
    .values({
      id,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description ?? null,
      keyType: input.keyType,
      valueSchema: JSON.stringify(valueSchema),
      fetcherConfig: input.fetcherConfig ? JSON.stringify(input.fetcherConfig) : null,
      defaultTtlDays: input.defaultTtlDays ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getCache(input.slug);
}

export function getCache(slug: string) {
  return mapCache(requireCacheRecord(slug));
}

export function listCaches() {
  return getOrm().select().from(dataCaches).orderBy(dataCaches.slug).all().map(mapCache);
}

export function listCacheEntries(cacheSlug: string, options: { key?: string; limit?: number } = {}) {
  const cache = getCache(cacheSlug);
  const conditions = [eq(dataCacheEntries.cacheId, cache.id)];
  if (options.key) {
    conditions.push(eq(dataCacheEntries.entryKey, options.key));
  }

  const query = getOrm()
    .select()
    .from(dataCacheEntries)
    .where(and(...conditions))
    .orderBy(desc(dataCacheEntries.createdAt));

  const rows = (options.limit ? query.limit(options.limit) : query).all();
  return rows.map(mapEntry);
}

export function upsertEntry(cacheSlug: string, key: string, value: JsonObject, source: EntrySource = "manual", expiresAt?: string) {
  const cache = getCache(cacheSlug);
  validateEntryValue(cache.valueSchema, value);

  const database = getDatabase();
  const now = new Date().toISOString();
  const resolvedExpiresAt = resolveExpiresAt(cache, now, expiresAt);
  const existing = database
    .prepare(
      `
        SELECT id
        FROM data_cache_entries
        WHERE cache_id = ? AND entry_key = ?
      `,
    )
    .get(cache.id, key) as { id: string } | undefined;

  if (existing) {
    getOrm()
      .update(dataCacheEntries)
      .set({
        value: JSON.stringify(value),
        source,
        fetchedAt: now,
        expiresAt: resolvedExpiresAt,
      })
      .where(eq(dataCacheEntries.id, existing.id))
      .run();

    const updated = getOrm().select().from(dataCacheEntries).where(eq(dataCacheEntries.id, existing.id)).get();
    return mapEntry(updated!);
  }

  const id = createPrefixedId("dce_");
  getOrm()
    .insert(dataCacheEntries)
    .values({
      id,
      cacheId: cache.id,
      entryKey: key,
      value: JSON.stringify(value),
      source,
      fetchedAt: now,
      expiresAt: resolvedExpiresAt,
      createdAt: now,
    })
    .run();

  const created = getOrm().select().from(dataCacheEntries).where(eq(dataCacheEntries.id, id)).get();
  return mapEntry(created!);
}

export function submitFetchedEntry(cacheSlug: string, key: string, value: JsonObject, expiresAt?: string) {
  return upsertEntry(cacheSlug, key, value, "fetcher", expiresAt);
}

export function bulkImport(cacheSlug: string, entries: Array<{ key: string; value: JsonObject; expiresAt?: string }>) {
  let inserted = 0;
  let updated = 0;

  const cache = getCache(cacheSlug);
  for (const entry of entries) {
    validateEntryValue(cache.valueSchema, entry.value);

    const existing = getDatabase()
      .prepare("SELECT id FROM data_cache_entries WHERE cache_id = ? AND entry_key = ?")
      .get(cache.id, entry.key) as { id: string } | undefined;

    upsertEntry(cacheSlug, entry.key, entry.value, "import", entry.expiresAt);
    if (existing) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  return { inserted, updated };
}

export async function lookup(cacheSlug: string, key: string, opts: LookupOptions): Promise<LookupResult | null> {
  const cache = getCache(cacheSlug);
  const exactRow = getOrm()
    .select()
    .from(dataCacheEntries)
    .where(and(eq(dataCacheEntries.cacheId, cache.id), eq(dataCacheEntries.entryKey, key)))
    .get();

  const exactEntry = exactRow ? mapEntry(exactRow) : null;
  if (exactEntry && isEntryFresh(cache, exactEntry)) {
    return {
      key: exactEntry.key,
      value: exactEntry.value,
      source: "exact",
      fetchedAt: exactEntry.fetchedAt,
      isStale: false,
    };
  }

  const orderedKeyType = cache.keyType !== "string";

  if (opts.strategy === "fallback_only") {
    if (orderedKeyType) {
      const nearest = getNearestEntry(cache, key);
      return nearest ? buildFallbackResult(cache, key, nearest) : null;
    }
    return null;
  }

  if (opts.strategy === "staleness_window" && orderedKeyType) {
    const withinWindow = getNearestEntry(cache, key, opts.maxStalenessWindow);
    if (withinWindow) {
      return buildFallbackResult(cache, key, withinWindow);
    }
  }

  if (cache.fetcherConfig) {
    return buildNeedsFetchResult(cache, key, opts);
  }

  if (orderedKeyType) {
    const fallback = getNearestEntry(cache, key);
    return fallback ? buildFallbackResult(cache, key, fallback) : null;
  }

  return null;
}
