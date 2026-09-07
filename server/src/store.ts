import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DATA_DIR, slugify, writeJson } from './base.js';
import type {
  ArtifactRef, ArtifactType, Board, Conversation, ConversationParticipant,
  ParticipantDef, TranscriptEntry,
} from './types.js';

/**
 * A project's own data: its conversations, its history, and the deliverables staged for them.
 *
 * This used to hang off a roundtable — a standing group between the project and the
 * conversation, whose whole job was owning "who sits". That job went away when the people
 * became global or project-scoped, so the layer went with it: the project keeps the history
 * (which is now shared across all its conversations instead of siloed per group) and each
 * conversation keeps who actually speaks about its topic.
 */
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

export const projectDataDir = (projectId: string) => path.join(PROJECTS_DIR, projectId);
const convDir = (projectId: string) => path.join(projectDataDir(projectId), 'conv');
const convFile = (projectId: string, id: string) => path.join(convDir(projectId), `${id}.json`);
export const stagingDir = (projectId: string, convId: string) =>
  path.join(projectDataDir(projectId), 'artifacts', convId);

/** The old tree, kept only so the boot migration can find and fold it in. */
export const ROUNDTABLES_DIR = path.join(DATA_DIR, 'roundtables');
const roundtableDir = (id: string) => path.join(ROUNDTABLES_DIR, id);
const roundtableFile = (id: string) => path.join(roundtableDir(id), 'roundtable.json');

export { slugify } from './base.js';

/**
 * Conversational profiles do not receive the CLAUDE.md: it is implementation detail that
 * drowns them. The product frame (`project.frame`) goes to everyone and is a different
 * thing. Add your own technical agent ids here.
 */
const WANTS_PROJECT_CONTEXT = new Set(['claude-code']);

// ── Projects' conversations ─────────────────────────────────────────────────

