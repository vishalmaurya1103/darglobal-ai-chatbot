import { Fragment, type ReactNode } from "react";

interface RichTextProps {
  text: string;
  sourceCount: number;
}

/**
 * Renders the small markdown subset the system prompt allows (paragraphs,
 * "- " bullets, **bold**) and turns [n] citations into links to the source cards.
 */
export function RichText({ text, sourceCount }: RichTextProps) {
  const renderInline = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, index) => {
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) return <strong key={index}>{bold[1]}</strong>;

      const citation = part.match(/^\[(\d+)\]$/);
      if (citation && Number(citation[1]) <= sourceCount) {
        return (
          <a
            key={index}
            href={`#source-${citation[1]}`}
            className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-amber-100 px-1 align-text-top text-[10px] font-semibold text-amber-900 hover:bg-amber-200"
          >
            {citation[1]}
          </a>
        );
      }
      return <Fragment key={index}>{part}</Fragment>;
    });

  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {listItems.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      continue;
    }
    flushList();
    if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line)}</p>);
  }
  flushList();

  return <div className="space-y-3">{blocks}</div>;
}
