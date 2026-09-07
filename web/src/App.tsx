import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, hueFor, primeHues } from './api';
import { Transcript, type LiveTurn } from './Transcript';
import { NewConversation } from './NewConversation';
import { DocViewer } from './DocViewer';
import { Projects } from './Projects';
import { ProjectSetup } from './ProjectSetup';
import { PeopleDialog } from './People';
import { SeatPicker } from './SeatPicker';
import { LOCALES, LocaleProvider, useLocale, useT } from './i18n';
import type {
  ArtifactType, ArtifactTypeInfo, Conversation, ConversationParticipant, ConversationSummary,
  Depth, ParticipantDef, Phase, Project, StreamEvent,
} from './types';

const LAST_PROJECT = 'aioffice.projectId';

/**
 * How much work a seat puts in, on one scale you click up. A checkbox and two selects asked three
 * questions to settle one, so this is that one.
 *
 * **Chairing is not on it.** It was, as the top rung, and putting a different *kind* of thing at
 * the end of a quantity made the control hard to read — you had to pass through "runs the
 * discussion" to get from thorough back to off. It is a star beside the name now: one thing that
 * is either true or not, and true of exactly one seat.
 *
 * The model rides along rather than being asked separately: `sonnet` is the point of a low-effort
 * seat (fast and cheap for a position you do not need reasoned at length), and everything above
 * it is left to whatever the persona's own file declares.
 */
const LEVELS = ['off', 'low', 'medium', 'high'] as const;
type Level = (typeof LEVELS)[number];
const NEXT: Record<Level, Level> = { off: 'low', low: 'medium', medium: 'high', high: 'off' };
/**
 * The chair's cycle skips `off`. A chair that cannot speak leaves the conversation running
 * leaderless while the interface still shows one — so the way out is to move the star, not to
 * take the person out from under it.
 */
const NEXT_CHAIR: Record<Level, Level> = {
  off: 'low', low: 'medium', medium: 'high', high: 'low',
};
const DEPTH_OF: Record<Level, Depth> = {
  off: 'full', low: 'quick', medium: 'medium', high: 'full',
};

/** Which dialog is open. `setup.project === null` means creating a project rather than editing. */
type Modal =
  | { kind: 'projects' }
  | { kind: 'setup'; project: Project | null }
  /** The pool of people. Global, so it hangs off the masthead rather than off a project. */
  | { kind: 'people' }
  | { kind: 'newConversation' }
  /** Seating someone in the conversation already open. */
  | { kind: 'seat' }
  | { kind: 'doc'; artifactId: string }
  | null;

/**
 * One section of the conversation's settings. Collapsible because there are three of them and
 * the column is not tall enough for all three expanded on a short screen — and because which one
 * you are working in changes with what you are doing.
 *
 * The bar **is** the toggle, and nothing else lives on it: a second control on a row whose whole
 * job is to collapse is a target you will eventually hit meaning the other one. Actions go inside
 * the section, under what they act on.
 */
function Section({ title, open, onToggle, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="eyebrow">
        <button className="sec-toggle" aria-expanded={open} onClick={onToggle}>
          <span className={`sec-caret${open ? ' open' : ''}`} aria-hidden="true">›</span>
          {title}
        </button>
      </div>
      {open && children}
    </>
  );
}

export default function App() {
  return <LocaleProvider><Office /></LocaleProvider>;
}