async function projectDataIds(): Promise<string[]> {
  if (!existsSync(PROJECTS_DIR)) return [];
  return (await readdir(PROJECTS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name);
}

/** What would be lost if the project were deleted. Feeds the first confirmation. */
export async function projectStats(projectId: string): Promise<{
  conversations: number; artifacts: number;
}> {
  const convs = await listConversations(projectId);
  return {
    conversations: convs.length,
    artifacts: convs.reduce((a, c) => a + c.artifacts, 0),
  };
}

// ── Deletion ───────────────────────────────────────────────────────────────
//
// None of this touches documents already PUBLISHED under `<project>/AISPECS/`: those
// belong to the user and only they delete them. Only the app's own data goes here.

export async function deleteConversation(projectId: string, convId: string): Promise<void> {
  const file = convFile(projectId, convId);
  if (!existsSync(file)) throw new Error(`Unknown conversation: ${convId}`);
  await rm(file, { force: true });
  await rm(stagingDir(projectId, convId), { recursive: true, force: true });
}

/** Deletes every conversation of a project, and its history. Returns how many went. */
export async function deleteProjectConversations(projectId: string): Promise<number> {
  const convs = await listConversations(projectId);
  const dir = projectDataDir(projectId);
  if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
  return convs.length;
}

// ── Conversations ──────────────────────────────────────────────────────────

/** A fresh seat: no session, has seen nothing, and the CLAUDE.md only if it is a technical one. */
export const seat = (id: string): ConversationParticipant => ({
  id,
  lastSeenIndex: 0,
  enabled: true,
  loadProjectSettings: WANTS_PROJECT_CONTEXT.has(id),
  costUsd: 0,
});

export async function createConversation(args: {
  projectId: string; title: string; participantIds: string[]; brief?: string; question?: string;
  deliverables?: ArtifactType[]; orchestrator?: string;
}): Promise<Conversation> {
  const seated = [...new Set(args.participantIds)];
  const conv: Conversation = {
    id: randomUUID(),
    projectId: args.projectId,
    title: args.title.trim() || 'Untitled conversation',
    slug: slugify(args.title),
    brief: args.brief ?? '',
    question: (args.question ?? '').trim(),
    deliverables: args.deliverables?.length ? args.deliverables : ['decisions'],
    createdAt: new Date().toISOString(),
    // Only someone actually seated can chair; anything else means an open conversation.
    orchestrator: seated.includes(args.orchestrator ?? '') ? args.orchestrator : undefined,
    // Fresh sessions: every topic starts clean. What the project already settled is in its
    // history file, and participants can read that with their own tools.
    participants: seated.map(seat),
    transcript: [],
    artifacts: [],
  };

  await writeJson(convFile(conv.projectId, conv.id), conv);
  return conv;
}

/**
 * Starts the same conversation over: same people at the same levels, same question, same
 * deliverables, empty transcript.
 *
 * **A copy, not a reset.** Wiping the transcript in place is the obvious version and the wrong
 * one — a discussion that went sideways is usually where you found out the question was wrong, so
 * it is the last thing to throw away. This leaves it and gives you a clean run beside it; the bin
 * in the rail takes the old one if you decide you do not want it.
 *
 * What is deliberately **not** copied is everything that made the last run what it was: the
 * transcript, the SDK sessions, each seat's `lastSeenIndex` and accrued cost, and the documents.
 * `seat()` rebuilds the participants so a copy cannot inherit a session and answer as though it
 * remembered a conversation it was not in — but their **levels** carry over, because that is
 * setup rather than history.
 */
export async function duplicateConversation(
  projectId: string, convId: string,
): Promise<Conversation> {
  const from = await loadConversation(projectId, convId);

  // ` · 2`, ` · 3`: a number rather than a word, so the title does not pick a language. The base
  // is whatever comes before an existing suffix, so copying a copy does not stack them.
  const base = from.title.replace(/\s+·\s+\d+$/, '');
  const taken = new Set((await listConversations(projectId)).map((c) => c.title));
  let n = 2;
  while (taken.has(`${base} · ${n}`)) n += 1;

  const conv: Conversation = {
    id: randomUUID(),
    projectId,
    title: `${base} · ${n}`,
    slug: slugify(`${base} ${n}`),
    brief: from.brief,
    question: from.question,
    deliverables: [...from.deliverables],
    createdAt: new Date().toISOString(),
    orchestrator: from.orchestrator,
    participants: from.participants.map((p) => ({
      ...seat(p.id),
      enabled: p.enabled,
      loadProjectSettings: p.loadProjectSettings,
      ...(p.model ? { model: p.model } : {}),
      ...(p.depth ? { depth: p.depth } : {}),
    })),
    transcript: [],
    artifacts: [],
  };

  await writeJson(convFile(projectId, conv.id), conv);
  return conv;
}

/**
 * The same conversation, wiped: setup kept, everything the run produced gone.
 *
 * The destructive twin of `duplicateConversation`, and it exists because a copy is not always
 * what you want — sometimes the run was simply noise and a second row in the list is clutter.
 * It **cannot be undone**, which is why the UI asks first.
 *
 * Staged drafts go with it: they belong to that run. Anything already **published** is untouched,
 * because it is in the user's repo and this app does not take back what it handed over.
 */
export async function resetConversation(
  projectId: string, convId: string,
): Promise<Conversation> {
  const conv = await loadConversation(projectId, convId);

  conv.transcript = [];
  conv.artifacts = [];
  conv.closedAt = undefined;
  // Rebuilt, not merely emptied: a kept `sessionId` would have them answer as though they
  // remembered a conversation that no longer exists.
  conv.participants = conv.participants.map((p) => ({
    ...seat(p.id),
    enabled: p.enabled,
    loadProjectSettings: p.loadProjectSettings,
    ...(p.model ? { model: p.model } : {}),
    ...(p.depth ? { depth: p.depth } : {}),
  }));

  await rm(stagingDir(projectId, convId), { recursive: true, force: true });
  await writeJson(convFile(projectId, conv.id), conv);
  return conv;
}

/**
 * Seats more people in a conversation that already exists.
 *
 * This works, where it used to be refused, because a fresh seat has `lastSeenIndex: 0` and no
 * session — which is exactly the state every participant starts in. Their first turn therefore
 * receives the whole transcript so far as its delta, the same machinery that hands everyone else
 * what they missed. Someone already seated is left alone, session and all.
 *
 * Nobody is ever removed: their turns are in the transcript and taking them out would leave it
 * referring to a stranger. Un-seating is `enabled: false`.
 */
export function seatMore(conv: Conversation, ids: string[]): number {
  const already = new Set(conv.participants.map((p) => p.id));
  const added = [...new Set(ids)].filter((id) => !already.has(id));
  for (const id of added) conv.participants.push(seat(id));
  return added.length;
}

function normalize(conv: Conversation): Conversation {
  conv.question ??= '';
  conv.brief ??= '';
  conv.deliverables ??= ['decisions'];
  conv.artifacts ??= [];
  conv.transcript ??= [];
  conv.participants ??= [];

  // Moved off the roundtable when that layer went. A conversation written before then has no
  // such field, and the default is the same rule that seats a new one.
  for (const p of conv.participants) {
    p.loadProjectSettings ??= WANTS_PROJECT_CONTEXT.has(p.id);
  }

  /**
   * **A chair is always enabled.** Otherwise the conversation says it has someone running it
   * while `seated()` leaves them out of every round — so `runSession` takes the open branch and
   * it runs leaderless, with the interface still showing a chair. Nothing announces that.
   *
   * Repaired on load rather than only guarded at the edges, because conversations already on disk
   * can be in that state: the two paths that could produce it (disabling the chair, chairing a
   * disabled seat) were both reachable, and one of them still is over the API of an older client.
   *
   * Enabling them is the right repair, not clearing the chair: chairing changes how the whole
   * conversation runs, so dropping it silently would be the larger surprise.
   */
  const chair = conv.orchestrator
    ? conv.participants.find((p) => p.id === conv.orchestrator) : undefined;
  if (chair) chair.enabled = true;
  else if (conv.orchestrator) conv.orchestrator = undefined;

  // The transcript survives schema changes: it is normalized on load, so nothing
  // downstream has to ask whether a field exists.
  for (const e of conv.transcript) {
    if (!e.markers) continue;
    e.markers.asks ??= [];
    e.markers.agreements ??= [];
    e.markers.blockers ??= [];
    e.markers.lifts ??= [];
    e.markers.closes ??= false;
  }

  for (const a of conv.artifacts as Array<ArtifactRef & { path?: string }>) {
    if (a.path && !a.stagedPath) {
      a.file ??= a.path.split('/').pop() ?? 'document.md';
      a.stagedPath = a.path;
      a.publishedPath ??= a.path;
      a.publishedAt ??= a.createdAt;
    }
    // Deterministic and slash-free: a path is no good as an id, it breaks the URL.
    if (!a.id || a.id.includes('/')) {
      a.id = createHash('sha1').update(a.stagedPath ?? a.file ?? '').digest('hex').slice(0, 16);
    }
  }

  return conv;
}

export async function loadConversation(projectId: string, id: string): Promise<Conversation> {
  const file = convFile(projectId, id);
  if (!existsSync(file)) throw new Error(`Unknown conversation: ${id}`);
  return normalize(JSON.parse(await readFile(file, 'utf8')) as Conversation);
}

/**
 * Searches every project. Useful when all you have is the conversation id — which is what the
 * CLI previews have, and what an SSE subscriber reconnects with.
 *
 * The id has to be exact: these are the file names, and they are UUIDs, so nothing here resolves
 * a prefix.
 */
export async function findConversation(id: string): Promise<Conversation> {
  for (const projectId of await projectDataIds()) {
    if (existsSync(convFile(projectId, id))) return loadConversation(projectId, id);
  }
  throw new Error(`Unknown conversation: ${id}`);
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await writeJson(convFile(conv.projectId, conv.id), conv);
}

export async function listConversations(projectId: string): Promise<Array<{
  id: string; projectId: string; title: string; slug: string; question: string;
  createdAt: string; closedAt?: string; orchestrator?: string;
  participants: string[];
  turns: number; costUsd: number; artifacts: number;
}>> {
  const dir = convDir(projectId);
  if (!existsSync(dir)) return [];

  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const out = await Promise.all(files.map(async (f) => {
    const c = normalize(JSON.parse(await readFile(path.join(dir, f), 'utf8')) as Conversation);
    return {
      id: c.id, projectId: c.projectId, title: c.title, slug: c.slug, question: c.question,
      participants: c.participants.map((x) => x.id),
      createdAt: c.createdAt, closedAt: c.closedAt, orchestrator: c.orchestrator,
      turns: c.transcript.filter((e) => e.role === 'agent').length,
      costUsd: c.participants.reduce((a, p) => a + p.costUsd, 0),
      artifacts: c.artifacts.length,
    };
  }));

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function appendEntry(conv: Conversation, entry: Omit<TranscriptEntry, 'i' | 'ts'>): TranscriptEntry {
  const full: TranscriptEntry = {
    i: conv.transcript.length, ts: new Date().toISOString(), ...entry,
  };
  conv.transcript.push(full);
  return full;
}

export function getParticipant(conv: Conversation, id: string): ConversationParticipant {
  const p = conv.participants.find((x) => x.id === id);
  if (!p) throw new Error(`Participant "${id}" is not in this conversation`);
  return p;
}

/**
 * The board is DERIVED from the transcript on every read, never kept alongside it. That
 * way it cannot drift out of sync with what was actually said.
 */
export function boardOf(conv: Conversation): Board {
  const board: Board = { agreements: [], blockers: [], closed: [], pending: [] };

  for (const e of conv.transcript) {
    const by = e.participantId;
    if (!by || !e.markers) continue;

    for (const a of e.markers.agreements) board.agreements.push({ by, text: a });
    for (const b of e.markers.blockers) board.blockers.push({ by, text: b });

    // Only whoever raised a blocker can lift it. A bare LIFT withdraws all of theirs;
    // with text, the closest match.
    for (const lv of e.markers.lifts) {
      const mine = board.blockers.filter((b) => b.by === by);
      if (!mine.length) continue;
      if (!lv) { board.blockers = board.blockers.filter((b) => b.by !== by); continue; }
      const needle = lv.toLowerCase();
      const hit = mine.find((b) => b.text.toLowerCase().includes(needle)
                                || needle.includes(b.text.toLowerCase()))
        ?? mine.find((b) => overlap(b.text, lv) >= 2)
        ?? mine[0];
      board.blockers = board.blockers.filter((b) => b !== hit);
    }

    // Speaking answers whatever you were asked; a close stops counting if someone
    // puts you on the spot afterwards.
    board.pending = board.pending.filter((p) => p.to !== by);
    if (e.markers.closes) {
      if (!board.closed.includes(by)) board.closed.push(by);
    } else {
      board.closed = board.closed.filter((c) => c !== by);
    }

    for (const p of e.markers.asks) {
      if (p.to === by) continue;
      board.pending.push({ to: p.to, from: by, about: p.about });
      board.closed = board.closed.filter((c) => c !== p.to);
    }
  }

  return board;
}

/** Significant words in common, to pair a LIFT with its blocker. */
function overlap(a: string, b: string): number {
  const words = (t: string) => new Set(
    t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 4));
  const wb = words(b);
  return [...words(a)].filter((w) => wb.has(w)).length;
}

// ── Migrations from older on-disk layouts ──────────────────────────────────
//
// Each of these is frozen against the layout it converts, with its own path helpers and its own
// local types. That is deliberate: a migration that reaches for the *live* path functions breaks
// the next time the layout moves, which is exactly when it must still work. They run in order,
// oldest first, and every one is a no-op once it has run.

/** The roundtable, as it was on disk. There is no such thing at runtime any more. */
type OldRoundtable = {
  id: string;
  projectId: string;
  name: string;
  participants: Array<{ id: string; loadProjectSettings: boolean }>;
  createdAt: string;
  orchestrator?: string;
  purpose?: string;
};

const oldConvDir = (rtId: string) => path.join(roundtableDir(rtId), 'conv');
const oldConvFile = (rtId: string, id: string) => path.join(oldConvDir(rtId), `${id}.json`);
const oldStagingDir = (rtId: string, convId: string) =>
  path.join(roundtableDir(rtId), 'artifacts', convId);

async function roundtableIds(): Promise<string[]> {
  if (!existsSync(ROUNDTABLES_DIR)) return [];
  return (await readdir(ROUNDTABLES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name);
}


/**
 * Third layout change: the roundtable used to own `orchestrator` and `purpose`.
 *
 * The chair belongs to a topic, not to a standing group — the same people can want a
 * chaired conversation one week and an open one the next — so it moves onto each
 * conversation. `purpose` is dropped: it reached the agents only through the history file,
 * and only from the second conversation on, so it did close to nothing.
 *
 * A non-empty `purpose` is text the user wrote, so it is saved next to the roundtable
 * rather than discarded silently. Idempotent: returns how many roundtables it touched.
 */
export async function migrateChairToConversation(): Promise<number> {
  let n = 0;
  for (const id of await roundtableIds()) {
    const file = roundtableFile(id);
    if (!existsSync(file)) continue;
    const rt = JSON.parse(await readFile(file, 'utf8')) as OldRoundtable;
    if (!('orchestrator' in rt) && !('purpose' in rt)) continue;

    const chair = rt.orchestrator;
    const purpose = (rt.purpose ?? '').trim();

    if (purpose) {
      await writeFile(path.join(roundtableDir(id), 'purpose.migrated.txt'),
                      `${purpose}\n`, 'utf8');
    }

    if (chair) {
      const dir = oldConvDir(id);
      if (existsSync(dir)) {
        for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json'))) {
          const cf = path.join(dir, f);
          const conv = JSON.parse(await readFile(cf, 'utf8')) as Conversation;
          if (conv.orchestrator) continue;
          // Only if they are still seated; otherwise the conversation becomes open.
          if (!conv.participants?.some((p) => p.id === chair)) continue;
          conv.orchestrator = chair;
          await writeJson(cf, conv);
        }
      }
    }

    delete rt.orchestrator;
    delete rt.purpose;
    await writeJson(file, rt);
    n += 1;
  }
  return n;
}

const OLD_MESAS = path.join(DATA_DIR, 'mesas');

/** Spanish marker/phase field names, as they were written to disk before the rename. */
const MARKER_FIELDS: Array<[string, string]> = [
  ['para', 'asks'], ['acuerdos', 'agreements'], ['bloqueos', 'blockers'],
  ['levanta', 'lifts'], ['cierra', 'closes'],
];
const PHASES: Record<string, string> = { abrir: 'open', cruzar: 'cross', cerrar: 'close' };

/**
 * Second layout: `data/mesas/<id>/mesa.json`, with Spanish field names inside the
 * transcript. Only the shape changes — every turn, cost and artifact is kept.
 *
 * The tree is copied rather than moved, and the original is renamed to
 * `data/mesas.migrated`, so a bad migration is recoverable by hand.
 */
export async function migrateMesas(): Promise<number> {
  if (!existsSync(OLD_MESAS)) return 0;
  const ids = (await readdir(OLD_MESAS, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name);
  if (!ids.length) return 0;

  let n = 0;
  for (const id of ids) {
    const from = path.join(OLD_MESAS, id);
    const to = roundtableDir(id);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true });

    // `mesa.json` -> `roundtable.json`
    const oldRoundtable = path.join(to, 'mesa.json');
    if (existsSync(oldRoundtable)) {
      await rename(oldRoundtable, roundtableFile(id));
    }
    // Regenerated at boot in the project's language; the stale copy would only mislead.
    await rm(path.join(to, 'registro.md'), { force: true });

    const dir = oldConvDir(id);
    if (!existsSync(dir)) { n += 1; continue; }

    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json'))) {
      const file = path.join(dir, f);
      const conv = JSON.parse(await readFile(file, 'utf8')) as any;

      conv.roundtableId ??= conv.mesaId ?? id;
      delete conv.mesaId;

      for (const e of conv.transcript ?? []) {
        if (e.phase && PHASES[e.phase]) e.phase = PHASES[e.phase];
        if (!e.markers) continue;
        for (const [from_, to_] of MARKER_FIELDS) {
          if (from_ in e.markers) {
            e.markers[to_] ??= e.markers[from_];
            delete e.markers[from_];
          }
        }
      }

      // Staged drafts moved with the tree, so their absolute paths have to follow.
      for (const a of conv.artifacts ?? []) {
        if (typeof a.stagedPath === 'string') {
          a.stagedPath = a.stagedPath.replace(OLD_MESAS, ROUNDTABLES_DIR);
        }
      }

      await writeJson(file, conv);
    }
    n += 1;
  }

  await rename(OLD_MESAS, `${OLD_MESAS}.migrated`);
  return n;
}

