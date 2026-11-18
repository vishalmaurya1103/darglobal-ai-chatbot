import { Fragment, type ReactNode } from "react";

interface RichTextProps {
  text: string;
  sourceCount: number;
}

/**
 * Renders the small markdown subset the system prompt allows (paragraphs,
 * "- " bullets, **bold**) and turns [n] citations into links to the source cards.
 *
 * Deliberately not a general markdown renderer: parsing only the constructs the
 * prompt asks for means model output can never introduce raw HTML or a link
 * target of its own choosing.
 */
export function RichText({ text, sourceCount }: RichTextProps) {
  const renderInline = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, index) => {
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) return <strong key={index} className="font-semibold text-ink-900">{bold[1]}</strong>;

      const citation = part.match(/^\[(\d+)\]$/);
      if (citation && Number(citation[1]) <= sourceCount) {
        return (
          <a
            key={index}
            href={`#source-${citation[1]}`}
            aria-label={`Jump to source ${citation[1]}`}
            className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-gold-100 px-1 align-[1px] text-[10px] font-bold text-gold-800 ring-1 ring-inset ring-gold-300/70 transition-colors hover:bg-gold-200"
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
      <ul key={`list-${blocks.length}`} className="space-y-1.5 pl-1">
        {listItems.map((item, index) => (
          <li key={index} className="flex gap-2.5">
            <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-gold-500" />
            <span>{renderInline(item)}</span>
          </li>
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
