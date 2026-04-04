import { afterEach, describe, expect, it, vi } from "vitest";

import { createSlug } from "./slug-ids.js";

describe("createSlug", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a four-part hyphenated slug", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0.999)
      .mockReturnValueOnce(0.999);

    const slug = createSlug("Acme Corp:VAT123");
    
    expect(slug.split("-")).toHaveLength(4);
  });

  it("creates random slugs every time for the same input", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

      const slug1 = createSlug("Acme Corp:VAT123");
      const slug2 = createSlug("Acme Corp:VAT123");
      expect(slug2).not.toBe(slug1);
  });
});
