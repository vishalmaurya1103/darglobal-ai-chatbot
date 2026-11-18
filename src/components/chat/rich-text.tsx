import { Fragment, type ReactNode } from "react";
import { motion } from "motion/react";
import { fadeIn } from "@/components/ui/motion";
import { parseBlocks, parseInline, stripCitations, type Block } from "@/lib/markdown";

function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((node, index) => {
    switch (node.type) {
      case "bold":
        return <strong key={index} className="font-semibold text-ink-950">{node.value}</strong>;
      case "italic":
        return <em key={index}>{node.value}</em>;
      case "code":
        return <code key={index} className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-800">{node.value}</code>;
      default:
        return <Fragment key={index}>{node.value}</Fragment>;
    }
  });
}

function renderBlock(block: Block): ReactNode {
  switch (block.type) {
    case "heading":
      return <h3 className="pt-1 text-[15px] font-semibold tracking-tight text-ink-950">{renderInline(block.text)}</h3>;

    case "list":
      return (
        <ul className="space-y-1.5">
          {block.items.map((item, index) => (
            <li key={index} className={`flex gap-2.5 ${item.depth ? "pl-6" : ""}`}>
              {item.ordinal === undefined ? (
                <span aria-hidden className="mt-[0.7em] size-1 shrink-0 rounded-full bg-ink-400" />
              ) : (
                <span className="min-w-4 shrink-0 text-right font-medium tabular-nums text-ink-400">{item.ordinal}.</span>
              )}
              <span className="min-w-0">{renderInline(item.text)}</span>
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div className="scrollbar-subtle overflow-x-auto rounded-xl border border-ink-200">
          <table className="w-full border-collapse text-left text-[13.5px]">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index} scope="col" className="whitespace-nowrap px-3.5 py-2 font-medium">{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-ink-100">
                  {row.map((cell, index) => (
                    <td key={index} className="px-3.5 py-2 align-top">{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return <p>{renderInline(block.text)}</p>;
  }
}

/**
 * Renders a model answer. Parsing lives in `lib/markdown`, which emits plain
 * data, so nothing the model writes can reach the DOM as HTML or as a link
 * target. Citation markers are dropped: the source cards below the answer
 * already show what was used. Each block fades in once as it first appears, which is what makes a
 * streamed answer read as writing rather than as text popping into place.
 */
export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {parseBlocks(stripCitations(text)).map((block, index) => (
        <motion.div key={index} variants={fadeIn} initial="hidden" animate="visible">
          {renderBlock(block)}
        </motion.div>
      ))}
    </div>
  );
}
