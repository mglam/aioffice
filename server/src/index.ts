import path from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import {
  ROOT, browseDirectories, createProject, getProject, loadProjects, migrateProjectLocales,
  removeProject,
  updateProject,
  validateProjectPath,
} from './config.js';
import { proposeFrame } from './frame.js';
import {
  deletePersona, generatePersona, listPersonas, migratePersonaDescriptions,
  migratePersonasToPool, readPersona,
} from './personas.js';
import {
  archetypes, discoverParticipants, officeAgent, toAgentDefinition,
} from './participants.js';
import { generateNames, loadNames, NAMER } from './names.js';
import {
  boardOf, createConversation, deleteConversation, deleteProjectConversations,
  duplicateConversation, getParticipant, resetConversation,
  listConversations, loadConversation, migrateChairToConversation, migrateMesas, migrateRooms,
  migrateRoundtablesToProjects, projectStats, saveConversation, seatMore,
} from './store.js';
import { historyPath, writeHistory } from './history.js';
import {
  addModeratorMessage, isAutoRunning, isBusy, makeArtifact, runSession, stopConversation,
  takeRound, takeTurn,
} from './orchestrator.js';
import {
  DEFAULT_AUTHORS, discardArtifact, findArtifact, publishArtifact, readArtifact, resolveAuthor,
} from './artifacts.js';
import { ARTIFACT_TYPES } from './prompts/index.js';
import { subscribe } from './bus.js';
import type { ArtifactType, Depth, Locale } from './types.js';

const DEPTHS: Depth[] = ['quick', 'medium', 'full'];

const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } });
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });

// On-disk layout migrations, oldest first. Every one is a no-op once it has run, and each is
// frozen against the layout it converts — see the note in store.ts.
const fromMesas = await migrateMesas();
if (fromMesas) app.log.info(`Migrated ${fromMesas} roundtable(s) from the data/mesas layout`);
const fromRooms = await migrateRooms();
if (fromRooms) app.log.info(`Migrated ${fromRooms} room(s) to the roundtable/conversation model`);
const stamped = await migrateProjectLocales();
if (stamped) app.log.info(`Set locale "es" on ${stamped} pre-existing project(s)`);
const rechaired = await migrateChairToConversation();
if (rechaired) {
  app.log.info(`Moved the chair onto the conversations of ${rechaired} roundtable(s); `
    + 'any non-empty purpose was saved to purpose.migrated.txt');
}

// Must run after the three above, which are what produce the roundtable tree it folds in.
const unnested = await migrateRoundtablesToProjects();
if (unnested) {
  app.log.info(`Folded ${unnested} roundtable(s) into their projects: conversations now hang off `
    + 'the project, the old tree is at data/roundtables.migrated, and each name was kept in '
    + 'roundtable.migrated.txt');
}

const pooled = await migratePersonasToPool((await loadProjects()).map((p) => p.path));
if (pooled) {
  app.log.info(`Moved ${pooled} generated persona(s) out of project repos into data/personas/; `
    + 'they are global now and offered to every project');
}

const relabelled = await migratePersonaDescriptions();
if (relabelled) {
  app.log.info(`Took the description of ${relabelled} persona(s) from their own heading, so the `
    + 'file is not half in one language and half in another');
}

// The history file is derived: if it is missing (migrated, or deleted by hand), rebuild it. It
// covers all of a project's conversations now, so there is one per project.
for (const p of await loadProjects()) {
  if (!existsSync(historyPath(p.id))) await writeHistory(p.id);
}

// ── Proyecto ───────────────────────────────────────────────────────────────

app.get('/api/projects', async () => {
  const projects = await loadProjects();
  // The UI warns when a project has no agents: there, only claude-code can be seated.
  return {
    projects: await Promise.all(projects.map(async (p) => ({
      ...p, ...(await validateProjectPath(p.path)),
    }))),
  };
});

app.post<{ Body: { path: string } }>('/api/projects/validate-path', async (req) =>
  validateProjectPath(req.body?.path ?? ''));

// Folder picker for the project form. Read-only and directories only; the app already
// binds to 127.0.0.1 and only ever reads paths the user points it at.
app.get<{ Querystring: { path?: string } }>('/api/browse', async (req, reply) => {
  try { return await browseDirectories(req.query.path); }
  catch (e) { return reply.code(400).send(fail(e)); }
});

