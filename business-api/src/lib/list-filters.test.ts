import { describe, expect, it } from "vitest";

import {
  extractDateOnly,
  matchesResolvedDateFilters,
  parseCliListFilters,
  parseListFilters,
  resolveListFilters,
} from "./list-filters.js";

describe("list filters", () => {
  it("parses CLI flags into shared list filters", () => {
    expect(
      parseCliListFilters(["--similar", "toner invoice", "--limit", "7", "--since", "1w", "--before", "2026-04-01"]),
    ).toEqual({
      similar: "toner invoice",
      limit: 7,
      since: "1w",
      before: "2026-04-01",
      after: undefined,
    });
  });

  it("rejects invalid list filter inputs", () => {
    expect(() => parseListFilters({ limit: "0" })).toThrow(/positive integer/);
    expect(() => parseListFilters({ before: "04-01-2026" })).toThrow(/YYYY-MM-DD/);
    expect(() => parseListFilters({ since: "later" })).toThrow(/relative duration/);
    expect(() => parseCliListFilters(["--since"])).toThrow(/Missing value/);
  });

  it("resolves relative since dates against a base time", () => {
    const resolved = resolveListFilters({ since: "1w" }, new Date("2026-04-08T10:00:00.000Z"));
    expect(resolved.sinceDate).toBe("2026-04-01");
  });

  it("matches date ranges for ISO dates and timestamps", () => {
    const filters = resolveListFilters(
      {
        since: "1w",
        before: "2026-04-10",
        after: "2026-03-31",
      },
      new Date("2026-04-08T10:00:00.000Z"),
    );

    expect(extractDateOnly("2026-04-08T12:00:00.000Z")).toBe("2026-04-08");
    expect(matchesResolvedDateFilters("2026-04-08", filters)).toBe(true);
    expect(matchesResolvedDateFilters("2026-04-10", filters)).toBe(false);
    expect(matchesResolvedDateFilters("2026-03-31", filters)).toBe(false);
    expect(matchesResolvedDateFilters(undefined, filters)).toBe(false);
  });
});
