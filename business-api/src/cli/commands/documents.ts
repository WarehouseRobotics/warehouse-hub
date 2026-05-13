import fs from "node:fs";

import { documentIngestSchema, documentUploadSchema } from "@warehouse-hub/business-schemas";

import { formatDocumentIngestCliOutput } from "../../lib/cli-document-ingest-format.js";
import { parseCliListFilters } from "../../lib/list-filters.js";
import { getDocumentDownload, getDocumentMeta, listDocuments, uploadDocument } from "../../services/documents.js";
import { ingestDocument } from "../../services/document-ingestion.js";
import {
  parseJsonArg,
  readCliUploadFile,
  resolveDocumentCliInputPath,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "documents",
    help: {
      description: "Upload, ingest, search, inspect, and download business documents.",
      commands: [
        "upload <file-path> <json-meta>",
        "ingest <file-path> <json-meta>",
        "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
        "get <id-or-slug>",
        "download <id-or-slug> <output-path>",
      ],
      examples: [
        'documents upload ./samples/docs/reference.pdf \'{"kind":"other","source":"manual_upload"}\'',
        'documents ingest ./test-data/expenses/invoice_do_2026_03.pdf \'{"kind":"expense_invoice","source":"email_forward"}\'',
        'documents ingest invoice_do_2026_03.pdf \'{"kind":"expense_invoice","source":"email_forward"}\'',
        "documents list --after 2026-04-01 --before 2026-05-01",
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "upload") {
        const filePath = rest[0];
        const meta = documentUploadSchema.parse(parseJsonArg(rest[1], "document metadata"));
        if (!filePath) {
          throw new Error("Missing file path");
        }

        const created = uploadDocument(
          readCliUploadFile(filePath, "application/octet-stream", filePath.split("/").pop() ?? "upload.bin"),
          meta,
        );
        context.printJson(created);
        return;
      }

      if (subcommand === "ingest") {
        const requestedFilePath = rest[0];
        const meta = documentIngestSchema.parse(parseJsonArg(rest[1], "document ingestion metadata"));
        if (!requestedFilePath) {
          throw new Error("Missing file path");
        }

        const filePath = resolveDocumentCliInputPath(requestedFilePath);
        const created = await ingestDocument(
          readCliUploadFile(filePath, filePath.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png"),
          meta,
        );
        const formatted = formatDocumentIngestCliOutput(created);
        if (formatted) {
          process.stdout.write(`${formatted}\n`);
        } else {
          context.printJson(created);
        }
        return;
      }

      if (subcommand === "get") {
        context.printJson(getDocumentMeta(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(await listDocuments(parseCliListFilters(rest)));
        return;
      }

      if (subcommand === "download") {
        const document = getDocumentDownload(rest[0]);
        const outputPath = rest[1];
        if (!outputPath) {
          throw new Error("Missing output path");
        }

        fs.copyFileSync(document.path, outputPath);
        context.printJson({ ok: true, outputPath, filename: document.filename });
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
