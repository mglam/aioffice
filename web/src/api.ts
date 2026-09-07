import type {
  ArtifactRef, ArtifactType, ArtifactTypeInfo, Board, Browse, Conversation, ConversationSummary,
  Archetype, Depth, GeneratedAgent, Locale, ParticipantDef, PathCheck, PersonaRef, Project,
  ProjectStats,
  TranscriptEntry,
} from './types';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  return body as T;
}

const json = (v: unknown) => JSON.stringify(v);

/** `:id` is the project. The roundtable level between the two is gone — see CLAUDE.md. */
const C = (projectId: string, cid: string) => `/api/projects/${projectId}/conversations/${cid}`;

export const api = {
  projects: () => call<{ projects: Project[] }>('/api/projects'),

  createProject: (body: { name: string; path: string; frame?: string; locale?: Locale }) =>
    call<{ project: Project }>('/api/projects', { method: 'POST', body: json(body) }),

  patchProject: (id: string, patch: {
    name?: string; path?: string; frame?: string; locale?: Locale;
  }) =>
    call<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', body: json(patch) }),

  projectStats: (id: string) => call<ProjectStats>(`/api/projects/${id}/stats`),

  /** The token has to be the id: the server verifies it. */
  deleteProject: (id: string) =>
    call<unknown>(`/api/projects/${id}?confirm=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** Folder picker. With no argument the server starts one level above its own root. */
  browse: (path?: string) =>
    call<Browse>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),

  validatePath: (path: string) =>
    call<PathCheck>('/api/projects/validate-path', { method: 'POST', body: json({ path }) }),

  /** Omit `locale` to let the agent detect it from the repo and report it back. */
  proposeFrame: (path: string, locale?: Locale) =>
    call<{ name: string; locale: Locale; frame: string; costUsd: number }>(
      '/api/projects/propose-frame', { method: 'POST', body: json({ path, locale }) }),

  artifactTypes: () => call<{ types: ArtifactTypeInfo[] }>('/api/artifact-types'),

  archetypes: () => call<{ archetypes: Archetype[] }>('/api/archetypes'),

  /**
   * The pool: the people the app has written, global rather than per project. Free.
   */
  personas: () => call<{ personas: PersonaRef[] }>('/api/personas'),

  /** One person per call: the client fans out and shows per-person progress. */
  createPersona: (body: {
    archetype: string; tuning?: Record<string, string>; replacing?: string;
    /** Write them for this project — offered only there, and its repo is read. */
    projectId?: string;
  }) => call<{ persona: GeneratedAgent }>('/api/personas', { method: 'POST', body: json(body) }),

  readPersona: (id: string) => call<{ markdown: string }>(`/api/personas/${id}`),

  /** Safe by construction: the pool is the app's own directory. */
  deletePersona: (id: string) => call<unknown>(`/api/personas/${id}`, { method: 'DELETE' }),

  /** Free: the names already invented for the repo's unnamed personas. */
  names: (projectId: string) =>
    call<{ names: Record<string, string> }>(`/api/projects/${projectId}/names`),

  /** One call, and it leaves alone anyone already named. */
  writeNames: (projectId: string) =>
    call<{ names: Record<string, string>; added: number; costUsd: number }>(
      `/api/projects/${projectId}/names`, { method: 'POST' }),

  participants: (projectId: string) =>
    call<{ participants: ParticipantDef[] }>(`/api/projects/${projectId}/participants`),

  // ── Conversations ────────────────────────────────────────────────────────
  conversations: (projectId: string) =>
    call<{ conversations: ConversationSummary[] }>(`/api/projects/${projectId}/conversations`),

  createConversation: (projectId: string, body: {
    title: string; participantIds: string[]; brief?: string; question?: string;
    deliverables?: ArtifactType[]; orchestrator?: string;
  }) =>
    call<{ conversation: Conversation }>(`/api/projects/${projectId}/conversations`,
      { method: 'POST', body: json(body) }),

  /** The same setup again, with an empty transcript. The original is left alone. */
  duplicateConversation: (projectId: string, cid: string) =>
    call<{ conversation: Conversation }>(`${C(projectId, cid)}/duplicate`, { method: 'POST' }),

  /** Same setup, nothing said. Cannot be undone — the caller asks first. */
  resetConversation: (projectId: string, cid: string) =>
    call<{ conversation: Conversation }>(`${C(projectId, cid)}/reset`, { method: 'POST' }),

  deleteConversation: (projectId: string, cid: string) =>
    call<unknown>(C(projectId, cid), { method: 'DELETE' }),

  conversation: (projectId: string, cid: string) =>
    call<{ conversation: Conversation; project: Project;
           participantDefs: ParticipantDef[]; board: Board;
           busy: boolean; autoRunning: boolean }>(`${C(projectId, cid)}`),

  patchConversation: (projectId: string, cid: string, patch: {
    title?: string; brief?: string; question?: string;
    deliverables?: ArtifactType[]; closed?: boolean; orchestrator?: string | null;
  }) => call<unknown>(C(projectId, cid), { method: 'PATCH', body: json(patch) }),

  setParticipant: (projectId: string, cid: string, pid: string, patch: {
    enabled?: boolean; loadProjectSettings?: boolean;
    /** Null clears it back to the persona's own declaration. */
    model?: string | null; depth?: Depth | null;
  }) =>
    call<unknown>(`${C(projectId, cid)}/participants/${pid}`,
      { method: 'PATCH', body: json(patch) }),

  /** Seats more people in a conversation that already exists. Nobody is ever removed. */
  seatMore: (projectId: string, cid: string, participantIds: string[]) =>
    call<{ added: number; conversation: Conversation }>(`${C(projectId, cid)}/participants`,
      { method: 'POST', body: json({ participantIds }) }),

  // ── Turns ────────────────────────────────────────────────────────────────
  moderator: (projectId: string, cid: string, text: string) =>
    call<{ entry: TranscriptEntry }>(`${C(projectId, cid)}/moderator`,
      { method: 'POST', body: json({ text }) }),

  round: (projectId: string, cid: string, participantIds: string[], note: string | undefined,
          mode: 'parallel' | 'sequential') =>
    call<{ entries: TranscriptEntry[] }>(`${C(projectId, cid)}/round`,
      { method: 'POST', body: json({ participantIds, note, mode }) }),

  session: (projectId: string, cid: string, participantIds: string[], note: string | undefined,
            rounds: number, force = false) =>
    call<{ started: boolean }>(`${C(projectId, cid)}/session`,
      { method: 'POST', body: json({ participantIds, note, rounds, force }) }),

  /** Stops whatever is occupying the conversation. */
  stop: (projectId: string, cid: string) =>
    call<{ stopping: boolean }>(`${C(projectId, cid)}/stop`, { method: 'POST' }),

  // ── Deliverables ─────────────────────────────────────────────────────────
  artifactContent: (projectId: string, cid: string, aid: string) =>
    call<{ artifact: ArtifactRef; markdown: string }>(`${C(projectId, cid)}/artifacts/${aid}`),

  publishArtifact: (projectId: string, cid: string, aid: string) =>
    call<{ artifact: ArtifactRef }>(`${C(projectId, cid)}/artifacts/${aid}/publish`,
      { method: 'POST' }),

  discardArtifact: (projectId: string, cid: string, aid: string) =>
    call<unknown>(`${C(projectId, cid)}/artifacts/${aid}`, { method: 'DELETE' }),

  streamUrl: (projectId: string, cid: string) => `${C(projectId, cid)}/stream`,
};

/** One hue per participant. Colour is how you recognize who is speaking, not decoration. */
const HUES = ['#1668b3', '#6a3d9a', '#0b7a6b', '#c0561a', '#8c1d48', '#4a6212',
              '#2f5d8a', '#8a5a1d'];

/**
 * Sequential by order of appearance within ONE conversation, not hashed: with a hash, two
 * participants at the same table can land on the same hue.
 *
 * The map resets when each conversation is opened. If it accumulated across conversations the
 * counter would wrap around HUES and two people seated together would end up the same
 * colour — the very problem this avoids, through another door.
 */
let assigned = new Map<string, string>();

export function hueFor(id: string): string {
  if (!assigned.has(id)) assigned.set(id, HUES[assigned.size % HUES.length]);
  return assigned.get(id)!;
}

/** Reassigns the hues for the conversation being opened. */
export function primeHues(ids: string[]): void {
  assigned = new Map();
  for (const id of ids) hueFor(id);
}
