import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Tesseract from "tesseract.js";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

type OcrResult = {
  text: string;
  engine: string;
};

function isPdf(file: Express.Multer.File): boolean {
  return file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
}

function isImage(file: Express.Multer.File): boolean {
  return file.mimetype.startsWith("image/");
}

function extractStubText(file: Express.Multer.File): OcrResult {
  const text = file.buffer.toString("utf8").trim();
  if (text.startsWith("OCR_ERROR:")) {
    throw new AppError(text.slice("OCR_ERROR:".length).trim() || "OCR extraction failed", {
      statusCode: 422,
      code: "ocr_failed",
    });
  }

  return {
    text,
    engine: "stub-ocr",
  };
}

async function extractImageText(buffer: Buffer): Promise<string> {
  const result = await Tesseract.recognize(buffer, config.OCR_LANG);
  return result.data.text.trim();
}

async function extractPdfText(file: Express.Multer.File): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(config.uploadDir, "ocr-"));
  const pdfPath = path.join(tempDir, "source.pdf");
  const prefix = path.join(tempDir, "page");

  try {
    fs.writeFileSync(pdfPath, file.buffer);
    execFileSync("pdftoppm", ["-png", pdfPath, prefix], { stdio: "pipe" });

    const pageFiles = fs
      .readdirSync(tempDir)
      .filter((entry) => entry.startsWith("page-") && entry.endsWith(".png"))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    if (pageFiles.length === 0) {
      throw new AppError("No rasterized PDF pages were produced for OCR", {
        statusCode: 422,
        code: "ocr_failed",
      });
    }

    const pageTexts: string[] = [];
    for (const pageFile of pageFiles) {
      const pageBuffer = fs.readFileSync(path.join(tempDir, pageFile));
      pageTexts.push(await extractImageText(pageBuffer));
    }

    return pageTexts.join("\n\n").trim();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("PDF OCR requires pdftoppm inside the business-api container", {
      statusCode: 500,
      code: "pdf_ocr_unavailable",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function extractDocumentText(file: Express.Multer.File): Promise<OcrResult> {
  if (config.OCR_STUB_MODE) {
    return extractStubText(file);
  }

  if (isPdf(file)) {
    return {
      text: await extractPdfText(file),
      engine: `tesseract.js:${config.OCR_LANG}+pdftoppm`,
    };
  }

  if (isImage(file)) {
    return {
      text: await extractImageText(file.buffer),
      engine: `tesseract.js:${config.OCR_LANG}`,
    };
  }

  throw new AppError(`Unsupported OCR mime type: ${file.mimetype || "unknown"}`, {
    statusCode: 400,
    code: "unsupported_document_type",
  });
}
