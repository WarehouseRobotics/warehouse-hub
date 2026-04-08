import { initializeDatabase } from "../db/connection.js";
import { getCompanyCard, upsertCompanyCard } from "../services/company-card.js";
import type { CompanyCardInput } from "../schemas/company-card.js";

const defaultCompanyCard: CompanyCardInput = {
  legalName: "Warehouse Robotics S.L.",
  displayName: "Warehouse Robotics",
  taxId: "B02672152",
  vatId: "ESB02672152",
  email: "sales@wrobo.io",
  phone: "+34 64 579 37 64",
  website: "https://wrobo.io",
  address: {
    street1: "Selva de Mar, 9",
    street2: "",
    city: "Barcelona",
    postalCode: "08005",
    countryCode: "ES",
  },
  invoiceDefaults: {
    currency: "EUR",
    paymentTermsDays: 30,
    vatMode: "standard",
  },
  bankDetails: {
    ibanMasked: "ES16 0182 0209 7702 0163 5383",
    bic: "BBVAESMMXXX",
  },
};

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function setupDefaultCompanyCard(seed: CompanyCardInput = defaultCompanyCard) {
  const { appliedMigrations } = initializeDatabase();
  const before = getCompanyCard();
  const companyCard = upsertCompanyCard(seed);

  return {
    ok: true,
    action: before ? "updated" : "created",
    appliedMigrations,
    companyCard,
  };
}

async function main(): Promise<void> {
  printJson(setupDefaultCompanyCard());
}

main().catch((error) => {
  console.error("Failed to setup default company card:", error);
  process.exitCode = 1;
});
