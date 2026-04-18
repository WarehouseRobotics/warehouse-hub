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

  it("accepts CLI aliases for relative and date list filters", () => {
    expect(parseCliListFilters(["--last", "1w"])).toEqual({
      similar: undefined,
      limit: undefined,
      since: "1w",
      before: undefined,
      after: undefined,
    });

    expect(parseCliListFilters(["--until", "2026-04-01"])).toEqual({
      similar: undefined,
      limit: undefined,
      since: undefined,
      before: "2026-04-01",
      after: undefined,
    });

    expect(parseCliListFilters(["--from", "2026-03-01"])).toEqual({
      similar: undefined,
      limit: undefined,
      since: undefined,
      before: undefined,
      after: "2026-03-01",
    });
  });

  it("parses mixed canonical and alias CLI flags together", () => {
    expect(parseCliListFilters(["--similar", "toner invoice", "--last", "1w", "--from", "2026-03-01"])).toEqual({
      similar: "toner invoice",
      limit: undefined,
      since: "1w",
      before: undefined,
      after: "2026-03-01",
    });
  });

  it("rejects invalid list filter inputs", () => {
    expect(() => parseListFilters({ limit: "0" })).toThrow(/positive integer/);
    expect(() => parseListFilters({ before: "04-01-2026" })).toThrow(/YYYY-MM-DD/);
    expect(() => parseListFilters({ since: "later" })).toThrow(/relative duration/);
    expect(() => parseCliListFilters(["--since"])).toThrow(/Missing value/);
    expect(() => parseCliListFilters(["--last"])).toThrow(/Missing value/);
    expect(() => parseCliListFilters(["--since", "1w", "--last", "2w"])).toThrow(/Duplicate list option/);
    expect(() => parseCliListFilters(["--before", "2026-04-01", "--until", "2026-05-01"])).toThrow(
      /Duplicate list option/,
    );
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