function Office() {
  const t = useT();
  const [uiLocale, setUiLocale] = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(
    () => localStorage.getItem(LAST_PROJECT));
  /**
   * Exactly one modal at a time, by construction.
   *
   * These were six independent booleans, and any two of them open at once produced a trap: two
   * `<dialog showModal()>` elements both live in the top layer, the second makes the first inert,
   * and if the top one is a dead end you cannot reach the one underneath to fix it. That happened.
   * Opening one now replaces whatever was open.
   */
  const [modal, setModal] = useState<Modal>(null);
  const close = () => setModal(null);
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [convId, setConvId] = useState<string | null>(null);

  const [conv, setConv] = useState<Conversation | null>(null);
  const [defs, setDefs] = useState<ParticipantDef[]>([]);
  /** Pick-a-conversation-to-delete mode, from the bin in the rail's heading. */
  const [purging, setPurging] = useState(false);
  /** Which sections of the right column are expanded. All three, until you close one. */
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(['context', 'agents', 'deliverables']));
  const toggle = (k: string) => setOpen((prev) => {
    const n = new Set(prev);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const [live, setLive] = useState<LiveTurn[]>([]);
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');

  const [auto, setAuto] = useState<{ cycle: number; cycles: number } | null>(null);
  const [session, setSession] = useState<
    { round: number; rounds: number; phase: Phase } | { writing: string } | null>(null);
  const [openRoundtable, setOpenRoundtable] = useState<{ blockers: number; notClosed: string[] } | null>(null);
  /**
   * How it runs. One converging engine and one parallel pass, and what you type decides the rest:
   *
   * - `answer` — the box **is** the question. It is written onto the conversation and from then
   *   on it is in front of everyone on every turn, which is what makes them converge on the same
   *   target rather than on a topic.
   * - `deliver` — the same engine with no question: they converge on producing what the
   *   conversation was opened to produce. Untick every deliverable and it converges and writes
   *   nothing, which is how you explore without spending on documents.
   * - `sweep` — one **parallel** pass. Everyone answers the same snapshot, so the first speaker
   *   cannot anchor the rest. The box is the question here too.
   *
   * Two went in the rethink. "One round, in turns" was one cycle of the converging engine with
   * the phase brief removed. "Let them run" was that engine minus the convergence check and the
   * documents — both of which are now just: no question, no deliverables ticked.
   *
   * A single turn is not missing either: a round with one seat ticked *is* one turn, which is why
   * the per-participant "give the floor" chips could go.
   */
  const [mode, setMode] = useState<'answer' | 'deliver' | 'sweep'>('deliver');
  /** Cap for auto and resolve. Not a control any more: the bar is a mode, a play and a stop. */
  const rounds = 4;

  const [editBrief, setEditBrief] = useState<string | null>(null);
  const [artTypes, setArtTypes] = useState<ArtifactTypeInfo[]>([]);

  const current = useRef<string | null>(null);
  const defMap = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs]);

  /**
   * The project's conversations. Selects the newest when what was open is gone — deleted, or a
   * project switch — and returns the list, because the caller usually needs it before state
   * settles.
   */
  const refreshConvs = useCallback(async () => {
    if (!projectId) { setConvs([]); setConvId(null); return []; }
    const r = await api.conversations(projectId);
    setConvs(r.conversations);
    setConvId((c) => (r.conversations.some((x) => x.id === c) ? c : r.conversations[0]?.id ?? null));
    return r.conversations;
  }, [projectId]);

  const loadConv = useCallback(async (pid: string, cid: string) => {
    current.current = cid;
    const r = await api.conversation(pid, cid);
    if (current.current !== cid) return;   // you switched conversations meanwhile
    primeHues(r.conversation.participants.map((p) => p.id));
    setConv(r.conversation);
    setDefs(r.participantDefs); setRemoteBusy(r.busy);
    // Reaching the deliverables is the default: it needs nothing typed in first, so Play is
    // live the moment two people are seated.
    setMode('deliver');
    setAuto((a) => (r.autoRunning ? a ?? { cycle: 1, cycles: 1 } : null));
    if (!r.autoRunning) setSession(null);
    const alive = new Set(r.participantDefs.map((d) => d.id));
    setSelected(new Set(r.conversation.participants
      .filter((p) => p.enabled && alive.has(p.id)).map((p) => p.id)));
  }, []);

  useEffect(() => { void api.artifactTypes().then((r) => setArtTypes(r.types)); }, []);

  useEffect(() => {
    void api.projects().then((r) => {
      setProjects(r.projects);
      // If the saved one is gone (deleted, or another machine), fall back to the first.
      setProjectId((id) => (r.projects.some((p) => p.id === id) ? id : r.projects[0]?.id ?? null));
      // Nothing registered yet: go straight to setting one up, not to an empty list.
      if (!r.projects.length) setModal({ kind: 'setup', project: null });
    });
  }, []);

  useEffect(() => {
    if (projectId) localStorage.setItem(LAST_PROJECT, projectId);
    else localStorage.removeItem(LAST_PROJECT);
    // Switching project must not leave the previous one's conversation open.
    setConvId(null); setPurging(false);
    void refreshConvs();
  }, [projectId, refreshConvs]);

  // Everything volatile is cleared when the conversation changes: otherwise an in-flight
  // turn from another one keeps painting over this one.
  useEffect(() => {
    if (!projectId || !convId) { setConv(null); setLive([]); return; }
    setLive([]); setSession(null); setAuto(null);
    setOpenRoundtable(null); setStopping(false); setRemoteBusy(false);
    setError('');
    void loadConv(projectId, convId);
  }, [projectId, convId, loadConv]);

  useEffect(() => {
    if (!projectId || !convId) return;
    const es = new EventSource(api.streamUrl(projectId, convId));
    let stale = false;

    // EventSource reconnects on its own, but what is left on screen may be stale. The busy
    // flag is the one that matters: left true from before a drop, every action stays blocked
    // with nothing to unblock it.
    es.onopen = () => {
      void api.conversation(projectId, convId)
        .then((r) => { if (!stale) setRemoteBusy(r.busy); })
        .catch(() => {});
    };

    es.onmessage = (ev) => {
      if (stale) return;
      const e = JSON.parse(ev.data) as StreamEvent;

      if (e.type === 'turn_start') {
        setLive((p) => p.some((l) => l.participantId === e.participantId)
          ? p : [...p, { participantId: e.participantId, text: '', tools: [] }]);
      } else if (e.type === 'delta') {
        setLive((p) => p.map((l) => l.participantId === e.participantId
          ? { ...l, text: l.text + e.text } : l));
      } else if (e.type === 'tool_use') {
        setLive((p) => p.map((l) => l.participantId === e.participantId
          ? { ...l, tools: [...l.tools, e.tool] } : l));
      } else if (e.type === 'entry') {
        setConv((c) => c && ({ ...c, transcript: [...c.transcript, e.entry] }));
        if (e.entry.participantId) {
          setLive((p) => p.filter((l) => l.participantId !== e.entry.participantId));
        }
      } else if (e.type === 'turn_error') {
        setLive((p) => p.filter((l) => l.participantId !== e.participantId));
      } else if (e.type === 'busy') {
        setRemoteBusy(e.busy);
        if (!e.busy) { setStopping(false); setLive([]); }
      } else if (e.type === 'auto_stopping') {
        setStopping(true);
      } else if (e.type === 'auto_progress') {
        setAuto({ cycle: e.cycle, cycles: e.cycles });
      } else if (e.type === 'session_progress') {
        setAuto({ cycle: e.round, cycles: e.rounds });
        setSession({ round: e.round, rounds: e.rounds, phase: e.phase });
      } else if (e.type === 'session_open') {
        setOpenRoundtable({ blockers: e.blockers, notClosed: e.notClosed });
      } else if (e.type === 'session_writing') {
        setSession({ writing: e.artifact });
      } else if (e.type === 'session_artifact_failed') {
        setError(t.chair.writeFailed(e.artifact, e.message));
      }

      if (e.type === 'auto_done') {
        setAuto(null); setSession(null); setLive([]);
        setStopping(false); setRemoteBusy(false);
        void loadConv(projectId, convId).then(() => {
          if (!stale) void refreshConvs();
        });
      }
    };

    return () => { stale = true; es.close(); };
  }, [projectId, convId, loadConv, refreshConvs]);

  /**
   * The list is re-read BEFORE the conversation: if you just deleted the one you were
   * looking at, `convId` still points to it (setState is not immediate) and reloading it
   * would give "Unknown conversation".
   */
  const after = useCallback(async () => {
    const list = await refreshConvs();
    if (projectId && convId && list.some((c) => c.id === convId)) {
      await loadConv(projectId, convId);
    }
  }, [projectId, convId, refreshConvs, loadConv]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(''); setBusy(true);
    try { await fn(); await after(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setLive([]); }
    finally { setBusy(false); setStopping(false); }
  };

  const ids = () => [projectId!, convId!] as const;

  /** The text is handed in, not read from `note`: `play` has already sent and cleared it. */
  const openRound = (roundMode: 'parallel' | 'sequential', text?: string) => run(async () => {
    await api.round(...ids(), [...selected], text || undefined, roundMode);
  });

  const startSession = async (force = false, text?: string) => {
    setError(''); setOpenRoundtable(null);
    try {
      setSession({ round: 1, rounds, phase: 'open' });
      setAuto({ cycle: 1, cycles: rounds });
      await api.session(...ids(), [...selected], text || undefined, rounds, force);
    } catch (e) {
      setAuto(null); setSession(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * A seat's row, in two parts: who they are, then what they are.
   *
   * A persona's heading is written as `<Name> — <what they are>`, so the split is the first spaced
   * dash. When the app invented the name it is authoritative and the rest of the heading is the
   * description — no guessing needed. A heading with no dash (or none at all) is all name.
   */
  const nameOf = (p: ConversationParticipant): { name: string; desc: string } => {
    const d = defMap.get(p.id);
    const label = d && d.label !== p.id ? d.label : p.id;
    if (d?.person && label.startsWith(d.person)) {
      return { name: d.person, desc: label.slice(d.person.length).replace(/^\s*[—–-]\s*/, '') };
    }
    const m = /^(.+?)\s+[—–]\s+(.+)$/.exec(label);
    return m ? { name: m[1], desc: m[2] } : { name: label, desc: '' };
  };

  /** Where a seat sits on the scale. Derived, so there is nothing extra to keep in sync. */
  const levelOf = (p: ConversationParticipant): Level =>
    !p.enabled ? 'off'
      : p.depth === 'quick' ? 'low'
      : p.depth === 'medium' ? 'medium'
      : 'high';

  /** The star. One conversation, one chair — or none, which is an open conversation. */
  const setChair = (pid: string | null) => {
    setConv((c) => c && ({ ...c, orchestrator: pid ?? undefined }));
    void api.patchConversation(...ids(), { orchestrator: pid })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  /**
   * Moving a seat up or down the scale. Optimistic and without a reload: it is one click on a
   * button, and a round trip through `after()` would blank the column each time.
   */
  const setLevel = (pid: string, next: Level) => {
    if (!conv) return;
    const patch = {
      enabled: next !== 'off',
      depth: DEPTH_OF[next],
      // The whole reason a low seat exists is to be quick and cheap; above it, the persona's own
      // declaration stands.
      model: next === 'low' ? 'sonnet' : null,
    };

    setSelected((prev) => {
      const n = new Set(prev);
      next === 'off' ? n.delete(pid) : n.add(pid);
      return n;
    });
    setConv((c) => c && ({
      ...c,
      participants: c.participants.map((x) => (x.id === pid
        ? { ...x, enabled: patch.enabled, depth: patch.depth, model: patch.model ?? undefined }
        : x)),
    }));

    void api.setParticipant(...ids(), pid, patch)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  /** Whatever the mode says, with whatever is in the box as the moderator's note. */
  /**
   * What you typed always lands in the transcript, whatever the mode.
   *
   * It did not, and that was the bug: only `openRound` posted the moderator entry, while a
   * session merely passed the text along as the first-round note. It reached the agents and was
   * never recorded — so in the default mode, which is a session, you watched them answer
   * something you could not see yourself having said.
   *
   * Sent from here rather than inside each runner so it happens exactly once, and the text is
   * handed down instead of being re-read from `note`, which `setNote('')` has already emptied for
   * the next render.
   *
   * In a question mode it also becomes the **standing** question, written onto the conversation
   * so it is re-injected on every turn: a moderator note is quoted once, and by turn five nobody
   * would still have the target in front of them. Leave the box empty to carry on with whatever
   * question is already standing. `buildTurnPrompt` will not say it twice — it skips a `note`
   * that already appears as a moderator entry.
   */
  const play = () => void (async () => {
    const text = note.trim();
    setNote(''); setError('');

    if (text) {
      if (mode !== 'deliver' && text !== question) {
        await api.patchConversation(...ids(), { question: text });
      }
      // Publishes an `entry` over SSE, so it appears without a reload.
      await api.moderator(...ids(), text);
    }

    if (mode === 'sweep') return openRound('parallel', text);
    return startSession(false, text);
  })().catch((e) => setError(e instanceof Error ? e.message : String(e)));

  const stop = async () => {
    setStopping(true);
    try { await api.stop(...ids()); } catch { /* it had already finished */ }
    // If nothing was running the server emits no event: without this the UI would stay
    // stuck anyway, and "Stop" is the only thing enabled when that happens.
    try {
      const r = await api.conversation(...ids());
      setRemoteBusy(r.busy);
      if (!r.busy) { setAuto(null); setSession(null); setLive([]); }
    } catch { /* the conversation is gone */ }
    setStopping(false);
  };

  // Noting works ALWAYS, even mid-round: the message queues behind the current turn and
  // whoever speaks next reads it.
  const sayOnly = async () => {
    const text = note.trim();
    if (!text) return;
    setNote(''); setError('');
    try { await api.moderator(...ids(), text); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const activeProject = projects.find((p) => p.id === projectId);
  const question = (conv?.question ?? '').trim();
  const locked = busy || auto !== null || remoteBusy;
  const seated = conv?.participants ?? [];

  /**
   * `sweep` runs with a single seat — that is the single-turn case — and the converging modes need
   * two. A question mode needs a question from *somewhere*: what you just typed, or the one
   * already standing.
   */
  const asked = note.trim() || question;
  const canPlay = !locked && selected.size > 0
    && (mode === 'sweep' || selected.size >= 2)
    && (mode === 'deliver' || !!asked);

  const totalCost = seated.reduce((a, p) => a + p.costUsd, 0);
  const turns = conv?.transcript.filter((e) => e.role === 'agent').length ?? 0;

  return (
    <div className="app">
      <header className="masthead">
        <span className="brand">The AI Office</span>

        {/* The two are one control group, so they get their own tighter gap than the masthead's. */}
        <span className="proj-group">
        <select className="proj-switch" value={projectId ?? ''}
                aria-label={t.app.project}
                onChange={(e) => setProjectId(e.target.value || null)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {!projects.length && <option value="">{t.app.noProjects}</option>}
        </select>

        {/* Managing was an option inside the select, which is a picker — choosing a value and
            triggering an action are different things, and it needed a sentinel value to tell
            them apart. Its own button, next to the thing it manages. */}
        <button className="icon-btn" onClick={() => setModal({ kind: 'projects' })}
                title={t.app.manageProjects} aria-label={t.app.manageProjects}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 1.2v1.9M8 12.9v1.9M1.2 8h1.9M12.9 8h1.9M3.2 3.2l1.35 1.35M11.45 11.45l1.35 1.35M12.8 3.2l-1.35 1.35M4.55 11.45L3.2 12.8"
                  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        </span>

        {/* The people are global, so this sits on its own rather than under the project gear —
            what it opens is not that project's, it is everything you can seat anywhere. */}
        <button className="icon-btn" onClick={() => setModal({ kind: 'people' })}
                title={t.app.people} aria-label={t.app.people}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <circle cx="6" cy="5.4" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M1.6 14c0-2.5 2-4.1 4.4-4.1s4.4 1.6 4.4 4.1"
                  fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M11 3.2a2.4 2.4 0 0 1 0 4.4M12.2 9.9c1.4.5 2.2 1.9 2.2 4.1"
                  fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        {conv && <h1>{conv.title}</h1>}
        <span className="spacer" />
        {conv && (
          <span className="sub mono">{t.app.turnsAndCost(turns, totalCost.toFixed(2))}</span>
        )}
        <select className="lang-switch" value={uiLocale} aria-label={t.app.language}
                onChange={(e) => setUiLocale(e.target.value as typeof uiLocale)}>
          {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </header>

      <div className="columns">
        <aside className="rail-left">
          {/* One level. There used to be roundtables here, expanding to reveal their
              conversations; the group owned only "who sits", and that moved onto the
              conversation itself. */}
          {/* No gear. A conversation is configured where you are looking at it — the right
              column is its settings — so the list only opens one, adds one, or removes one.
              A manager dialog for that was a second place to read the same list. */}
          <div className="eyebrow">
            {t.nav.conversationsEyebrow}
            <button className="icon-btn icon-btn-sm" disabled={!projectId}
                    title={projectId ? t.nav.newConversation : t.nav.needsProject}
                    aria-label={t.nav.newConversation}
                    onClick={() => { setPurging(false); setModal({ kind: 'newConversation' }); }}>
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor"
                      strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            {/* Deleting is a mode rather than an × on every row: a permanent delete against each
                line reads as a warning about the whole list, and one that only appears on hover
                cannot be found on purpose. You reach for the bin, then pick. */}
            <button className={`icon-btn icon-btn-sm${purging ? ' on' : ''}`}
                    disabled={!convs.length}
                    title={purging ? t.conversations.pickCancel : t.conversations.pickToDelete}
                    aria-label={purging ? t.conversations.pickCancel : t.conversations.pickToDelete}
                    aria-pressed={purging}
                    onClick={() => setPurging((v) => !v)}>
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M3.4 5h9.2M6.4 5V3.6h3.2V5M4.6 5l.6 8h5.6l.6-8M6.8 7.2v3.6M9.2 7.2v3.6"
                      fill="none" stroke="currentColor" strokeWidth="1.3"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {purging && <p className="purge-note">{t.conversations.pickNote}</p>}

          {convs.map((c) => (
            purging ? (
              <button className="room-item purge" key={c.id}
                      title={t.conversations.deleteTitle(c.title)}
                      onClick={() => {
                        if (!confirm(t.conversations.deleteWarn(c.title, c.turns))) return;
                        setPurging(false);
                        void run(async () => {
                          await api.deleteConversation(projectId!, c.id);
                          if (c.id === convId) setConvId(null);
                        });
                      }}>
                <span className="t">{c.title}</span>
              </button>
            ) : c.id === convId ? (
              /* The open one holds its title as a field: it is the list's own label, so this is
                 where renaming belongs. Uncontrolled and keyed on the id — a controlled value
                 would fight your typing on every refresh, and the key is what makes it pick up
                 a title changed elsewhere. */
              <div className="room-item" aria-current key={c.id}>
                <input className="room-title" defaultValue={c.title} key={`${c.id}:${c.title}`}
                       aria-label={t.conversations.rename}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') e.currentTarget.blur();
                         if (e.key === 'Escape') {
                           e.currentTarget.value = c.title;
                           e.currentTarget.blur();
                         }
                       }}
                       onBlur={(e) => {
                         const next = e.target.value.trim();
                         if (!next || next === c.title) { e.target.value = c.title; return; }
                         void run(() => api.patchConversation(projectId!, c.id, { title: next }));
                       }} />
              </div>
            ) : (
              <button className="room-item" key={c.id} onClick={() => setConvId(c.id)}>
                <span className="t">{c.title}</span>
              </button>
            )
          ))}
        </aside>

        <main className="center">
          {conv
            ? <Transcript key={conv.id} entries={conv.transcript} defs={defMap} live={live}
                          title={conv.title} />
            : <div className="transcript"><div className="empty">
                <h2>{convs.length ? t.center.pickConversation : t.center.noConversations}</h2>
                <p>{convs.length ? t.center.pickConversationBody : t.center.noConversationsBody}</p>
              </div></div>}

          {conv && (
            <div className="chair-bar">
              <div className="chair-inner">
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={t.chair.placeholder}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
                    e.preventDefault();
                    // Mid-round it redirects, which is the one thing the bar no longer has a
                    // button for; idle it plays. Both are "send what I typed".
                    if (locked) { if (note.trim()) void sayOnly(); return; }
                    if (canPlay) play();
                  }} />

                {openRoundtable && (
                  <div className="open-note">
                    <p>{t.open.didNotClose(openRoundtable.blockers, openRoundtable.notClosed)}</p>
                    <div className="open-acts">
                      <button className="btn btn-sm btn-ghost"
                              onClick={() => setOpenRoundtable(null)}>
                        {t.open.carryOn}
                      </button>
                      <button className="btn btn-sm" onClick={() => startSession(true)}
                              title={t.open.writeAnywayTitle}>
                        {t.open.writeAnyway}
                      </button>
                    </div>
                  </div>
                )}

                {/* A mode, a play, a stop. That is the whole bar.
                    What went: two round buttons (parallel and sequential are now modes), the
                    round-count input (4, and it was never the interesting decision), the
                    say/redirect button (⌘↵ sends, which is what anyone typing already reaches
                    for) and a chip per participant to give one the floor — a round with one
                    seat ticked is exactly that, and who speaks belongs in the right column. */}
                <div className="chair-actions">
                  <select className="mode-select" value={mode} disabled={locked}
                          aria-label={t.chair.modeLabel}
                          onChange={(e) => setMode(e.target.value as typeof mode)}>
                    <option value="deliver">{t.chair.modeDeliver}</option>
                    <option value="answer">{t.chair.modeAnswer}</option>
                    <option value="sweep">{t.chair.modeSweep}</option>
                  </select>

                  <span className="spacer" />

                  {locked ? (
                    <button className="btn btn-sm btn-stop" onClick={stop} disabled={stopping}>
                      {stopping ? t.chair.stopping : t.chair.stop}
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={play}
                            disabled={!canPlay}
                            title={canPlay ? t.chair.playTitle : t.chair.playBlocked}>
                      {t.chair.play}
                    </button>
                  )}
                </div>

                {error
                  ? <p className="error-note">{error}</p>
                  : <p className="hint" style={{ marginTop: 7 }}>
                      {stopping ? t.chair.hintStopping
                        : session && 'writing' in session
                          ? t.chair.hintWriting(session.writing)
                        : session
                          ? t.chair.hintPhase(
                              t.transcript.phase[session.phase], session.round, session.rounds)
                        : auto ? t.chair.hintAuto
                        : mode === 'deliver' ? t.chair.hintDeliver
                        : question ? t.chair.hintIdle
                        : t.chair.hintNoQuestion}
                    </p>}
              </div>
            </div>
          )}
        </main>

        <aside className="rail-right">
          {/* Everything here belongs to a conversation. It used to also serve a roundtable with
              no conversation open — who was seated, and an edit button — but seating belongs to
              a conversation now, so with none open there is nothing to show. */}
          {conv && (
            <>
              {/* Above the sections, not inside one: these act on the conversation as a whole,
                  and «Contexto» was only where there happened to be room. Two ways to start over
                  and they differ in one thing — whether the run you are leaving survives. */}
              <div className="conv-acts">
                <button className="btn btn-sm btn-ghost" disabled={locked}
                        title={t.convActions.copyTitle}
                        onClick={() => void (async () => {
                          const r = await api.duplicateConversation(...ids());
                          await refreshConvs();
                          setConvId(r.conversation.id);
                        })().catch((e) => setError(
                          e instanceof Error ? e.message : String(e)))}>
                  {t.convActions.copy}
                </button>
                {/* Asks, because it cannot be undone — the one difference from «copy», which
                    asks nothing because it takes nothing away. */}
                <button className="btn btn-sm btn-ghost" disabled={locked}
                        title={t.convActions.resetTitle}
                        onClick={() => {
                          if (!confirm(t.convActions.resetWarn(turns))) return;
                          void run(() => api.resetConversation(...ids()));
                        }}>
                  {t.convActions.reset}
                </button>
              </div>

              {/* Shown, not edited. The question is set by what you type in the box and play —
                  it is not a field you configure before you can run anything. What it is *for*
                  is being re-injected on every turn, which is why it is stored on the
                  conversation rather than living as a one-shot note. */}
              {/* The standing question used to be shown above this. It went: you set it by
                  typing it in the bar, and a read-only copy of it in a column of settings was
                  one more thing to scan past. It is in the turn prompt, which is where it
                  works. */}
              <Section title={t.context.eyebrow} open={open.has('context')}
                       onToggle={() => toggle('context')}>
                {editBrief !== null ? (
                  <div className="q-edit">
                    <textarea value={editBrief} autoFocus
                              onChange={(e) => setEditBrief(e.target.value)}
                              placeholder={t.context.briefPlaceholder} />
                    <div className="q-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditBrief(null)}>
                        {t.common.cancel}
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => run(async () => {
                        await api.patchConversation(...ids(), { brief: editBrief });
                        setEditBrief(null);
                      })}>{t.common.save}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="q-show brief-show" onClick={() => setEditBrief(conv.brief)}
                            title={t.context.editBrief}>
                      {conv.brief.trim() || <i>{t.context.noBrief}</i>}
                    </button>

                  </>
                )}
              </Section>

              {/* Who sits is configured here, on the conversation, because that is what owns
                  it now. Seating someone mid-conversation works: a fresh seat has seen nothing
                  and holds no session, so their first turn gets the transcript so far as its
                  delta. Nobody is removed — the checkbox takes them out of the rotation, and
                  their turns stay in the transcript either way. */}
              <Section title={t.seats.eyebrow} open={open.has('agents')}
                       onToggle={() => toggle('agents')}>
              {/* Alphabetical, and the seat that is not taking part keeps its place. Sinking it
                  to the bottom was meant to make the list read as who is *in*, but the empty ring
                  already says that, and a row shunted to the end and faded reads as a mistake
                  rather than as a choice you made. */}
              {[...seated]
                // By what the row actually reads, not by the id underneath it: sorting
                // «Elena Duarte» under `cliente-negocio` looks like no order at all.
                .sort((a, b) => nameOf(a).name.localeCompare(nameOf(b).name))
                .map((p) => {
                const d = defMap.get(p.id);
                const gone = !d;
                const level = levelOf(p);
                const chairs = conv.orchestrator === p.id;
                const inRound = level !== 'off' && !gone;
                const speaking = live.some((l) => l.participantId === p.id);
                return (
                  <div key={p.id} className={`seat${inRound ? '' : ' off'}`}
                       style={{ ['--speaker' as string]: hueFor(p.id) }}>
                    {/* The ring itself pulses while they hold the floor, the same signal the
                        transcript uses. It replaced a «tiene la palabra» badge: a word appearing
                        in one row of five is read after the movement anyway, and it reflowed the
                        row when it arrived. */}
                    <button className={`seat-level lv-${level}${speaking ? ' speaking' : ''}`}
                            disabled={gone || locked}
                            aria-label={`${t.seats.levelLabel(p.id, t.seats.level[level])}`
                              + (speaking ? ` — ${t.seats.speaking}` : '')}
                            title={chairs && level === 'high'
                              ? t.seats.levelChairFloor
                              : t.seats.levelTitle(t.seats.level[level],
                                                   t.seats.level[(chairs ? NEXT_CHAIR : NEXT)[level]])}
                            onClick={() => setLevel(p.id, (chairs ? NEXT_CHAIR : NEXT)[level])}>
                      <span className="lv-mark" aria-hidden="true" />
                    </button>
                    {/* Their own heading — "Elena Duarte — dueña de Fibra Andina" — because that
                        is who is at the table. The id (`cliente-negocio`) is the seat they fill,
                        which is a detail: it goes in the hover next to the effort level. */}
                    <span className="seat-name">
                      {nameOf(p).name}
                      {nameOf(p).desc && (
                        <small className="seat-desc">{nameOf(p).desc}</small>
                      )}
                      {gone && <small className="seat-warn">{t.seats.gone}</small>}
                    </span>
                    {/* One thing that is true of exactly one seat, so it is a mark rather than a
                        rung on a scale of quantity. Faint on everyone else until you hover, which
                        is how you discover you can move it. */}
                    <button className={`seat-star${chairs ? ' on' : ''}`}
                            disabled={locked || gone || level === 'off'}
                            aria-pressed={chairs}
                            title={level === 'off' ? t.seats.chairNeedsIn
                              : chairs ? t.seats.chairClear : t.seats.chairSet(p.id)}
                            onClick={() => setChair(chairs ? null : p.id)}>
                      ★
                    </button>
                    <span className="seat-cost">${p.costUsd.toFixed(2)}</span>
                    {/* The state in words, in the row itself, shown while it is hovered.
                        A native `title` is stale by design here: it does not re-show while the
                        pointer stays put, so after a click it still reads as the level you just
                        left. This is real DOM, so it changes with the click. The `title` stays
                        for whoever is not using a pointer. */}
                    <span className="seat-state">
                      <span className="mono">{p.id}</span> · {t.seats.level[level]}
                    </span>

                  </div>
                );
              })}

              {activeProject && activeProject.agentCount === 0 && (
                <div className="board-empty" style={{ paddingTop: 0 }}>
                  {t.seats.noAgents}
                </div>
              )}

              {/* Inside the section, under the list it adds to. On the bar it was a second
                  target on a row whose whole job is to collapse — you would eventually hit one
                  meaning the other. */}
              <button className="add-row" disabled={locked} title={t.seats.addTitle}
                      onClick={() => setModal({ kind: 'seat' })}>
                {t.seats.add}
              </button>
              </Section>

              {/* A yes/no per type and the documents they produced. Nothing else.
                  «Write it now» went: it wrote one document immediately, which nobody could tell
                  apart from publishing it to the repo — and ticking one deliverable and pressing
                  Play does the same thing through the one engine. «Signed by» went too: the
                  author is resolved from the archetype (`DEFAULT_AUTHORS`), which picks the pm
                  for decisions and whoever sells for a proposal, and overriding that is not a
                  decision anyone was making. */}
              <Section title={t.deliverables.eyebrow} open={open.has('deliverables')}
                       onToggle={() => toggle('deliverables')}>
              {/* Ticked first, like the seats: the list reads as what this conversation is for,
                  with the rest available underneath. */}
              {[...artTypes]
                .sort((a, b) => Number(conv.deliverables.includes(b.type))
                              - Number(conv.deliverables.includes(a.type)))
                .map((a) => {
                const info = t.deliverables.types[a.type];
                const on = conv.deliverables.includes(a.type);
                const made = conv.artifacts.filter((x) => x.type === a.type);
                return (
                  <div key={a.type}>
                    {/* The checkbox is the toggle and the name is the document — the row used to
                        be one `<label>` around both, so pressing it to read the deliverable
                        forwarded the click to the checkbox and unticked it instead. Same row,
                        opposite outcome, and nothing on screen said which you would get.
                        With nothing written yet the name goes back to being the label. */}
                    <div className={`deliv${on ? '' : ' off'}`}>
                      <input type="checkbox" id={`dl-${a.type}`} checked={on} disabled={locked}
                             onChange={() => run(() => api.patchConversation(...ids(), {
                               deliverables: on
                                 ? conv.deliverables.filter((x) => x !== a.type)
                                 : [...conv.deliverables, a.type],
                             }))} />
                      {made.length ? (
                        <button className="deliv-name as-open"
                                title={t.deliverables.openDoc}
                                onClick={() => setModal({
                                  kind: 'doc', artifactId: made[made.length - 1].id,
                                })}>
                          {info.title}
                          <small>{info.note}</small>
                        </button>
                      ) : (
                        <label className="deliv-name" htmlFor={`dl-${a.type}`}>
                          {info.title}
                          <small>{info.note}</small>
                        </label>
                      )}
                    </div>

                    {/* Listed as well, because a type can have produced more than one. */}
                    {made.map((x) => (
                      <button className="artifact-file" key={x.id} onClick={() => setModal({ kind: 'doc', artifactId: x.id })}
                              title={t.deliverables.openDoc}>
                        <span className="af-name">{x.file}</span>
                        <span className={`af-state${x.publishedPath ? ' pub' : ''}`}>
                          {x.publishedPath ? t.deliverables.published : t.deliverables.draft}
                        </span>
                        {x.openBlocks
                          ? <span className="af-warn">{t.deliverables.notClosed}</span> : null}
                      </button>
                    ))}
                  </div>
                );
              })}
              </Section>
            </>
          )}
        </aside>
      </div>

      {modal?.kind === 'doc' && conv && activeProject && (
        <DocViewer projectId={conv.projectId} convId={conv.id} artifactId={modal.artifactId}
                   projectPath={activeProject.path}
                   onClose={close} onChanged={() => { void after(); }} />
      )}

      {/*
        Only the open dialog is mounted, and that is what makes stacking impossible rather than
        merely unlikely. Keeping them all mounted and toggling `showModal()`/`close()` from
        sibling effects meant the ordering of those effects — and the `close` events they fire,
        which run their own onClose — decided what ended up in the top layer. Two dialogs got
        there anyway. An unmounted <dialog> cannot.
      */}
      {modal?.kind === 'projects' && (
        <Projects open onClose={close} activeId={projectId}
                  onSetup={(p) => setModal({ kind: 'setup', project: p })}
                  onChanged={(list, deletedId) => {
                    setProjects(list);
                    if (deletedId === projectId || !list.some((p) => p.id === projectId)) {
                      setProjectId(list[0]?.id ?? null);
                    }
                    void refreshConvs();
                  }} />
      )}

      {modal?.kind === 'setup' && (
        <ProjectSetup project={modal.project} open
                      onClose={() => {
                        close();
                        void api.projects().then((r) => setProjects(r.projects));
                        void refreshConvs();
                      }}
                      onSaved={(p) => {
                        setProjects((list) =>
                          list.some((x) => x.id === p.id)
                            ? list.map((x) => (x.id === p.id ? p : x))
                            : [...list, p]);
                        setProjectId(p.id);
                      }} />
      )}

      {modal?.kind === 'people' && (
        <PeopleDialog open onClose={close} projectId={projectId ?? undefined}
                      onChanged={() => void refreshConvs()} />
      )}

      {modal?.kind === 'seat' && conv && (
        <SeatPicker open onClose={close}
                    available={defs.filter((d) => !conv.participants.some((p) => p.id === d.id))}
                    onSeat={(picked) => void run(() => api.seatMore(...ids(), picked))} />
      )}

      {modal?.kind === 'newConversation' && projectId && activeProject && (
        <NewConversation projectId={projectId} projectName={activeProject.name}
                         previous={convs[0]?.participants}
                         open onClose={close}
                         onCreated={(id) => {
                           void refreshConvs().then(() => setConvId(id));
                         }} />
      )}
    </div>
  );
}
