import { Router } from "express";

import {
  dataCacheBulkImportSchema,
  dataCacheEntriesQuerySchema,
  dataCacheEntryUpsertSchema,
  dataCacheFetchSubmissionSchema,
  dataCacheInputSchema,
  dataCacheLookupSchema,
} from "../schemas/data-caches.js";
import { requireScope } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  bulkImport,
  createCache,
  getCache,
  listCacheEntries,
  listCaches,
  lookup,
  submitFetchedEntry,
  upsertEntry,
} from "../services/data-caches.js";

export const dataCachesRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

dataCachesRouter.get("/", requireScope("read"), (_request, response) => {
  response.json(listCaches());
});

dataCachesRouter.post("/", requireScope("write"), validateBody(dataCacheInputSchema), (request, response) => {
  const cache = createCache(request.body);
  response.locals.audit = {
    action: "data_cache.create",
    objectType: "data_cache",
    objectId: cache.id,
  };
  response.status(201).json(cache);
});

dataCachesRouter.get("/:slug", requireScope("read"), (request, response) => {
  response.json(getCache(getRouteParam(request.params.slug)));
});

dataCachesRouter.get("/:slug/entries", requireScope("read"), (request, response) => {
  const query = dataCacheEntriesQuerySchema.parse(request.query);
  response.json(listCacheEntries(getRouteParam(request.params.slug), query));
});

dataCachesRouter.post("/:slug/lookup", requireScope("write"), validateBody(dataCacheLookupSchema), async (request, response, next) => {
  try {
    const slug = getRouteParam(request.params.slug);
    const cache = getCache(slug);
    const result = await lookup(slug, request.body.key, {
      strategy: request.body.strategy,
      maxStalenessWindow: request.body.maxStalenessWindow,
      fetchTimeoutMs: request.body.fetchTimeoutMs,
    });
    response.locals.audit = {
      action: "data_cache.lookup",
      objectType: "data_cache",
      objectId: cache.id,
      metadata: {
        key: request.body.key,
        source: result?.source ?? null,
      },
    };
    response.json(result);
  } catch (error) {
    next(error);
  }
});

dataCachesRouter.post("/:slug/entries", requireScope("write"), validateBody(dataCacheEntryUpsertSchema), (request, response) => {
  const entry = upsertEntry(
    getRouteParam(request.params.slug),
    request.body.key,
    request.body.value,
    "manual",
    request.body.expiresAt,
  );
  response.locals.audit = {
    action: "data_cache_entry.upsert",
    objectType: "data_cache_entry",
    objectId: entry.id,
    metadata: {
      cacheSlug: getRouteParam(request.params.slug),
      key: entry.key,
    },
  };
  response.status(201).json(entry);
});

dataCachesRouter.post(
  "/:slug/fetch-submissions",
  requireScope("write"),
  validateBody(dataCacheFetchSubmissionSchema),
  (request, response) => {
    const entry = submitFetchedEntry(
      getRouteParam(request.params.slug),
      request.body.key,
      request.body.value,
      request.body.expiresAt,
    );
    response.locals.audit = {
      action: "data_cache_fetch_submission.upsert",
      objectType: "data_cache_entry",
      objectId: entry.id,
      metadata: {
        cacheSlug: getRouteParam(request.params.slug),
        key: entry.key,
        source: "fetcher",
      },
    };
    response.status(201).json(entry);
  },
);

dataCachesRouter.post("/:slug/import", requireScope("write"), validateBody(dataCacheBulkImportSchema), (request, response) => {
  const slug = getRouteParam(request.params.slug);
  const cache = getCache(slug);
  const result = bulkImport(slug, request.body.entries);
  response.locals.audit = {
    action: "data_cache.import",
    objectType: "data_cache",
    objectId: cache.id,
    metadata: {
      inserted: result.inserted,
      updated: result.updated,
    },
  };
  response.json(result);
});
