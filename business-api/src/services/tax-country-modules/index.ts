import { AppError } from "../../lib/errors.js";
import { spainTaxCountryModule } from "./spain.js";
import type {
  TaxCountryDetectionInput,
  TaxCountryModule,
} from "./types.js";

const taxCountryModules: TaxCountryModule[] = [spainTaxCountryModule];

export function listTaxCountryModules() {
  return taxCountryModules;
}

export function selectTaxCountryModule(input: TaxCountryDetectionInput) {
  const explicitCountry = input.countryCode?.trim().toUpperCase();
  if (explicitCountry) {
    const module = taxCountryModules.find(
      (candidate) => candidate.countryCode === explicitCountry,
    );
    if (!module) {
      throw new AppError(`Unsupported tax report country: ${explicitCountry}`, {
        statusCode: 422,
        code: "tax_country_not_supported",
        details: { countryCode: explicitCountry },
      });
    }

    return module;
  }

  const detected = taxCountryModules
    .map((module) => ({ module, result: module.detect(input) }))
    .find(({ result }) => result.matched);

  if (!detected) {
    throw new AppError("Could not detect tax report country", {
      statusCode: 422,
      code: "tax_country_not_detected",
    });
  }

  return detected.module;
}

export type {
  NormalizedTaxReportDraft,
  TaxCountryDetectionInput,
  TaxCountryDetectionResult,
  TaxCountryModule,
  TaxCountryParseInput,
  TaxCountryParseResult,
} from "./types.js";
