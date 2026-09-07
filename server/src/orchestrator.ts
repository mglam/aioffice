import type {
  ArtifactType, Board, Conversation, Locale, ParticipantDef, Phase, Project, TranscriptEntry,
} from './types.js';
import {
  appendEntry, boardOf, getParticipant, listConversations,
  loadConversation, saveConversation,
} from './store.js';
import { historyDir, historyPath, writeHistory } from './history.js';
import { discoverParticipants } from './participants.js';
import { artifactSpec, buildTurnPrompt, stringsFor } from './prompts/index.js';
import { interruptTurn, runTurn, type TurnEvent } from './turn.js';
import { resolveAuthor, generateArtifact } from './artifacts.js';
import { extractMarkers } from './markers.js';
import { publish, withConversationLock } from './bus.js';

/**
 * Everything that occupies a conversation is registered here, not just long rounds: a
 * single turn has to be stoppable too. `stopConversation` cuts whatever is in flight and
 * keeps the next thing from starting.
 */
const stopping = new Set<string>();
const speaking = new Map<string, Set<string>>();
/**
 * Multi-turn operations in progress. It matters that a round is registered here: the stop
 * request has to survive *between* turns, and if nothing declares the operation still
 * alive, it gets cleared the moment the first turn ends and the round carries on.
 */
const drivers = new Set<string>();
/** Only auto and session: this is what the UI shows as round progress. */
const autoKind = new Map<string, 'auto' | 'session'>();

function beginTurn(convId: string, pid: string): void {
  if (!speaking.has(convId)) speaking.set(convId, new Set());
  speaking.get(convId)!.add(pid);
  announceBusy(convId);
}

function endTurn(convId: string, pid: string): void {
  const set = speaking.get(convId);
  set?.delete(pid);
  if (set && !set.size) speaking.delete(convId);
  // `stopping` is not cleared here while an operation is alive: between two turns of a
  // round nobody is speaking, and clearing the brake in that gap would make it useless.
  if (!isBusy(convId)) stopping.delete(convId);
  announceBusy(convId);
}

/**
 * The server is what knows whether it is busy, so it says so. Deducing it on the client
 * by asking for the state when a turn arrives is a race: that request can go out before
 * the lock is released, answer `true` late, and leave the interface stuck.
 */
function announceBusy(convId: string): void {
  publish(convId, { type: 'busy', busy: isBusy(convId) });
}

export function stopConversation(convId: string): boolean {
  if (!isBusy(convId)) return false;
  stopping.add(convId);
  for (const pid of speaking.get(convId) ?? []) interruptTurn(convId, pid);
  publish(convId, { type: 'auto_stopping' });
  return true;
}

export function isBusy(convId: string): boolean {
  return drivers.has(convId) || (speaking.get(convId)?.size ?? 0) > 0;
}

/** Is a round or session driving? Different from "someone is speaking". */
export function isAutoRunning(convId: string): boolean {
  return autoKind.has(convId);
}

async function asDriver<T>(convId: string, kind: 'round' | 'auto' | 'session',
                           fn: () => Promise<T>): Promise<T> {
  drivers.add(convId);
  if (kind !== 'round') autoKind.set(convId, kind);
  announceBusy(convId);
  try {
    return await fn();
  } finally {
    drivers.delete(convId);
    autoKind.delete(convId);
    if (!isBusy(convId)) stopping.delete(convId);
    announceBusy(convId);
  }
}

// ── Contexto ───────────────────────────────────────────────────────────────

type Ctx = {
  conv: Conversation;
  map: Map<string, ParticipantDef>; roster: ParticipantDef[];
  history: { path: string; conversations: number };
};

async function context(projectId: string, convId: string, project: Project): Promise<Ctx> {
  const [conv, defs, convs] = await Promise.all([
    loadConversation(projectId, convId),
    discoverParticipants(project),
    listConversations(projectId),
  ]);
  const map = new Map(defs.map((d) => [d.id, d]));
  const roster = conv.participants
    .map((p) => map.get(p.id))
    .filter((d): d is ParticipantDef => Boolean(d));
  return {
    conv, map, roster,
    history: { path: historyPath(projectId), conversations: convs.length },
  };
}

const emit = (convId: string) => (e: TurnEvent) => publish(convId, e);

/**
 * Being stopped is not a failure: the transcript says so in those words, not with the
 * SDK's error code. Pure on purpose — an earlier version took the lock again from inside
 * a turn that already held it, and the conversation stayed busy forever.
 */
