import { describe, expect, it } from "vitest";
import { buildFilterClause } from "./properties";

describe("buildFilterClause", () => {
  it("returns TRUE when there are no filters", () => {
    const params: unknown[] = [];
    expect(buildFilterClause({}, params)).toBe("TRUE");
    expect(params).toEqual([]);
  });

  it("binds every value as a parameter, continuing existing numbering", () => {
    const params: unknown[] = ["[0.1,0.2]"];
    const clause = buildFilterClause({ city: "Riyadh", bedrooms: 2, maxPrice: 900_000 }, params);

    expect(clause).toBe("p.city = $2 AND p.bedrooms_min <= $3 AND p.bedrooms_max >= $3 AND p.price <= $4");
    expect(params).toEqual(["[0.1,0.2]", "Riyadh", 2, 900_000]);
  });

  it("never interpolates user input into the SQL text", () => {
    const params: unknown[] = [];
    const clause = buildFilterClause({ city: "x'; DROP TABLE properties; --" }, params);
    expect(clause).toBe("p.city = $1");
  });
});
