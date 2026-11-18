import { describe, expect, it } from "vitest";
import { buildRecord } from "@/test/fixtures";
import { buildChunks } from "./chunker";

const longText = (words: number, prefix = "word") =>
  Array.from({ length: words }, (_, index) => `${prefix}${index}.`).join(" ");

describe("buildChunks", () => {
  it("keeps a small listing as a single chunk with its facts", () => {
    const chunks = buildChunks(buildRecord());

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Wasalt listing for sale");
    expect(chunks[0].content).toContain("Price: SAR 850,000");
    expect(chunks[0].content).toContain("Location: Al-Malqa, Riyadh, Saudi Arabia");
    expect(chunks[0].content).toContain("Apartment for sale in Al-Malqa");
  });

  it("splits large records into a fact sheet plus section chunks with breadcrumbs", () => {
    const record = buildRecord({
      source: "darglobal",
      kind: "project",
      title: "DG1",
      city: "Dubai",
      district: null,
      country: "United Arab Emirates",
      price: null,
      sections: [
        { heading: "Amenities", text: longText(150, "amenity") },
        { heading: "Location", text: longText(150, "place") },
      ],
    });
    const chunks = buildChunks(record);

    expect(chunks[0]).toMatchObject({ heading: "Overview" });
    expect(chunks[0].content).toContain("DarGlobal development project");
    expect(chunks.slice(1).map((chunk) => chunk.heading)).toEqual(["Amenities", "Location"]);
    expect(chunks[1].content.startsWith("DarGlobal › DG1 (Dubai, United Arab Emirates) › Amenities\n")).toBe(true);
  });

  it("splits long sections into overlapping windows within the word limit", () => {
    const record = buildRecord({ sections: [{ heading: "Description", text: longText(600) }] });
    const sectionChunks = buildChunks(record).filter((chunk) => chunk.heading === "Description");

    expect(sectionChunks.length).toBeGreaterThan(2);
    for (const chunk of sectionChunks) {
      const bodyWords = chunk.content.split("\n").slice(1).join(" ").split(/\s+/).length;
      expect(bodyWords).toBeLessThanOrEqual(220);
    }
    const [first, second] = sectionChunks.map((chunk) => chunk.content.split(/\s+/));
    expect(second).toContain(first[first.length - 1]);
  });
});