function markCut(entry: TranscriptEntry, locale?: Locale): void {
  if (!entry.error) return;
  const notes = stringsFor(locale).systemNotes;
  entry.cut = true;
  entry.error = entry.text.trim()
    ? notes.cutMidTurn
    : notes.cutBeforeSpeaking;
}

function record(conv: Conversation, participantId: string,
                res: Awaited<ReturnType<typeof runTurn>>, locale?: Locale,
                phase?: Phase): TranscriptEntry {
  const notes = stringsFor(locale).systemNotes;
  const cp = getParticipant(conv, participantId);
  if (res.sessionId) cp.sessionId = res.sessionId;
  cp.costUsd += res.costUsd;

  // The fenced block is split off the speech: it is rendered as structure, not as text.
  const { speech, markers } = extractMarkers(res.text, conv.participants.map((p) => p.id));

  // With a chair, only they hand out the turn. If anyone else emits an ask it is
  // discarded: the protocol says so, and this makes it true even when they ignore it.
  if (conv.orchestrator && participantId !== conv.orchestrator) markers.asks = [];

  const entry = appendEntry(conv, {
    role: 'agent',
    participantId,
    text: speech || (res.error ? '' : notes.noAnswer),
    toolCalls: res.toolCalls.length ? res.toolCalls : undefined,
    costUsd: res.costUsd,
    tokens: res.tokens,
    error: res.error,
    phase,
    markers,
  });
  publish(conv.id, { type: 'entry', entry });
  return entry;
}

/**
 * Who speaks now, among those who have not spoken yet this round.
 *
 * Recalculated **before every turn**, not once per round: a question asked on turn 2 of a
 * round of seven has to be answered on turn 3, not six turns later. Among several people
 * put on the spot, whoever has been waiting longest wins.
 *
 * The "one per round" limit is deliberate: if someone put on the spot could jump again,
 * two agents would play ping-pong and nobody else would ever speak.
 */
export function nextSpeaker(board: Board, remaining: string[]): string {
  const asked = board.pending.map((p) => p.to).find((id) => remaining.includes(id));
  return asked ?? remaining[0];
}

// ── Turnos ─────────────────────────────────────────────────────────────────

export async function takeTurn(
  projectId: string, convId: string, project: Project,
  participantId: string, note?: string, phase?: Phase,
): Promise<TranscriptEntry> {
  return withConversationLock(convId, async () => {
    const { conv, map, roster, history } = await context(projectId, convId, project);
    const def = map.get(participantId);
    if (!def) throw new Error(`Unknown participant: ${participantId}`);
    const cp = getParticipant(conv, participantId);

    // Snapshot BEFORE anything is appended: this is where lastSeenIndex lands.
    const snapshot = conv.transcript.length;
    const promptText = buildTurnPrompt({
      conv, def, defs: map, fromIndex: cp.lastSeenIndex, note, roster,
      phase, board: boardOf(conv), project, history,
    });

    if (stopping.has(convId)) throw new Error('The conversation was stopped before this turn');

    beginTurn(convId, participantId);
    let res;
    try {
      res = await runTurn({
        conv, cp, def, project, projectDir: historyDir(projectId),
        promptText, onEvent: emit(convId),
      });
    } finally {
      endTurn(convId, participantId);
    }

    const entry = record(conv, participantId, res, project.locale, phase);
    if (stopping.has(convId)) markCut(entry, project.locale);
    cp.lastSeenIndex = snapshot;

    await saveConversation(conv);
    await writeHistory(projectId);
    return entry;
  });
}

/**
 * A round. In `parallel` everyone starts from the same state and cannot see each other —
 * useful for opening a topic without the first speaker anchoring the rest. In `sequential`
 * each one reads what the previous one said.
 */
