import fs from "node:fs";
import path from "node:path";

import {
  bulkImport as bulkImportDataCacheEntries,
  createCache,
  getCache,
  listCaches,
  lookup as lookupDataCache,
  upsertEntry as upsertDataCacheEntry,
} from "../../services/data-caches.js";
import {
  dataCacheBulkImportSchema,
  dataCacheEntryUpsertSchema,
  dataCacheInputSchema,
  dataCacheLookupSchema,
  type JsonObject,
} from "../../schemas/data-caches.js";
import { parseFlagArgs, parseJsonArg, throwUnknownCommand, type CliCommandDefinition } from "../core.js";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsvEntries(filePath: string, keyColumn: string, valueColumn?: string): Array<{ key: string; value: JsonObject }> {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV file must contain a header row and at least one data row");
  }

  const headers = parseCsvLine(lines[0]);
  const keyIndex = headers.indexOf(keyColumn);
  if (keyIndex === -1) {
    throw new Error(`CSV key column not found: ${keyColumn}`);
  }

  const valueIndex = valueColumn ? headers.indexOf(valueColumn) : -1;
  if (valueColumn && valueIndex === -1) {
    throw new Error(`CSV value column not found: ${valueColumn}`);
  }

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const key = cells[keyIndex];
    if (!key) {
      throw new Error("CSV row is missing a key value");
    }

    if (valueColumn && valueIndex >= 0) {
      return {
        key,
        value: {
          value: cells[valueIndex] ?? "",
        },
      };
    }

    const value = headers.reduce<Record<string, string>>((accumulator, header, index) => {
      if (index === keyIndex) {
        return accumulator;
      }

      accumulator[header] = cells[index] ?? "";
      return accumulator;
    }, {});

    return { key, value };
  });
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "data-cache",
    aliases: ["data-caches"],
    help: {
      description: "Manage persistent reference-data caches and return generic agent instructions for missing values.",
      commands: [
        "list",
        "create <slug> --name <display-name> --key-type <type> [--description <text>] [--value-schema <json>] [--fetcher-config <json>] [--ttl-days <days>]",
        "get <slug>",
        "lookup <slug> <key> --strategy <strategy> [--max-staleness-days <days>] [--fetch-timeout-ms <ms>]",
        "upsert <slug> <key> --value <json> [--expires-at <iso-datetime>]",
        "import <slug> --file <path> [--key-col <name>] [--value-col <name>]",
      ],
      examples: [
        "data-cache list",
        'data-cache create currency-rates-eur-usd --name "Currency Rates EUR/USD" --key-type date --value-schema \'{"type":"object","properties":{"rate":{"type":"string"}},"required":["rate"]}\' --fetcher-config \'{"prompt":"Look up EUR/USD rate for {{ key }}. JSON only."}\' --ttl-days 1',
        "data-cache lookup currency-rates-eur-usd 2026-04-26 --strategy staleness_window --max-staleness-days 7",
        'data-cache upsert currency-rates-eur-usd 2026-04-26 --value \'{"rate":"1.0823"}\'',
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "list") {
        context.printJson(listCaches());
        return;
      }

      if (subcommand === "create") {
        const slug = rest[0];
        if (!slug) {
          throw new Error("Missing cache slug");
        }

        const { options } = parseFlagArgs(rest.slice(1));
        const input = dataCacheInputSchema.parse({
          slug,
          displayName: options.name,
          description: options.description,
          keyType: options["key-type"],
          valueSchema: options["value-schema"] ? parseJsonArg(options["value-schema"], "data-cache value schema") : undefined,
          fetcherConfig: options["fetcher-config"] ? parseJsonArg(options["fetcher-config"], "data-cache fetcher config") : undefined,
          defaultTtlDays: options["ttl-days"] ? Number(options["ttl-days"]) : undefined,
        });
        context.printJson(createCache(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getCache(rest[0]));
        return;
      }

      if (subcommand === "lookup") {
        const slug = rest[0];
        const key = rest[1];
        if (!slug || !key) {
          throw new Error("Usage: data-cache lookup <slug> <key> --strategy <strategy>");
        }

        const { options } = parseFlagArgs(rest.slice(2));
        const input = dataCacheLookupSchema.parse({
          key,
          strategy: options.strategy,
          maxStalenessWindow: options["max-staleness-days"] ? Number(options["max-staleness-days"]) : undefined,
          fetchTimeoutMs: options["fetch-timeout-ms"] ? Number(options["fetch-timeout-ms"]) : undefined,
        });
        context.printJson(await lookupDataCache(slug, input.key, input));
        return;
      }

      if (subcommand === "upsert") {
        const slug = rest[0];
        const key = rest[1];
        if (!slug || !key) {
          throw new Error("Usage: data-cache upsert <slug> <key> --value <json>");
        }

        const { options } = parseFlagArgs(rest.slice(2));
        const input = dataCacheEntryUpsertSchema.parse({
          key,
          value: parseJsonArg(options.value, "data-cache entry value"),
          expiresAt: options["expires-at"],
        });
        context.printJson(upsertDataCacheEntry(slug, input.key, input.value, "manual", input.expiresAt));
        return;
      }

      if (subcommand === "import") {
        const slug = rest[0];
        if (!slug) {
          throw new Error("Usage: data-cache import <slug> --file <path>");
        }

        const { options } = parseFlagArgs(rest.slice(1));
        const filePath = options.file;
        if (!filePath) {
          throw new Error("Missing --file option");
        }

        const ext = path.extname(filePath).toLowerCase();
        let entries: Array<{ key: string; value: JsonObject; expiresAt?: string }>;

        if (ext === ".json") {
          const parsed = parseJsonArg(fs.readFileSync(filePath, "utf8"), "data-cache import file");
          entries = Array.isArray(parsed)
            ? dataCacheBulkImportSchema.parse({ entries: parsed }).entries
            : dataCacheBulkImportSchema.parse(parsed).entries;
        } else if (ext === ".csv") {
          if (!options["key-col"]) {
            throw new Error("CSV imports require --key-col");
          }

          entries = parseCsvEntries(filePath, options["key-col"], options["value-col"]);
        } else {
          throw new Error(`Unsupported import file type: ${ext || "unknown"}`);
        }

        context.printJson(bulkImportDataCacheEntries(slug, entries));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
