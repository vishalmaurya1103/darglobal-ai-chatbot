/**
 * A small, purpose-built markdown parser for model answers.
 *
 * It recognises the constructs free models actually emit - headings, bullet and
 * numbered lists, tables, bold, italic and inline code - and nothing else. That is a security property, not a shortcut: the output is a
 * plain data structure, so model text can never become raw HTML, and a markdown
 * link keeps its label but loses its target, so the model cannot send a reader
 * to a URL of its own choosing.
 *
 * It is also written for streaming. The text is re-parsed on every token, so
 * each rule tolerates a half-arrived construct (an unclosed `**`, a table with
 * only its header row) instead of flashing raw syntax at the reader.
 */

export interface Inline {
  type: "text" | "bold" | "italic" | "code";
  value: string;
}

export interface ListItem {
  text: string;
  /** 0 for top-level items, 1 for items indented beneath one. */
  depth: 0 | 1;
  /** The number the model wrote, for ordered items; absent for bullets. */
  ordinal?: number;
}

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: ListItem[] }
  | { type: "table"; header: string[]; rows: string[][] };

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*•]|(\d+)[.)])\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|?\s*$/;
const CITATION_GROUP = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
/** A citation plus the space before it, so "SAR 900,000 [1]." reads "SAR 900,000.". */
const CITATION_MARKER = /[^\S\n]*\[\d+(?:\s*,\s*\d+)*\]/g;
/** A citation cut off mid-stream ("[", "[1", "[1,"); hidden until the rest arrives. */
const PARTIAL_CITATION = /[^\S\n]*\[[\d,\s]*$/;

const toCells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

/** The `| --- | :-: |` row that separates a table's header from its body. */
const isDivider = (cells: string[]) => cells.every((cell) => /^:?-+:?$/.test(cell));

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || RULE.test(line)) continue;

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: "heading", text: heading[1] });
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      const entry: ListItem = {
        text: item[3],
        depth: item[1].length >= 2 ? 1 : 0,
        ...(item[2] ? { ordinal: Number(item[2]) } : {}),
      };
      // Models often leave a blank line between items; that is still one list.
      const previous = blocks.at(-1);
      const continuesList = previous?.type === "list" && lines.slice(0, index).findLast((l) => l.trim())?.match(LIST_ITEM);
      if (previous?.type === "list" && continuesList) previous.items.push(entry);
      else blocks.push({ type: "list", items: [entry] });
      continue;
    }

    if (TABLE_ROW.test(line) && line.includes("|", line.indexOf("|") + 1)) {
      const rows: string[][] = [];
      while (index < lines.length && TABLE_ROW.test(lines[index]) && lines[index].trim()) {
        const cells = toCells(lines[index]);
        if (!isDivider(cells)) rows.push(cells);
        index += 1;
      }
      index -= 1;
      const [header = [], ...body] = rows;
      blocks.push({ type: "table", header, rows: body });
      continue;
    }

    blocks.push({ type: "paragraph", text: line.trim() });
  }

  return blocks;
}

// Order matters: bold before italic, and a still-open `**` (mid-stream) last.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]*\)|\*[^*\s](?:[^*]*[^*\s])?\*|\*\*[^*]+$)/g;

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];

  for (const part of text.split(INLINE)) {
    if (!part) continue;

    if (part.startsWith("**")) {
      nodes.push({ type: "bold", value: part.replace(/^\*\*|\*\*$/g, "") });
    } else if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      nodes.push({ type: "code", value: part.slice(1, -1) });
    } else if (/^\[[^\]]+\]\([^)]*\)$/.test(part)) {
      // Keep the label, drop the target: the model does not get to choose where links go.
      nodes.push({ type: "text", value: part.slice(1, part.indexOf("](")) });
    } else if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      nodes.push({ type: "italic", value: part.slice(1, -1) });
    } else {
      nodes.push({ type: "text", value: part });
    }
  }

  return nodes;
}

/**
 * Removes the [n] markers from an answer for display.
 *
 * The model still writes them - they are how the UI knows which retrieved
 * sources the answer actually used - but the source cards under the answer
 * already show that, so repeating the numbers in the prose is only noise.
 */
export function stripCitations(text: string): string {
  return text.replace(CITATION_MARKER, "").replace(PARTIAL_CITATION, "");
}

/**
 * The answer as plain text, for copying into places that do not render
 * markdown (chat apps, email, notes): no `**`, no backticks, no [n] markers,
 * bullets as "•", and tables as one " | "-separated line per row.
 */
export function toPlainText(text: string): string {
  const inline = (line: string) =>
    parseInline(line)
      .map((node) => node.value)
      .join("");

  return parseBlocks(stripCitations(text))
    .map((block) => {
      switch (block.type) {
        case "list":
          return block.items
            .map((item) => `${item.depth ? "    " : ""}${item.ordinal === undefined ? "•" : `${item.ordinal}.`} ${inline(item.text)}`)
            .join("\n");
        case "table":
          return [block.header, ...block.rows].map((row) => row.map(inline).join(" | ")).join("\n");
        default:
          return inline(block.text);
      }
    })
    .join("\n\n");
}

/** Every source number the answer cites, including grouped forms such as [1, 3]. */
export function citedNumbers(text: string): Set<number> {
  const numbers = new Set<number>();
  for (const match of text.matchAll(CITATION_GROUP)) {
    for (const number of match[1].split(",")) numbers.add(Number(number));
  }
  return numbers;
}
