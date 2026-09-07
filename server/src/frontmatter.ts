/**
 * Tolerant frontmatter parser for `.claude/agents/*.md` files.
 *
 * Not using a strict YAML parser is deliberate: real agent files have unquoted
 * descriptions containing `: ` ("...a real buyer's reaction: what they understand..."),
 * which js-yaml rejects as an incomplete mapping. Claude Code reads them fine. The format
 * is flat — `key: value` per line — so that is how it is parsed: split on the first colon
 * and everything after it is the value, verbatim.
 */
export type Frontmatter = Record<string, string>;

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/;

export function parseAgentFile(raw: string): { data: Frontmatter; content: string } {
  const text = raw.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);

  if (lines[0]?.trim() !== '---') return { data: {}, content: text.trim() };

  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { data: {}, content: text.trim() };

  const data: Frontmatter = {};
  let lastKey: string | null = null;

  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const m = KEY_LINE.exec(line);
    if (m && !line.startsWith(' ') && !line.startsWith('\t')) {
      lastKey = m[1];
      data[lastKey] = unquote(m[2].trim());
    } else if (lastKey) {
      // Indented continuation of a multi-line value.
      data[lastKey] = `${data[lastKey]} ${line.trim()}`.trim();
    }
  }

  return { data, content: lines.slice(end + 1).join('\n').trim() };
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}
