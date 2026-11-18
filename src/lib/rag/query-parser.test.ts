import { describe, expect, it } from "vitest";
import type { Vocabulary } from "./properties";
import { parseQuery } from "./query-parser";

const vocabulary: Vocabulary = {
  countries: ["Saudi Arabia", "United Arab Emirates", "Oman"],
  cities: ["Riyadh", "Jeddah", "Dubai", "Muscat"],
  districts: ["Al Malqa", "Al Mahdiyah"],
  propertyTypes: ["Apartment", "Villa", "Floor", "Land"],
};

const parse = (text: string) => parseQuery(text, vocabulary);

describe("parseQuery", () => {
  it("extracts location, type, bedrooms, purpose and a price ceiling", () => {
    expect(parse("2 bedroom apartments for rent in Riyadh under 60k").filters).toEqual({
      purpose: "rent",
      city: "Riyadh",
      propertyType: "Apartment",
      bedrooms: 2,
      maxPrice: 60_000,
    });
  });

  it("parses price ranges with million suffixes", () => {
    expect(parse("villas between 1.5m and 3 million").filters).toMatchObject({
      propertyType: "Villa",
      minPrice: 1_500_000,
      maxPrice: 3_000_000,
    });
  });

  it("parses minimum prices and currency prefixes", () => {
    expect(parse("land above SAR 2,000,000").filters).toMatchObject({ propertyType: "Land", minPrice: 2_000_000 });
  });

  it("ignores small numbers that are not prices", () => {
    expect(parse("apartments with more than 3 bedrooms").filters.minPrice).toBeUndefined();
  });

  it("reads number words and studios as bedroom counts", () => {
    expect(parse("three bedroom villa").filters.bedrooms).toBe(3);
    expect(parse("studio in Dubai").filters.bedrooms).toBe(0);
  });

  it("maps country aliases and source names", () => {
    expect(parse("DarGlobal projects in the UAE").filters).toEqual({
      source: "darglobal",
      country: "United Arab Emirates",
    });
    expect(parse("listings on Wasalt in KSA").filters).toEqual({ source: "wasalt", country: "Saudi Arabia" });
  });

  it("matches districts written with or without hyphens", () => {
    expect(parse("apartment in Al-Malqa").filters.district).toBe("Al Malqa");
    expect(parse("apartment in al malqa").filters.district).toBe("Al Malqa");
  });

  it("does not treat ambiguous words as property types", () => {
    expect(parse("How many floors does Trump Tower Jeddah have?").filters.propertyType).toBeUndefined();
  });

  it("leaves purpose unset when both sale and rent are mentioned", () => {
    expect(parse("should I buy or rent in Jeddah").filters.purpose).toBeUndefined();
  });

  it.each([
    ["How many DarGlobal projects are in Oman?", "count"],
    ["What is the cheapest villa for sale?", "min_price"],
    ["Most expensive apartment in Jeddah", "max_price"],
    ["Average rent for apartments in Riyadh", "avg_price"],
    ["How many bedrooms does DG1 have?", null],
    ["What amenities does Trump Tower Jeddah offer?", null],
  ])("detects the aggregate intent of %j", (question, metric) => {
    expect(parse(question).metric).toBe(metric);
  });
});
