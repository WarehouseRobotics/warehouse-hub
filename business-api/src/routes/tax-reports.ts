import multer from "multer";
import { Router } from "express";

import { AppError } from "../lib/errors.js";
import { parseListFilters } from "../lib/list-filters.js";
import { parseMultipartJson } from "../lib/multipart-json.js";
import { requireScope } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { ingestTaxReport } from "../services/tax-report-ingestion.js";
import {
  createTaxReport,
  getTaxReport,
  listTaxCarryforwards,
  listTaxReports,
  softDeleteTaxReport,
} from "../services/tax-reports.js";
import {
  taxReportCreateRequestSchema,
  taxReportIngestSchema,
} from "@warehouse-hub/business-schemas";

export const taxReportsRouter = Router();
export const taxCarryforwardsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function parseOptionalInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new AppError(`${label} must be a positive integer`, {
      statusCode: 400,
      code: "validation_error",
    });
  }

  return Number.parseInt(value, 10);
}

taxReportsRouter.get("/", requireScope("read"), async (request, response, next) => {
  try {
    const listFilters = parseListFilters({
      similar:
        typeof request.query.similar === "string"
          ? request.query.similar
          : undefined,
      limit:
        typeof request.query.limit === "string"
          ? request.query.limit
          : undefined,
    });

    response.json(
      await listTaxReports({
        ...listFilters,
        countryCode:
          typeof request.query.countryCode === "string"
            ? request.query.countryCode
            : undefined,
        taxKind:
          typeof request.query.taxKind === "string"
            ? request.query.taxKind
            : undefined,
        formCode:
          typeof request.query.formCode === "string"
            ? request.query.formCode
            : undefined,
        fiscalYear: parseOptionalInteger(
          request.query.fiscalYear,
          "fiscalYear",
        ),
        periodStart:
          typeof request.query.periodStart === "string"
            ? request.query.periodStart
            : undefined,
        periodEnd:
          typeof request.query.periodEnd === "string"
            ? request.query.periodEnd
            : undefined,
        status:
          typeof request.query.status === "string"
            ? request.query.status
            : undefined,
        paymentStatus:
          typeof request.query.paymentStatus === "string"
            ? request.query.paymentStatus
            : undefined,
        query:
          typeof request.query.query === "string"
            ? request.query.query
            : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

taxReportsRouter.post(
  "/",
  requireScope("write"),
  validateBody(taxReportCreateRequestSchema),
  (request, response) => {
    const result = createTaxReport(request.body);
    response.locals.audit = {
      action: result.duplicate ? "tax_report.deduplicate" : "tax_report.create",
      objectType: "tax_report",
      objectId: result.taxReport.taxReportId,
      metadata: {
        duplicate: result.duplicate,
      },
    };
    response.status(201).json(result);
  },
);

taxReportsRouter.post(
  "/ingest",
  requireScope("write"),
  upload.single("file"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({
          error: {
            code: "validation_error",
            message: "Missing uploaded file",
          },
        });
        return;
      }

      const meta = taxReportIngestSchema.parse({
        kind: request.body.kind,
        companyCardId: request.body.companyCardId,
        countryCode: request.body.countryCode,
        taxKind: request.body.taxKind,
        formCode: request.body.formCode,
        fiscalYear: request.body.fiscalYear,
        periodLabel: request.body.periodLabel,
        source: request.body.source,
        overrides: parseMultipartJson(request.body.overrides, "overrides"),
      });

      const result = await ingestTaxReport(request.file, meta);
      response.locals.audit = {
        action: "tax_report.ingest",
        objectType: "tax_report",
        objectId: result.taxReport.taxReportId,
        metadata: {
          duplicate: result.duplicate,
          documentId: result.document.documentId,
        },
      };
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

taxReportsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getTaxReport(getRouteParam(request.params.id)));
});

taxReportsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const report = getTaxReport(id);
  softDeleteTaxReport(id);
  response.locals.audit = {
    action: "tax_report.delete",
    objectType: "tax_report",
    objectId: report.taxReport.taxReportId,
  };
  response.status(204).send();
});

taxCarryforwardsRouter.get("/", requireScope("read"), (request, response, next) => {
  try {
    response.json(
      listTaxCarryforwards({
        countryCode:
          typeof request.query.countryCode === "string"
            ? request.query.countryCode
            : undefined,
        taxKind:
          typeof request.query.taxKind === "string"
            ? request.query.taxKind
            : undefined,
        kind:
          typeof request.query.kind === "string"
            ? request.query.kind
            : undefined,
        status:
          typeof request.query.status === "string"
            ? request.query.status
            : undefined,
        originFiscalYear: parseOptionalInteger(
          request.query.originFiscalYear,
          "originFiscalYear",
        ),
        includeSuperseded: request.query.includeSuperseded === "true",
      }),
    );
  } catch (error) {
    next(error);
  }
});
