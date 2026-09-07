import type { ReactNode } from 'react';

/**
 * Minimal markdown: what an agent actually writes, and no more. Not a general parser — none is
 * needed here, and a complete one would pull in a dependency for very little.
 *
 * What it covers, and each is here because a real deliverable uses it: headings **at their own
 * level** (a 5,000-word document whose six heading levels all render as bold text has no
 * structure you can see), ordered and unordered lists, blockquotes, rules, `code`, **bold** and
 * *italic*. HTML comments are dropped: every generated document opens with a provenance comment
 * that is for the file, not for the reader.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;

  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${n++}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(<a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  // A fenced block is passed through verbatim; nothing inside it is markdown.
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let fence: string[] | null = null;

  const flushPara = () => {
    if (!para.length) return;
    const key = `p${blocks.length}`;
    blocks.push(<p key={key}>{inline(para.join(' '), key)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const key = `l${blocks.length}`;
    const items = list.items.map((li, i) => <li key={i}>{inline(li, `${key}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const key = `q${blocks.length}`;
    blocks.push(<blockquote key={key}>{inline(quote.join(' '), key)}</blockquote>);
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (fence !== null) {
      if (/^\s*```/.test(line)) {
        blocks.push(<pre key={`c${blocks.length}`}><code>{fence.join('\n')}</code></pre>);
        fence = null;
      } else fence.push(raw);
      continue;
    }
    if (/^\s*```/.test(line)) { flushAll(); fence = []; continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const key = `h${blocks.length}`;
      // Capped at h6 and offset by one: the document's own `#` is not the page's title.
      const Tag = `h${Math.min(heading[1].length + 1, 6)}` as 'h2';
      blocks.push(<Tag key={key}>{inline(heading[2], key)}</Tag>);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll();
      blocks.push(<hr key={`r${blocks.length}`} />);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara(); flushQuote();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) { flushPara(); flushList(); quote.push(quoted[1]); continue; }

    if (!line.trim()) { flushAll(); continue; }
    flushList(); flushQuote();
    para.push(line);
  }
  if (fence) blocks.push(<pre key={`c${blocks.length}`}><code>{fence.join('\n')}</code></pre>);
  flushAll();

  return <>{blocks}</>;
}
