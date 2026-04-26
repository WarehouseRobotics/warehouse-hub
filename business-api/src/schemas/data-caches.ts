import { z } from "zod";

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), jsonObjectSchema]),
);

const jsonObjectSchema: z.ZodType<JsonObject> = z.lazy(() => z.record(jsonValueSchema));

export const dataCacheKeyTypeSchema = z.enum(["string", "date", "datetime", "numeric"]);

export const fetcherConfigSchema = z.object({
  prompt: z.string().min(1),
}).catchall(jsonValueSchema);

export const defaultDataCacheValueSchema = {
  type: "object",
  properties: {
    value: {},
  },
  required: ["value"],
} satisfies JsonObject;

export const dataCacheInputSchema = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1).optional(),
  keyType: dataCacheKeyTypeSchema,
  valueSchema: jsonObjectSchema.optional(),
  fetcherConfig: fetcherConfigSchema.optional(),
  defaultTtlDays: z.number().int().positive().optional(),
});

export const dataCacheEntryUpsertSchema = z.object({
  key: z.string().min(1),
  value: jsonObjectSchema,
  expiresAt: z.string().datetime().optional(),
});

export const dataCacheBulkImportSchema = z.object({
  entries: z.array(dataCacheEntryUpsertSchema).min(1),
});

export const lookupStrategySchema = z.enum(["fallback_only", "fetch_on_miss", "staleness_window"]);

export const dataCacheLookupSchema = z.object({
  key: z.string().min(1),
  strategy: lookupStrategySchema,
  maxStalenessWindow: z.number().nonnegative().optional(),
  fetchTimeoutMs: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (value.strategy === "staleness_window" && value.maxStalenessWindow === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "maxStalenessWindow is required for staleness_window lookups",
      path: ["maxStalenessWindow"],
    });
  }
});

export const dataCacheEntriesQuerySchema = z.object({
  key: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export type DataCacheKeyType = z.infer<typeof dataCacheKeyTypeSchema>;
export type FetcherConfig = {
  prompt: string;
  [key: string]: JsonValue | undefined;
};
export type DataCacheInput = {
  slug: string;
  displayName: string;
  description?: string;
  keyType: DataCacheKeyType;
  valueSchema?: JsonObject;
  fetcherConfig?: FetcherConfig;
  defaultTtlDays?: number;
};
export type DataCacheEntryUpsertInput = z.infer<typeof dataCacheEntryUpsertSchema>;
export type DataCacheBulkImportInput = z.infer<typeof dataCacheBulkImportSchema>;
export type DataCacheLookupInput = z.infer<typeof dataCacheLookupSchema>;
export type DataCacheEntriesQuery = z.infer<typeof dataCacheEntriesQuerySchema>;