export async function takeRound(
  projectId: string, convId: string, project: Project, participantIds: string[],
  note: string | undefined, mode: 'parallel' | 'sequential',
): Promise<TranscriptEntry[]> {
  return asDriver(convId, 'round', async () => {
    if (mode === 'sequential') {
      const remaining = [...participantIds];
      const out: TranscriptEntry[] = [];
      while (remaining.length) {
        if (stopping.has(convId)) break;
        const { conv } = await context(projectId, convId, project);
        const id = nextSpeaker(boardOf(conv), remaining);
        remaining.splice(remaining.indexOf(id), 1);
        out.push(await takeTurn(projectId, convId, project, id, note));
      }
      return out;
    }

    return withConversationLock(convId, async () => {
      const { conv, map, roster, history } = await context(projectId, convId, project);
      const snapshot = conv.transcript.length;

      const jobs = participantIds.map(async (id) => {
        const def = map.get(id);
        if (!def) throw new Error(`Participante desconocido: ${id}`);
        const cp = getParticipant(conv, id);
        const promptText = buildTurnPrompt({
          conv, def, defs: map, fromIndex: cp.lastSeenIndex, note, roster,
          board: boardOf(conv), project, history,
        });
        beginTurn(convId, id);
        try {
          return {
            id,
            res: await runTurn({
              conv, cp, def, project,
              projectDir: historyDir(projectId), promptText, onEvent: emit(convId),
            }),
          };
        } finally {
          endTurn(convId, id);
        }
      });

      const settled = await Promise.allSettled(jobs);

      // Appended in the requested order, not arrival order: the transcript stays deterministic.
      const entries: TranscriptEntry[] = [];
      settled.forEach((s, idx) => {
        const id = participantIds[idx];
        if (s.status === 'fulfilled') {
          const entry = record(conv, id, s.value.res, project.locale);
          if (stopping.has(convId)) markCut(entry, project.locale);
          entries.push(entry);
        } else {
          const entry = appendEntry(conv, {
            role: 'agent', participantId: id, text: '',
            error: s.reason instanceof Error ? s.reason.message : String(s.reason),
          });
          publish(convId, { type: 'entry', entry });
          entries.push(entry);
        }
        getParticipant(conv, id).lastSeenIndex = snapshot;
      });

      await saveConversation(conv);
      await writeHistory(projectId);
      return entries;
    });
  });
}


// ── Session ────────────────────────────────────────────────────────────────

function converged(board: Board, ids: string[], chair?: string | null): boolean {
  const nothingPending = !board.pending.some((p) => ids.includes(p.to));
  const noBlocks = board.blockers.length === 0;
  // With a chair, it ends when they say it ends: the others answer, they don't sign off.
  // With no chair, everyone has to close.
  const closed = chair
    ? board.closed.includes(chair)
    : ids.every((id) => board.closed.includes(id));
  return closed && nothingPending && noBlocks;
}

async function noteOpen(projectId: string, convId: string, project: Project,
                        board: Board, notClosed: string[]): Promise<void> {
  await withConversationLock(convId, async () => {
    const { conv } = await context(projectId, convId, project);
    const notes = stringsFor(project.locale).systemNotes;
    const L = [notes.didNotClose, ''];
    if (board.blockers.length) {
      L.push(notes.standingBlockers);
      for (const b of board.blockers) L.push(`- (${b.by}) ${b.text}`);
      L.push('');
    }
    if (notClosed.length) L.push(notes.notClosedBy(notClosed.join(', ')));
    L.push('', notes.carryOnOrWrite);
    const entry = appendEntry(conv, { role: 'system', text: L.join('\n') });
    await saveConversation(conv);
    publish(convId, { type: 'entry', entry });
  });
}

/**
 * A chaired conversation: the chair asks, one participant answers, and the turn goes back to the
 * chair. It ends when the chair closes or stops asking.
 *
 * `exchanges` counts question-answer *pairs*, not single turns.
 */
async function runConducted(
  projectId: string, convId: string, project: Project, orchestrator: string,
  note: string | undefined, exchanges: number, phaseFor?: (i: number) => Phase,
  onProgress?: (i: number, phase: Phase | undefined, pid: string) => void,
): Promise<TranscriptEntry[]> {
  const out: TranscriptEntry[] = [];

  for (let i = 0; i < exchanges; i++) {
    if (stopping.has(convId)) return out;
    const phase = phaseFor?.(i);

    onProgress?.(i, phase, orchestrator);
    const lead = await takeTurn(
      projectId, convId, project, orchestrator, i === 0 ? note : undefined, phase);
    out.push(lead);

    // No question means the chair considered the exchange finished.
    const asked = lead.markers?.asks?.[0]?.to;
    if (!asked || lead.markers?.closes) return out;
    if (stopping.has(convId)) return out;

    onProgress?.(i, phase, asked);
    out.push(await takeTurn(projectId, convId, project, asked, undefined, phase));
  }

  return out;
}

/**
 * Session: the conversation runs until the question is answered, then writes.
 *  - **Phases.** open (diverge) → cross (no new topics) → close.
 *  - **Turn on demand.** Whoever was put on the spot speaks, not whoever is next in line.
 *  - **Stops on state, not on a counter.**
 */
