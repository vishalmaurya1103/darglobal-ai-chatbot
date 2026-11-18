import { describe, expect, it } from "vitest";
import { parseBedrooms, parseCity } from "./darglobal";

describe("parseCity", () => {
  it.each([
    ["Dubai, UAE", "Dubai"],
    ["Al Marjan Island, RAK, UAE", "Al Marjan Island"],
    ["149 Old Park Lane, London", "London"],
    ["AIDA | Oman", "AIDA"],
    [null, null],
  ])("reads %j as %j", (location, city) => {
    expect(parseCity(location)).toBe(city);
  });
});

describe("parseBedrooms", () => {
  it.each([
    ["1 to 3 Bedrooms", [1, 3]],
    ["Studio to 3 Bedrooms", [0, 3]],
    ["4 & 5 Bedroom", [4, 5]],
    ["Sold Out", [null, null]],
    [null, [null, null]],
  ])("reads %j", (label, expected) => {
    expect(parseBedrooms(label)).toEqual(expected);
  });
});