const OLD_ROOMS = path.join(DATA_DIR, 'rooms');
const OLD_ARTIFACTS = path.join(DATA_DIR, 'artifacts');

/**
 * Oldest layout: there was no roundtable, each "room" was group and conversation at once.
 * Each becomes a roundtable holding a single conversation, keeping everything.
 */
export async function migrateRooms(): Promise<number> {
  if (!existsSync(OLD_ROOMS)) return 0;
  const files = (await readdir(OLD_ROOMS)).filter((f) => f.endsWith('.json'));
  if (!files.length) return 0;

  let n = 0;
  for (const f of files) {
    const room = JSON.parse(await readFile(path.join(OLD_ROOMS, f), 'utf8')) as any;

    const roundtable: OldRoundtable = {
      id: room.id,
      projectId: room.projectId,
      name: room.title ?? 'Untitled roundtable',
      participants: (room.participants ?? []).map((p: any) => ({
        id: p.id, loadProjectSettings: !!p.loadProjectSettings,
      })),
      createdAt: room.createdAt,
    };

    const conv = normalize({
      id: room.id,
      projectId: roundtable.id,   // a roundtable id here; the next migration re-homes it
      title: room.title ?? 'Conversation',
      slug: room.slug ?? slugify(room.title ?? ''),
      brief: room.brief ?? '',
      question: room.question ?? '',
      deliverables: room.deliverables ?? ['decisions'],
      createdAt: room.createdAt,
      // The chair belonged to the room, which is now one conversation.
      orchestrator: room.orchestrator,
      participants: (room.participants ?? []).map((p: any) => ({
        id: p.id, sessionId: p.sessionId, lastSeenIndex: p.lastSeenIndex ?? 0,
        enabled: p.enabled !== false, loadProjectSettings: !!p.loadProjectSettings,
        costUsd: p.costUsd ?? 0,
      })),
      transcript: room.transcript ?? [],
      artifacts: room.artifacts ?? [],
    } as Conversation);

    await writeJson(roundtableFile(roundtable.id), roundtable);
    await writeJson(oldConvFile(roundtable.id, conv.id), conv);

    // Drafts move with their conversation.
    const oldStaging = path.join(OLD_ARTIFACTS, room.id);
    if (existsSync(oldStaging)) {
      const target = oldStagingDir(roundtable.id, conv.id);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(oldStaging, target);
      for (const a of conv.artifacts) {
        if (a.stagedPath?.startsWith(oldStaging)) {
          a.stagedPath = path.join(target, path.basename(a.stagedPath));
        }
      }
      await writeJson(oldConvFile(roundtable.id, conv.id), conv);
    }
    n += 1;
  }

  await rename(OLD_ROOMS, `${OLD_ROOMS}.migrated`);
  if (existsSync(OLD_ARTIFACTS)) await rm(OLD_ARTIFACTS, { recursive: true, force: true });
  return n;
}