app.post<{ Body: { path: string; locale?: Locale } }>(
  '/api/projects/propose-frame', async (req, reply) => {
  try { return await proposeFrame(req.body?.path ?? '', req.body?.locale); }
  catch (e) { return reply.code(400).send(fail(e)); }
});

app.post<{ Body: { name: string; path: string; frame?: string; locale?: Locale } }>(
  '/api/projects', async (req, reply) => {
    try { return { project: await createProject(req.body) }; }
    catch (e) { return reply.code(400).send(fail(e)); }
  });

app.patch<{ Params: { id: string }; Body: {
  name?: string; path?: string; frame?: string; locale?: Locale;
} }>(
  '/api/projects/:id', async (req, reply) => {
    try { return { project: await updateProject(req.params.id, req.body) }; }
    catch (e) { return reply.code(400).send(fail(e)); }
  });

app.get<{ Params: { id: string } }>('/api/projects/:id/stats', async (req, reply) => {
  try {
    await getProject(req.params.id);
    return await projectStats(req.params.id);
  } catch (e) { return reply.code(404).send(fail(e)); }
});

/**
 * Deletes the project and all its conversations. The token has to match the id, so a stray
 * click or an absent-minded `curl` doesn't take weeks of discussion with it. What is NOT
 * touched are the documents already published to `<project>/AISPECS/` — those are the user's.
 */
app.delete<{ Params: { id: string }; Querystring: { confirm?: string } }>(
  '/api/projects/:id', async (req, reply) => {
    try {
      if (req.query.confirm !== req.params.id) {
        throw new Error('Confirmation is missing, or does not match the project.');
      }
      const stats = await projectStats(req.params.id);
      await deleteProjectConversations(req.params.id);
      await removeProject(req.params.id);
      return { deleted: { project: req.params.id, ...stats } };
    } catch (e) { return reply.code(400).send(fail(e)); }
  });

// Which deliverables exist and who signs each by default. The display names live in the
// web's locale files, so the UI can be in a different language than the agents.
app.get('/api/artifact-types', async () => ({
  types: ARTIFACT_TYPES.map((type) => ({ type, defaultAuthors: DEFAULT_AUTHORS[type] })),
}));

// The role archetypes that ship with this repo. Read-only: the wizard diffs them against a
// project's existing agents to work out what is missing.
app.get('/api/archetypes', async () => ({
  archetypes: (await archetypes()).map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    aliases: a.aliases,
    scope: a.scope,
    params: a.params,
    tools: a.declaredTools,
    model: a.model,
  })),
}));

/**
 * Everyone the app has written: the global people and the ones written for a project. `project`
 * says which — absent means global — and the client groups on it. Free.
 */
app.get('/api/personas', async () => ({
  personas: (await listPersonas()).map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    role: d.role,
    project: d.project,
    tuning: d.tuning,
    model: d.model,
  })),
}));

/**
 * Writes one person. One per request so the client can fan out, show per-person progress, and let
 * someone spend on one before committing to several.
 *
 * A role can be filled more than once — three specialists who disagree beat one who does not —
 * so this always adds. Pass `replacing` with an id already in the pool to rewrite that one, and
 * `projectId` to write them for that project rather than globally.
 */