export async function runSession(
  projectId: string, convId: string, project: Project, participantIds: string[],
  note: string | undefined, maxRounds: number, artifacts: ArtifactType[],
  force = false,
): Promise<void> {
  if (isBusy(convId)) throw new Error('The conversation is busy: stop it first');
  if (participantIds.length < 2) throw new Error('A converging session needs at least two participants');

  const rounds = Math.max(2, Math.min(maxRounds, 8));
  stopping.delete(convId);
  const phaseFor = (r: number): Phase =>
    r === 0 ? 'open' : r >= rounds - 1 ? 'close' : 'cross';

  return asDriver(convId, 'session', async () => {
    try {
      // Read once up front: the chair is a property of the conversation and does not
      // change under us. The board, further down, is deliberately re-read fresh.
      const { conv: opened } = await context(projectId, convId, project);
      const chair = opened.orchestrator && participantIds.includes(opened.orchestrator)
        ? opened.orchestrator : null;

      if (chair) {
        await runConducted(
          projectId, convId, project, chair, note, rounds, phaseFor,
          (i, phase, pid) => publish(convId, {
            type: 'session_progress', round: i + 1, rounds, phase: phase!, participantId: pid,
          }),
        );
      } else {
        for (let r = 0; r < rounds; r++) {
          const phase = phaseFor(r);
          const remaining = [...participantIds];

          while (remaining.length) {
            if (stopping.has(convId)) return;
            const { conv } = await context(projectId, convId, project);
            const board = boardOf(conv);
            const id = nextSpeaker(board, remaining);
            remaining.splice(remaining.indexOf(id), 1);

            // In the last phase nobody is skipped: closing is everyone's. Before that,
            // whoever already closed and was not asked anything doesn't spend a turn.
            if (phase !== 'close'
                && board.closed.includes(id)
                && !board.pending.some((p) => p.to === id)) continue;

            publish(convId, {
              type: 'session_progress', round: r + 1, rounds, phase, participantId: id,
            });
            await takeTurn(projectId, convId, project, id, r === 0 ? note : undefined, phase);
          }

          const { conv: after } = await context(projectId, convId, project);
          if (converged(boardOf(after), participantIds, null) && r >= 1) {
            publish(convId, { type: 'session_converged', round: r + 1 });
            break;
          }
        }
      }

      if (stopping.has(convId)) return;

      // Rounds ran out without closing: writing anyway is the moderator's call.
      const { conv } = await context(projectId, convId, project);
      const board = boardOf(conv);
      if (!force && !converged(board, participantIds, chair)) {
        const notClosed = chair
          ? (board.closed.includes(chair) ? [] : [chair])
          : participantIds.filter((id) => !board.closed.includes(id));
        await noteOpen(projectId, convId, project, board, notClosed);
        publish(convId, {
          type: 'session_open', blockers: board.blockers.length, notClosed: notClosed,
        });
        return;
      }

      for (const type of artifacts) {
        if (stopping.has(convId)) return;
        const author = resolveAuthor(type, participantIds);
        publish(convId, { type: 'session_writing', artifact: type, participantId: author });
        try {
          await makeArtifact(projectId, convId, project, type, author);
        } catch (e) {
          publish(convId, {
            type: 'session_artifact_failed', artifact: type,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // The conversation got there: it is marked closed and enters the history as such.
      await withConversationLock(convId, async () => {
        const c = await loadConversation(projectId, convId);
        c.closedAt = new Date().toISOString();
        await saveConversation(c);
      });
      await writeHistory(projectId);
    } finally {
      publish(convId, { type: 'auto_done' });
    }
  });
}

// ── Moderador y entregables ────────────────────────────────────────────────

export async function addModeratorMessage(
  projectId: string, convId: string, text: string,
): Promise<TranscriptEntry> {
  return withConversationLock(convId, async () => {
    const conv = await loadConversation(projectId, convId);
    const entry = appendEntry(conv, { role: 'moderator', text });
    await saveConversation(conv);
    publish(convId, { type: 'entry', entry });
    return entry;
  });
}

export async function makeArtifact(
  projectId: string, convId: string, project: Project, type: ArtifactType, participantId: string,
) {
  return withConversationLock(convId, async () => {
    const { conv, map } = await context(projectId, convId, project);
    const def = map.get(participantId);
    if (!def) throw new Error(`Unknown participant: ${participantId}`);

    const board = boardOf(conv);
    const out = await generateArtifact({
      conv, type, def, defs: map, project, projectDir: historyDir(projectId),
      onEvent: emit(convId),
      board: board.blockers.length ? board : undefined,
    });

    const entry = appendEntry(conv, {
      role: 'system',
      participantId,
      text: stringsFor(project.locale).systemNotes.drafted(
        def.id, artifactSpec(type, project.locale).title),
      costUsd: out.costUsd,
    });

    await saveConversation(conv);
    await writeHistory(projectId);
    publish(convId, { type: 'entry', entry });
    publish(convId, { type: 'artifact', artifact: out.artifact });
    return out;
  });
}
