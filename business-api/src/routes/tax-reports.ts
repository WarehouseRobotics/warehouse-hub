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
  createTaxReportPaymentLink,
  getSpainTaxPosition,
  getTaxReport,
  listTaxCarryforwards,
  listTaxReportPaymentLinks,
  listTaxReports,
  softDeleteTaxReport,
  suggestTaxReportPaymentLinks,
  updateTaxReportPaymentLink,
  uploadTaxReportPaymentReceipt,
} from "../services/tax-reports.js";
import {
  taxReportPaymentLinkCreateInputSchema,
  taxReportPaymentLinkPatchSchema,
  taxReportPaymentReceiptUploadSchema,
  taxReportCreateRequestSchema,
  taxReportIngestSchema,
} from "@warehouse-hub/business-schemas";

export const taxReportsRouter = Router();
export const taxCarryforwardsRouter = Router();
export const taxReportPaymentLinksRouter = Router();
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

function parseRequiredInteger(value: unknown, label: string): number {
  const parsed = parseOptionalInteger(value, label);
  if (parsed === undefined) {
    throw new AppError(`${label} is required`, {
      statusCode: 400,
      code: "validation_error",
    });
  }

  return parsed;
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

taxReportsRouter.post("/:id/payment-links/suggest", requireScope("write"), (request, response) => {
  const result = suggestTaxReportPaymentLinks(getRouteParam(request.params.id));
  response.locals.audit = {
    action: "tax_report_payment_link.suggest",
    objectType: "tax_report",
    objectId: result.taxReportId,
    metadata: {
      matchCount: result.matches.length,
    },
  };
  response.json(result);
});

taxReportsRouter.get("/positions/spain", requireScope("read"), (request, response, next) => {
  try {
    if (typeof request.query.companyCardId !== "string") {
      throw new AppError("companyCardId is required", {
        statusCode: 400,
        code: "validation_error",
      });
    }

    response.json(
      getSpainTaxPosition({
        companyCardId: request.query.companyCardId,
        fiscalYear: parseRequiredInteger(request.query.fiscalYear, "fiscalYear"),
      }),
    );
  } catch (error) {
    next(error);
  }
});

taxReportsRouter.post(
  "/:id/payment-receipts",
  requireScope("write"),
  upload.single("file"),
  (request, response, next) => {
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

      const input = taxReportPaymentReceiptUploadSchema.parse({
        kind: request.body.kind,
        source: request.body.source,
        link: parseMultipartJson(request.body.link, "link"),
      });
      const result = uploadTaxReportPaymentReceipt(
        getRouteParam(request.params.id),
        request.file,
        input,
      );
      response.locals.audit = {
        action: "tax_report_payment_receipt.upload",
        objectType: "tax_report_payment_link",
        objectId: result.paymentLink.taxReportPaymentLinkId,
        metadata: {
          documentId: result.document.documentId,
          taxReportId: result.taxReport.taxReportId,
        },
      };
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

taxReportsRouter.get("/:id", requireScope("read"), (request, response) => {
  const include =
    typeof request.query.include === "string"
      ? request.query.include.split(",").map((value) => value.trim())
      : [];
  response.json(
    getTaxReport(getRouteParam(request.params.id), {
      includePaymentEvidence: include.includes("paymentEvidence"),
    }),
  );
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

taxReportPaymentLinksRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listTaxReportPaymentLinks({
      taxReportId:
        typeof request.query.taxReportId === "string"
          ? request.query.taxReportId
          : undefined,
      status:
        typeof request.query.status === "string"
          ? request.query.status
          : undefined,
    }),
  );
});

taxReportPaymentLinksRouter.post(
  "/",
  requireScope("write"),
  validateBody(taxReportPaymentLinkCreateInputSchema),
  (request, response) => {
    const paymentLink = createTaxReportPaymentLink(request.body);
    response.locals.audit = {
      action: "tax_report_payment_link.create",
      objectType: "tax_report_payment_link",
      objectId: paymentLink.taxReportPaymentLinkId,
      metadata: {
        taxReportId: paymentLink.taxReportId,
        status: paymentLink.status,
      },
    };
    response.status(201).json(paymentLink);
  },
);

taxReportPaymentLinksRouter.patch(
  "/:id",
  requireScope("write"),
  validateBody(taxReportPaymentLinkPatchSchema),
  (request, response) => {
    const paymentLink = updateTaxReportPaymentLink(
      getRouteParam(request.params.id),
      request.body,
    );
    response.locals.audit = {
      action: "tax_report_payment_link.update",
      objectType: "tax_report_payment_link",
      objectId: paymentLink.taxReportPaymentLinkId,
      metadata: {
        taxReportId: paymentLink.taxReportId,
        status: paymentLink.status,
      },
    };
    response.json(paymentLink);
  },
);
