import { describe, expect, it } from "vitest";
import { citedNumbers, parseBlocks, parseInline, stripCitations, toPlainText } from "./markdown";

describe("parseBlocks", () => {
  it("splits headings, paragraphs and lists", () => {
    expect(parseBlocks("## Villas\n\nThree matches:\n- One\n- Two")).toEqual([
      { type: "heading", text: "Villas" },
      { type: "paragraph", text: "Three matches:" },
      { type: "list", items: [{ text: "One", depth: 0 }, { text: "Two", depth: 0 }] },
    ]);
  });

  it("keeps the numbers the model wrote and nests indented items", () => {
    expect(parseBlocks("1. First\n   - Detail\n2) Second")).toEqual([
      {
        type: "list",
        items: [
          { text: "First", depth: 0, ordinal: 1 },
          { text: "Detail", depth: 1 },
          { text: "Second", depth: 0, ordinal: 2 },
        ],
      },
    ]);
  });

  it("treats items separated by blank lines as one list", () => {
    const [list, ...rest] = parseBlocks("1. First\n\n2. Second\n\n3. Third");
    expect(rest).toEqual([]);
    expect(list).toMatchObject({ type: "list", items: [{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }] });
  });

  it("starts a new list after an intervening paragraph", () => {
    expect(parseBlocks("- A\nBreak\n- B").map((block) => block.type)).toEqual(["list", "paragraph", "list"]);
  });

  it("parses a table and drops its divider row", () => {
    expect(parseBlocks("| Name | Beds |\n| --- | :-: |\n| Aida | 3 |")).toEqual([
      { type: "table", header: ["Name", "Beds"], rows: [["Aida", "3"]] },
    ]);
  });

  it("renders a table that has only streamed its header so far", () => {
    expect(parseBlocks("| Name | Beds |")).toEqual([{ type: "table", header: ["Name", "Beds"], rows: [] }]);
  });

  it("drops horizontal rules and blank lines", () => {
    expect(parseBlocks("Above\n\n---\n\nBelow").map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
  });
});

describe("parseInline", () => {
  it("recognises bold, italic and code", () => {
    expect(parseInline("**DG1** is *new* in `2026`")).toEqual([
      { type: "bold", value: "DG1" },
      { type: "text", value: " is " },
      { type: "italic", value: "new" },
      { type: "text", value: " in " },
      { type: "code", value: "2026" },
    ]);
  });

  it("keeps a link's label but never its target", () => {
    const nodes = parseInline("See [the listing](javascript:alert(1)) now");
    expect(nodes[1]).toEqual({ type: "text", value: "the listing" });
    expect(JSON.stringify(nodes)).not.toContain("javascript");
  });

  it("shows bold that is still streaming as bold, not as raw asterisks", () => {
    expect(parseInline("Price: **SAR 2,6")).toEqual([
      { type: "text", value: "Price: " },
      { type: "bold", value: "SAR 2,6" },
    ]);
  });

  it("leaves arithmetic asterisks alone", () => {
    expect(parseInline("3 * 4 * 5")).toEqual([{ type: "text", value: "3 * 4 * 5" }]);
  });
});

describe("stripCitations", () => {
  it("removes single and grouped markers along with the space before them", () => {
    expect(stripCitations("Listed at SAR 900,000 [1]. Two pools [2][3] and a gym [1, 4].")).toBe(
      "Listed at SAR 900,000. Two pools and a gym.",
    );
  });

  it("hides a marker that is still streaming in", () => {
    expect(stripCitations("Listed at SAR 900,000 [")).toBe("Listed at SAR 900,000");
    expect(stripCitations("Listed at SAR 900,000 [1,")).toBe("Listed at SAR 900,000");
  });

  it("keeps line structure, so lists and tables still parse", () => {
    expect(stripCitations("- One [1]\n- Two [2]")).toBe("- One\n- Two");
  });

  it("leaves bracketed text that is not a citation alone", () => {
    expect(stripCitations("See [the listing](https://wasalt.sa) and [note]")).toBe(
      "See [the listing](https://wasalt.sa) and [note]",
    );
  });
});

describe("toPlainText", () => {
  it("drops markdown syntax and citations so a paste reads cleanly", () => {
    const answer = [
      "Six projects are due to complete [1].",
      "",
      "- **W Residences** — expected completion September 2026 [2]",
      "- **DG1** — in `2027` [3]",
      "   - *sold out*",
      "",
      "| Project | Year |",
      "| --- | --- |",
      "| **DG1** | 2027 |",
    ].join("\n");

    expect(toPlainText(answer)).toBe(
      [
        "Six projects are due to complete.",
        "",
        "• W Residences — expected completion September 2026",
        "• DG1 — in 2027",
        "    • sold out",
        "",
        "Project | Year",
        "DG1 | 2027",
      ].join("\n"),
    );
  });

  it("keeps the numbers of an ordered list and a link's label", () => {
    expect(toPlainText("1. See [the listing](https://x.example)\n2. **Two**")).toBe("1. See the listing\n2. Two");
  });
});

describe("citedNumbers", () => {
  it("collects single and grouped citations", () => {
    expect([...citedNumbers("A [1] and B [2][4] and C [5, 6]")]).toEqual([1, 2, 4, 5, 6]);
  });
});