app.post<{ Body: {
  archetype: string; tuning?: Record<string, string>; replacing?: string; projectId?: string;
} }>('/api/personas', async (req, reply) => {
  try {
    const out = await generatePersona({
      archetype: req.body?.archetype,
      tuning: req.body?.tuning,
      replacing: req.body?.replacing,
      projectId: req.body?.projectId,
    });
    return { persona: out };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.get<{ Params: { pid: string } }>('/api/personas/:pid', async (req, reply) => {
  try {
    return { markdown: await readPersona(req.params.pid) };
  } catch (e) { return reply.code(404).send(fail(e)); }
});

// Safe by construction: the pool is the app's own directory. A persona somebody wrote by hand in
// their repo is not reachable from here.
app.delete<{ Params: { pid: string } }>('/api/personas/:pid', async (req, reply) => {
  try {
    await deletePersona(req.params.pid);
    return { deleted: req.params.pid };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.get<{ Params: { id: string } }>('/api/projects/:id/names', async (req, reply) => {
  try {
    await getProject(req.params.id);
    return { names: await loadNames(req.params.id) };
  } catch (e) { return reply.code(404).send(fail(e)); }
});

app.post<{ Params: { id: string } }>('/api/projects/:id/names', async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const namer = await officeAgent(NAMER);
    const out = await generateNames(project, await discoverParticipants(project),
                                    toAgentDefinition(namer));
    return out;
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.get<{ Params: { id: string } }>('/api/projects/:id/participants', async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const defs = await discoverParticipants(project);
    // The body is the full system prompt: no need to ship it to the UI.
    return { participants: defs.map(({ body, ...rest }) => ({ ...rest, promptChars: body.length })) };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

// ── Conversations ──────────────────────────────────────────────────────────
//
// `:id` is the project. There used to be a roundtable in between, owning who sits; the
// conversation owns that now, so the path lost a level and the handlers barely changed.

app.get<{ Params: { id: string } }>('/api/projects/:id/conversations', async (req, reply) => {
  try { return { conversations: await listConversations(req.params.id) }; }
  catch (e) { return reply.code(404).send(fail(e)); }
});

app.post<{ Params: { id: string }; Body: {
  title: string; participantIds: string[]; brief?: string; question?: string;
  deliverables?: ArtifactType[]; orchestrator?: string;
} }>('/api/projects/:id/conversations', async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const ids = req.body.participantIds;
    if (!ids?.length) throw new Error('Pick at least one participant');
    const defs = await discoverParticipants(project);
    const unknown = ids.filter((id) => !defs.some((d) => d.id === id));
    if (unknown.length) throw new Error(`Unknown participants: ${unknown.join(', ')}`);

    const conv = await createConversation({ ...req.body, projectId: project.id });
    await writeHistory(project.id);
    return { conversation: conv };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

const C = '/api/projects/:id/conversations/:cid';

app.get<{ Params: { id: string; cid: string } }>(C, async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const conv = await loadConversation(project.id, req.params.cid);
    const defs = await discoverParticipants(project);
    return {
      conversation: conv, project,
      participantDefs: defs.map(({ body, ...rest }) => ({ ...rest, promptChars: body.length })),
      board: boardOf(conv),
      busy: isBusy(conv.id),
      autoRunning: isAutoRunning(conv.id),
    };
  } catch (e) { return reply.code(404).send(fail(e)); }
});

app.patch<{ Params: { id: string; cid: string }; Body: {
  title?: string; brief?: string; question?: string; deliverables?: ArtifactType[];
  closed?: boolean; orchestrator?: string | null;
} }>(C, async (req, reply) => {
  try {
    const conv = await loadConversation(req.params.id, req.params.cid);
    if (typeof req.body.title === 'string' && req.body.title.trim()) conv.title = req.body.title.trim();
    if (typeof req.body.brief === 'string') conv.brief = req.body.brief;
    if (typeof req.body.question === 'string') conv.question = req.body.question.trim();
    if (Array.isArray(req.body.deliverables)) conv.deliverables = req.body.deliverables;
    if (typeof req.body.closed === 'boolean') {
      conv.closedAt = req.body.closed ? (conv.closedAt ?? new Date().toISOString()) : undefined;
    }
    // Null, or anyone not seated, means an open conversation. Someone seated but *taken out* is
    // a different thing — that is a mistake worth a message, since silently opening the
    // conversation is not what the request asked for.
    if (req.body.orchestrator !== undefined) {
      const o = req.body.orchestrator;
      const seat = o ? conv.participants.find((p) => p.id === o) : undefined;
      if (seat && !seat.enabled) {
        throw new Error(`"${o}" is not taking part in this conversation, so they cannot run it.`);
      }
      conv.orchestrator = seat ? o! : undefined;
    }
    await saveConversation(conv);
    await writeHistory(conv.projectId);
    return { conversation: conv };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

/**
 * The same conversation again, empty. Copies the setup and none of the history — see
 * `duplicateConversation` for what is left behind and why it is a copy rather than a reset.
 */
app.post<{ Params: { id: string; cid: string } }>(`${C}/duplicate`, async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const conv = await duplicateConversation(project.id, req.params.cid);
    await writeHistory(project.id);
    return { conversation: conv };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

/**
 * Wipes it and keeps the setup. Destructive and unconfirmable from here — the client asks, and
 * anything already published to the repo is left alone.
 */
app.post<{ Params: { id: string; cid: string } }>(`${C}/reset`, async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    if (isBusy(req.params.cid)) throw new Error('The conversation is busy: stop it first');
    const conv = await resetConversation(project.id, req.params.cid);
    await writeHistory(project.id);
    return { conversation: conv };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.delete<{ Params: { id: string; cid: string } }>(C, async (req, reply) => {
  try {
    await deleteConversation(req.params.id, req.params.cid);
    await writeHistory(req.params.id);
    return { deleted: req.params.cid };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.patch<{ Params: { id: string; cid: string; pid: string }; Body: {
  enabled?: boolean; loadProjectSettings?: boolean; model?: string | null; depth?: Depth | null;
} }>(`${C}/participants/:pid`, async (req, reply) => {
  try {
    const conv = await loadConversation(req.params.id, req.params.cid);
    const cp = getParticipant(conv, req.params.pid);
    // A chair that cannot speak leaves the conversation running leaderless while the interface
    // still shows one. Take the chair off them first, or hand it to somebody else.
    if (req.body.enabled === false && conv.orchestrator === cp.id) {
      throw new Error(`"${cp.id}" runs this conversation. Move the chair before taking them out.`);
    }
    if (typeof req.body.enabled === 'boolean') cp.enabled = req.body.enabled;
    // Was the roundtable's only per-participant setting; it lives on the seat now.
    if (typeof req.body.loadProjectSettings === 'boolean') {
      cp.loadProjectSettings = req.body.loadProjectSettings;
    }
    // Null clears it, which is not the same as leaving it alone: cleared means "whatever the
    // persona's own file says" for the model, and "as long as it takes" for the depth.
    if (req.body.model !== undefined) cp.model = req.body.model || undefined;
    if (req.body.depth !== undefined) {
      cp.depth = DEPTHS.includes(req.body.depth as Depth) ? req.body.depth as Depth : undefined;
    }
    await saveConversation(conv);
    return { participant: cp };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

/**
 * Seats more people in a conversation that already exists — which used to be refused. A fresh
 * seat has seen nothing and holds no session, the same state everyone starts in, so their first
 * turn receives the transcript so far as its delta. Nobody is ever removed: their turns are in
 * the transcript, and `enabled: false` is how you take someone out of the rotation.
 */
app.post<{ Params: { id: string; cid: string }; Body: { participantIds: string[] } }>(
  `${C}/participants`, async (req, reply) => {
    try {
      const project = await getProject(req.params.id);
      const conv = await loadConversation(project.id, req.params.cid);
      const ids = req.body.participantIds ?? [];
      const defs = await discoverParticipants(project);
      const unknown = ids.filter((id) => !defs.some((d) => d.id === id));
      if (unknown.length) throw new Error(`Unknown participants: ${unknown.join(', ')}`);

      const added = seatMore(conv, ids);
      if (added) { await saveConversation(conv); await writeHistory(project.id); }
      return { added, conversation: conv };
    } catch (e) { return reply.code(400).send(fail(e)); }
  });

// ── Turnos ─────────────────────────────────────────────────────────────────

const seated = (conv: Awaited<ReturnType<typeof loadConversation>>, ids?: string[]) =>
  ids?.length ? ids : conv.participants.filter((p) => p.enabled).map((p) => p.id);

app.post<{ Params: { id: string; cid: string }; Body: { text: string } }>(
  `${C}/moderator`, async (req, reply) => {
    try {
      return { entry: await addModeratorMessage(req.params.id, req.params.cid, req.body.text) };
    } catch (e) { return reply.code(400).send(fail(e)); }
  });

app.post<{ Params: { id: string; cid: string }; Body: { participantId: string; note?: string } }>(
  `${C}/turn`, async (req, reply) => {
    try {
      const project = await getProject(req.params.id);
      return {
        entry: await takeTurn(project.id, req.params.cid, project,
                              req.body.participantId, req.body.note),
      };
    } catch (e) { return reply.code(400).send(fail(e)); }
  });

app.post<{ Params: { id: string; cid: string }; Body: {
  participantIds?: string[]; note?: string; mode?: 'parallel' | 'sequential';
} }>(`${C}/round`, async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const conv = await loadConversation(project.id, req.params.cid);
    const entries = await takeRound(project.id, conv.id, project,
      seated(conv, req.body.participantIds), req.body.note, req.body.mode ?? 'parallel');
    return { entries };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.post<{ Params: { id: string; cid: string }; Body: {
  participantIds?: string[]; note?: string; rounds?: number;
  artifacts?: ArtifactType[]; force?: boolean;
} }>(`${C}/session`, async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const conv = await loadConversation(project.id, req.params.cid);
    if (isBusy(conv.id)) throw new Error('The conversation is busy: stop it first');

    /**
     * Neither a question nor a deliverable is required, and both guards that used to be here
     * were wrong about `runSession`:
     *
     * - **No question.** `converged()` never looks at one — it is closed + nothing pending + no
     *   blockers — and every use of the question in the prompts is already guarded by
     *   `conv.question.trim()`. So a session with no question converges on producing what it was
     *   opened to produce, which is what the deliverables are for.
     * - **No deliverables.** Then it converges and writes nothing, which is exactly "let them
     *   talk until they are done, but don't spend on documents". That used to be a separate
     *   engine (`takeAuto`); unticking the deliverables is a better control than a second mode,
     *   because it is the same list you would have unticked anyway.
     */
    const wanted = req.body.artifacts ?? conv.deliverables;

    void runSession(project.id, conv.id, project, seated(conv, req.body.participantIds),
                    req.body.note, req.body.rounds ?? 4, wanted, req.body.force === true)
      .catch((e) => app.log.error({ err: e }, 'session interrupted'));

    return { started: true };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.post<{ Params: { cid: string } }>(`${C}/stop`, async (req) =>
  ({ stopping: stopConversation(req.params.cid) }));

// ── Entregables ────────────────────────────────────────────────────────────

app.post<{ Params: { id: string; cid: string }; Body: {
  type: ArtifactType; participantId?: string;
} }>(`${C}/artifacts`, async (req, reply) => {
  try {
    const project = await getProject(req.params.id);
    const conv = await loadConversation(project.id, req.params.cid);
    const author = req.body.participantId
      ?? resolveAuthor(req.body.type, conv.participants.map((p) => p.id));
    if (!conv.participants.some((p) => p.id === author)) {
      throw new Error(`"${author}" is not in this conversation; pick another author`);
    }
    const out = await makeArtifact(project.id, conv.id, project, req.body.type, author);
    return { artifact: out.artifact, markdown: out.markdown };
  } catch (e) { return reply.code(400).send(fail(e)); }
});

app.get<{ Params: { id: string; cid: string; aid: string } }>(
  `${C}/artifacts/:aid`, async (req, reply) => {
    try {
      const conv = await loadConversation(req.params.id, req.params.cid);
      return {
        artifact: findArtifact(conv, req.params.aid),
        markdown: await readArtifact(conv, req.params.aid),
      };
    } catch (e) { return reply.code(404).send(fail(e)); }
  });

// The only write outside the app, and always on an explicit request.
app.post<{ Params: { id: string; cid: string; aid: string } }>(
  `${C}/artifacts/:aid/publish`, async (req, reply) => {
    try {
      const project = await getProject(req.params.id);
      const conv = await loadConversation(project.id, req.params.cid);
      const artifact = await publishArtifact(conv, project, req.params.aid);
      await saveConversation(conv);
      await writeHistory(project.id);
      return { artifact };
    } catch (e) { return reply.code(400).send(fail(e)); }
  });

app.delete<{ Params: { id: string; cid: string; aid: string } }>(
  `${C}/artifacts/:aid`, async (req, reply) => {
    try {
      const conv = await loadConversation(req.params.id, req.params.cid);
      await discardArtifact(conv, req.params.aid);
      await saveConversation(conv);
      await writeHistory(conv.projectId);
      return { discarded: true };
    } catch (e) { return reply.code(400).send(fail(e)); }
  });

// ── Stream ─────────────────────────────────────────────────────────────────

app.get<{ Params: { cid: string } }>(`${C}/stream`, async (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  reply.raw.write(': connected\n\n');

  // The first thing sent is the real busy state. Without it, a reconnecting client
  // (laptop slept, server restarted, network dropped) is left
  // holding the stale `busy`: the UI blocks every action and nothing can unblock it.
  reply.raw.write(`data: ${JSON.stringify({
    type: 'busy', busy: isBusy(req.params.cid),
  })}\n\n`);

  const unsubscribe = subscribe(req.params.cid, (e) => {
    reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
  });
  const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15000);

  req.raw.on('close', () => { clearInterval(ping); unsubscribe(); });
  return reply;
});

// ── Front ──────────────────────────────────────────────────────────────────

const WEB_DIST = path.join(ROOT, 'web', 'dist');
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' })
                                : reply.sendFile('index.html'));
}

const PORT = Number(process.env.PORT ?? 5174);
await app.listen({ port: PORT, host: '127.0.0.1' });
