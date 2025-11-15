import { describe, expect, it } from "vitest";
import { ItemMatcher } from "../src/services/itemMatcher.js";

describe("ItemMatcher", () => {
  it("matches close names", async () => {
    const matcher = new ItemMatcher({ preloadItems: ["ARC Alloy", "ARC Powercell", "Mechanical Components"] });
    const matches = await matcher.match("arc powrcell");
    expect(matches[0]?.match).toBe("ARC Powercell");
  });

  it("handles multiple comma separated inputs", async () => {
    const matcher = new ItemMatcher({ preloadItems: ["ARC Alloy", "Mechanical Components"] });
    const matches = await matcher.match("alloy, mechanical components");
    expect(matches).toHaveLength(2);
    expect(matches[0]?.match).toBe("ARC Alloy");
  });
});
