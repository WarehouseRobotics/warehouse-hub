import { Router } from "express";

import {
  dataCacheBulkImportSchema,
  dataCacheEntriesQuerySchema,
  dataCacheEntryUpsertSchema,
  dataCacheInputSchema,
  dataCacheLookupSchema,
} from "../schemas/data-caches.js";
import { validateBody } from "../middleware/validate.js";
import {
  bulkImport,
  createCache,
  getCache,
  listCacheEntries,
  listCaches,
  lookup,
  upsertEntry,
} from "../services/data-caches.js";

export const dataCachesRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

dataCachesRouter.get("/", (_request, response) => {
  response.json(listCaches());
});

dataCachesRouter.post("/", validateBody(dataCacheInputSchema), (request, response) => {
  response.status(201).json(createCache(request.body));
});

dataCachesRouter.get("/:slug", (request, response) => {
  response.json(getCache(getRouteParam(request.params.slug)));
});

dataCachesRouter.get("/:slug/entries", (request, response) => {
  const query = dataCacheEntriesQuerySchema.parse(request.query);
  response.json(listCacheEntries(getRouteParam(request.params.slug), query));
});

dataCachesRouter.post("/:slug/lookup", validateBody(dataCacheLookupSchema), async (request, response, next) => {
  try {
    const result = await lookup(getRouteParam(request.params.slug), request.body.key, {
      strategy: request.body.strategy,
      maxStalenessWindow: request.body.maxStalenessWindow,
      fetchTimeoutMs: request.body.fetchTimeoutMs,
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

dataCachesRouter.post("/:slug/entries", validateBody(dataCacheEntryUpsertSchema), (request, response) => {
  response.status(201).json(
    upsertEntry(getRouteParam(request.params.slug), request.body.key, request.body.value, "manual", request.body.expiresAt),
  );
});

dataCachesRouter.post("/:slug/import", validateBody(dataCacheBulkImportSchema), (request, response) => {
  response.json(bulkImport(getRouteParam(request.params.slug), request.body.entries));
});
