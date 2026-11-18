import { describe, expect, it } from "vitest";
import { htmlToText, toNumber } from "./text";

describe("htmlToText", () => {
  it("keeps paragraph breaks and decodes entities", () => {
    expect(htmlToText("<p>Villa &amp; pool</p><p>Price:&nbsp;850000</p>")).toBe("Villa & pool\nPrice: 850000");
  });
});

describe("toNumber", () => {
  it.each([
    [850000, 850000],
    ["133", 133],
    ["1,250,000 SAR", 1250000],
    ["", null],
    [null, null],
    [0, 0],
  ])("parses %j", (input, expected) => {
    expect(toNumber(input)).toBe(expected);
  });
});
