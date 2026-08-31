import { describe, expect, it } from "vitest";

import { COUNTRIES } from "@/data/countries";

describe("COUNTRIES", () => {
  it("contains exactly germany and soviet", () => {
    expect(COUNTRIES.map((country) => country.id)).toEqual(["germany", "soviet"]);
  });

  it("uses unique map colors", () => {
    const colors = COUNTRIES.map((country) => country.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
