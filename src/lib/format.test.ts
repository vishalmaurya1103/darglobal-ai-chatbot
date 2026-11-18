import { describe, expect, it } from "vitest";
import { formatBedrooms, formatLocation, formatPrice } from "./format";

describe("formatPrice", () => {
  it("formats sale prices with currency", () => {
    expect(formatPrice({ price: 850000, currency: "SAR", pricePeriod: null })).toBe("SAR 850,000");
  });

  it("appends the rent period", () => {
    expect(formatPrice({ price: 35000, currency: "SAR", pricePeriod: "year" })).toBe("SAR 35,000 / year");
  });

  it("returns null when there is no price", () => {
    expect(formatPrice({ price: null, currency: null, pricePeriod: null })).toBeNull();
  });
});

describe("formatBedrooms", () => {
  it.each([
    [3, 3, "3 bed"],
    [0, 0, "Studio"],
    [1, 3, "1 bed – 3 bed"],
    [null, null, null],
  ])("formats %s–%s", (bedroomsMin, bedroomsMax, expected) => {
    expect(formatBedrooms({ bedroomsMin, bedroomsMax })).toBe(expected);
  });
});

describe("formatLocation", () => {
  it("joins the known parts", () => {
    expect(formatLocation({ district: "Al-Malqa", city: "Riyadh", country: "Saudi Arabia" })).toBe(
      "Al-Malqa, Riyadh, Saudi Arabia",
    );
    expect(formatLocation({ district: null, city: "Dubai", country: null })).toBe("Dubai");
  });
});