/**
 * Fourth layout change, and the one that removed a whole level: conversations moved out from
 * under the roundtable and onto the project.
 *
 * The roundtable existed to own **who sits**. Once the people themselves became global or
 * project-scoped there was nothing left for it to own — the project keeps the history, and which
 * of those people speak about a topic was always the topic's business. So each
 * `data/roundtables/<rtId>/` folds into `data/projects/<projectId>/`, and what the roundtable
 * carried is redistributed:
 *
 * - **`participants[].loadProjectSettings`** moves onto each conversation's own participant, by
 *   id. It is the only per-participant setting the roundtable held.
 * - **the name** is prefixed onto its conversations' titles, but only when the project had more
 *   than one roundtable — with a single group the name distinguishes nothing and would just be
 *   noise on every title. Kept in `roundtable.migrated.txt` either way.
 * - **`history.md`** is dropped and rebuilt at boot, now covering all of the project's
 *   conversations rather than one group's. That is a genuine gain: two roundtables on one project
 *   could not see each other's conclusions.
 *
 * The old tree is renamed aside rather than deleted, like every migration before it.
 */
export async function migrateRoundtablesToProjects(): Promise<number> {
  const ids = await roundtableIds();
  if (!ids.length) return 0;

  // How many groups each project had, which decides whether a name is worth keeping.
  const byProject = new Map<string, string[]>();
  const loaded = new Map<string, OldRoundtable>();
  for (const id of ids) {
    const file = roundtableFile(id);
    if (!existsSync(file)) continue;
    const rt = JSON.parse(await readFile(file, 'utf8')) as OldRoundtable;
    rt.participants ??= [];
    loaded.set(id, rt);
    byProject.set(rt.projectId, [...(byProject.get(rt.projectId) ?? []), id]);
  }

  let n = 0;
  for (const [id, rt] of loaded) {
    const many = (byProject.get(rt.projectId) ?? []).length > 1;
    const settings = new Map(rt.participants.map((p) => [p.id, !!p.loadProjectSettings]));

    const dir = oldConvDir(id);
    if (existsSync(dir)) {
      for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json'))) {
        const conv = JSON.parse(await readFile(path.join(dir, f), 'utf8')) as
          Conversation & { roundtableId?: string };
        conv.projectId = rt.projectId;
        delete conv.roundtableId;
        if (many && rt.name.trim()) conv.title = `${rt.name.trim()} — ${conv.title}`;
        conv.slug = slugify(conv.title);

        for (const p of conv.participants ?? []) {
          p.loadProjectSettings ??= settings.get(p.id) ?? WANTS_PROJECT_CONTEXT.has(p.id);
        }

        // The drafts move with it, and the recorded paths have to follow.
        const from = oldStagingDir(id, conv.id);
        const to = stagingDir(rt.projectId, conv.id);
        if (existsSync(from)) {
          await mkdir(path.dirname(to), { recursive: true });
          await cp(from, to, { recursive: true });
          for (const a of conv.artifacts ?? []) {
            if (a.stagedPath?.startsWith(from)) {
              a.stagedPath = path.join(to, path.basename(a.stagedPath));
            }
          }
        }

        await writeJson(convFile(rt.projectId, conv.id), conv);
      }
    }

    // The name was the user's, so it is written down rather than dropped silently.
    if (rt.name.trim()) {
      await mkdir(projectDataDir(rt.projectId), { recursive: true });
      await writeFile(path.join(projectDataDir(rt.projectId), 'roundtable.migrated.txt'),
                      `${rt.name.trim()}\n`, { flag: 'a' });
    }
    n += 1;
  }

  await rename(ROUNDTABLES_DIR, `${ROUNDTABLES_DIR}.migrated`);
  return n;
}
