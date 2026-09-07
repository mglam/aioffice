import type { Markers } from './types.js';

/**
 * The declared vocabulary of the roundtable.
 *
 * Every turn may close with a fenced block that the app parses. This is what turns a chat
 * into a discussion that converges: it lets the turn follow whoever was put on the spot,
 * keeps settled things from being re-litigated, and lets the app know when it is over.
 *
 *   ```roundtable
 *   FOR @grid-relays: does the selectivity hold if the feeder is back-fed?
 *   AGREE: cut 1 is pon-tree.ts
 *   BLOCKER: without Huawei coverage I can't sign off
 *   CLOSE
 *   ```
 *
 * The keywords exist in both languages and the parser accepts EITHER, whatever the
 * project's locale. Two reasons: transcripts written before the English protocol still
 * parse, and an agent whose persona is in one language sometimes answers in the other.
 */
type Keywords = {
  fence: string;
  ask: RegExp;
  agree: RegExp;
  blocker: RegExp;
  lift: RegExp;
  close: RegExp;
};

const EN: Keywords = {
  fence: 'roundtable',
  ask: /^FOR\s+@?([\w-]+)\s*:?\s*(.*)$/i,
  agree: /^AGREE(?:MENT)?S?\s*:\s*(.+)$/i,
  blocker: /^BLOCKERS?\s*:\s*(.+)$/i,
  lift: /^LIFTS?\s*:?\s*(.*)$/i,
  close: /^CLOSE[SD]?\b/i,
};

const ES: Keywords = {
  fence: 'mesa',
  ask: /^PARA\s+@?([\w-]+)\s*:?\s*(.*)$/i,
  agree: /^ACUERDOS?\s*:\s*(.+)$/i,
  blocker: /^BLOQUEOS?\s*:\s*(.+)$/i,
  lift: /^LEVANTO\s*:?\s*(.*)$/i,
  close: /^CIERRO\b/i,
};

const ALL = [EN, ES];


export const EMPTY_MARKERS: Markers =
  { asks: [], agreements: [], blockers: [], lifts: [], closes: false };

/** Matches the block in either language, so old and new transcripts both parse. */
const BLOCK = new RegExp('```(?:' + ALL.map((k) => k.fence).join('|') + ')\\s*\\n([\\s\\S]*?)```', 'i');

/**
 * Splits the marker block off the speech. The speech is what gets shown; the block is
 * what gets used.
 */
export function extractMarkers(raw: string, knownIds: string[]):
  { speech: string; markers: Markers } {
  const m = BLOCK.exec(raw);
  if (!m) return { speech: raw.trim(), markers: { ...EMPTY_MARKERS, asks: [] } };

  const speech = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim();
  const markers: Markers = { asks: [], agreements: [], blockers: [], lifts: [], closes: false };

  for (const line of m[1].split('\n')) {
    const t = line.trim();
    if (!t) continue;

    for (const kw of ALL) {
      const ask = kw.ask.exec(t);
      if (ask) {
        // Only someone actually seated counts: a made-up @handle must not send the
        // turn off to nobody.
        const to = knownIds.find((id) => id.toLowerCase() === ask[1].toLowerCase());
        if (to) markers.asks.push({ to, about: ask[2].trim() });
        break;
      }

      const ag = kw.agree.exec(t);
      if (ag) { markers.agreements.push(ag[1].trim()); break; }

      const bl = kw.blocker.exec(t);
      if (bl) { markers.blockers.push(bl[1].trim()); break; }

      const lv = kw.lift.exec(t);
      if (lv) { markers.lifts.push(lv[1].trim()); break; }

      if (kw.close.test(t)) { markers.closes = true; break; }
    }
  }

  return { speech, markers };
}
