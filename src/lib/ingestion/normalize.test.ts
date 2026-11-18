import { describe, expect, it } from "vitest";
import { buildRecord } from "@/test/fixtures";
import { normalizeRecord } from "./normalize";

describe("normalizeRecord", () => {
  it("singularises property types and title-cases cities", () => {
    const record = normalizeRecord(buildRecord({ propertyType: "Hotel Rooms", city: "AIDA" }));
    expect(record.propertyType).toBe("Hotel Room");
    expect(record.city).toBe("Aida");
  });

  it("spells place names consistently with or without hyphens", () => {
    expect(normalizeRecord(buildRecord({ district: "Al-Arid" })).district).toBe("Al Arid");
    expect(normalizeRecord(buildRecord({ district: "al arid" })).district).toBe("Al Arid");
  });

  it("drops empty sections and blank districts", () => {
    const record = normalizeRecord(
      buildRecord({ district: "  ", sections: [{ heading: "Empty", text: "  " }, { heading: "Kept", text: "Text" }] }),
    );
    expect(record.district).toBeNull();
    expect(record.sections.map((section) => section.heading)).toEqual(["Kept"]);
  });
});
