import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./utils";

describe("safeExternalUrl", () => {
  it("keeps ordinary web links", () => {
    expect(safeExternalUrl("https://darglobal.co.uk/projects/dg1")).toBe("https://darglobal.co.uk/projects/dg1");
    expect(safeExternalUrl("http://wasalt.sa/property/sale/1")).toBe("http://wasalt.sa/property/sale/1");
  });

  it("drops schemes that would execute or exfiltrate", () => {
    for (const url of [
      "javascript:alert(document.domain)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(safeExternalUrl(url)).toBeUndefined();
    }
  });

  it("drops anything that is not a URL at all", () => {
    expect(safeExternalUrl("")).toBeUndefined();
    expect(safeExternalUrl("/projects/dg1")).toBeUndefined();
    expect(safeExternalUrl("not a url")).toBeUndefined();
  });
});
