import { useEffect, useRef, useState } from 'react';
import { hueFor } from './api';
import { useT } from './i18n';
import { Markdown } from './markdown';
import type { ParticipantDef, TranscriptEntry, ToolCall } from './types';

export type LiveTurn = { participantId: string; text: string; tools: ToolCall[] };

const money = (n: number) => `$${n.toFixed(3)}`;

/**
 * The mechanics of a turn, hidden behind the speaker's name.
 *
 * The transcript is questions and answers; the tools someone ran, what the turn cost and which
 * phase it was in are none of that. They are how you audit a turn when it surprises you, which is
 * not most turns — so they hang off the name, on hover or on a click that pins the panel open.
 *
 * `pinned` exists because hover cannot be read: the moment you move the mouse to the panel to
 * scroll a long tool list, a hover-only panel is already gone.
 */
function Detail({ label, open, onToggle, children }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className="who-wrap">
      <button className={`turn-who as-btn${open ? ' pinned' : ''}`}
              aria-expanded={open} onClick={onToggle}>
        {label}
      </button>
      <span className={`turn-detail${open ? ' pinned' : ''}`}>{children}</span>
    </span>
  );
}

function Turn({ entry, defs, n }: {
  entry: TranscriptEntry; defs: Map<string, ParticipantDef>; n: number | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const isChair = entry.role === 'moderator';
  const def = entry.participantId ? defs.get(entry.participantId) : undefined;
  const hue = entry.participantId ? hueFor(entry.participantId) : undefined;
  const who = isChair ? t.transcript.moderator : entry.participantId ?? '';

  const cost = entry.costUsd !== undefined && entry.costUsd > 0;
  const mk = entry.markers;
  const hasMarkers = !!mk && !!(mk.asks.length || mk.agreements.length || mk.blockers.length
    || mk.lifts?.length || mk.closes);
  const hasDetail = hasMarkers || cost || !!entry.phase || !!entry.toolCalls?.length;

  return (
    <article className={`turn${isChair ? ' chair' : ''}`}
             style={hue ? { ['--speaker' as string]: hue } : undefined}>
      <header className="turn-head">
        {n !== null && <span className="turn-n">{String(n).padStart(2, '0')}</span>}
        {hasDetail ? (
          <Detail label={who} open={open} onToggle={() => setOpen((v) => !v)}>
            {hasMarkers && (
              <span className="markers">
                {mk!.asks.map((pp, i) => (
                  <span className="mk mk-para" key={`p${i}`}>
                    <b>@{pp.to}</b> {pp.about}
                  </span>
                ))}
                {mk!.agreements.map((a, i) => <span className="mk mk-ac" key={`a${i}`}>{a}</span>)}
                {mk!.blockers.map((b, i) => <span className="mk mk-bl" key={`b${i}`}>{b}</span>)}
                {(mk!.lifts ?? []).map((l, i) => (
                  <span className="mk mk-lv" key={`l${i}`}>{l || t.transcript.allOfTheirs}</span>
                ))}
                {mk!.closes && <span className="mk mk-closes">{t.transcript.closed}</span>}
              </span>
            )}
            {entry.phase && (
              <span className="dt-line">{t.transcript.phase[entry.phase]}</span>
            )}
            {cost && (
              <span className="dt-line mono">
                {money(entry.costUsd!)}
                {entry.tokens && ` · ${(entry.tokens.in / 1000).toFixed(0)}k in`}
              </span>
            )}
            {entry.toolCalls?.length ? (
              <span className="dt-tools">
                {entry.toolCalls.map((tc, i) => <span className="tool" key={i}>{tc.summary}</span>)}
              </span>
            ) : null}
          </Detail>
        ) : (
          <span className="turn-who">{who}</span>
        )}
        {def && !isChair && <span className="turn-role">{def.label}</span>}
      </header>

      {entry.text && <div className="speech"><Markdown text={entry.text} /></div>}
      {entry.error && (
        // `cut` is a flag, not a prefix match: the wording depends on the project locale.
        <p className={entry.cut ? 'turn-cut' : 'turn-error'}>{entry.error}</p>
      )}

    </article>
  );
}

export function Transcript({ entries, defs, live, title }: {
  entries: TranscriptEntry[];
  defs: Map<string, ParticipantDef>;
  live: LiveTurn[];
  title: string;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  /** If you scrolled up to read, the transcript does not yank you back on its own. */
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  /** Which live turn has its panel pinned open. One at a time. */
  const [pinned, setPinned] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const seen = useRef(entries.length);

  /**
   * A live turn's *arrival* moves the column; its text does not, because the text is inside a
   * panel behind the name. So this depends on how many are speaking, not on how much they have
   * said — which also stops the scroll effect firing on every delta.
   */
  const liveCount = live.length;

  const toBottom = (behavior: ScrollBehavior = 'smooth') => {
    endRef.current?.scrollIntoView({ behavior, block: 'end' });
    stuck.current = true;
    setAway(false);
    setUnread(0);
    seen.current = entries.length;
  };

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    // 80px of slack: "at the bottom" cannot demand pixel precision.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stuck.current = atBottom;
    setAway(!atBottom);
    if (atBottom) { setUnread(0); seen.current = entries.length; }
  };

  // Open at the bottom, without animating.
  useEffect(() => { toBottom('auto'); /* on mount only */ }, []);   // eslint-disable-line

  useEffect(() => {
    if (stuck.current) {
      toBottom('smooth');
    } else if (entries.length > seen.current) {
      setUnread(entries.length - seen.current);
    }
  }, [entries.length, liveCount]);

  if (!entries.length && !live.length) {
    return (
      <div className="transcript" ref={boxRef}>
        <div className="empty">
          <h2>{t.transcript.emptyTitle(title)}</h2>
          <p>{t.transcript.emptyBody}</p>
        </div>
      </div>
    );
  }

  let turnNo = 0;

  return (
    <div className="transcript" ref={boxRef} onScroll={onScroll}>
      <div className="thread">
        {entries.map((e) => (
          <Turn key={e.i} entry={e} defs={defs}
                n={e.role === 'agent' ? ++turnNo : null} />
        ))}

        {/* A turn in progress is a name and a pulse. What it is writing while it writes is
            detail too — arguably the most of it — so it goes in the same panel behind the name.
            Watching tokens arrive is not reading a conversation, and half a sentence that is
            about to be rewritten is worse than no sentence. */}
        {live.map((l) => (
          <article key={`live-${l.participantId}`} className="turn live"
                   style={{ ['--speaker' as string]: hueFor(l.participantId) }}>
            <header className="turn-head">
              <span className="turn-n">{String(++turnNo).padStart(2, '0')}</span>
              <Detail label={l.participantId} open={pinned === l.participantId}
                      onToggle={() => setPinned(pinned === l.participantId
                        ? null : l.participantId)}>
                {l.tools.length ? (
                  <span className="dt-tools">
                    {l.tools.map((tc, i) => <span className="tool" key={i}>{tc.summary}</span>)}
                  </span>
                ) : null}
                {l.text
                  ? <span className="dt-stream">{l.text}</span>
                  : <span className="dt-line">{t.transcript.thinking}</span>}
              </Detail>
              <span className="turn-role">{defs.get(l.participantId)?.label}</span>
              <span className="turn-meta">
                {t.transcript.hasFloor}
                <span className="pulse" aria-hidden="true" />
              </span>
            </header>
          </article>
        ))}

        <div ref={endRef} />
      </div>

      {away && (
        <div className="to-bottom-wrap">
          <button className="to-bottom" onClick={() => toBottom()}>
            {unread ? t.transcript.newTurns(unread) : t.transcript.toEnd} ↓
          </button>
        </div>
      )}
    </div>
  );
}
