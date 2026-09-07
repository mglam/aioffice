/** Language the agents are addressed in. The UI has its own, separate locale. */
export type Locale = 'en' | 'es';

export type Project = {
  id: string; name: string; path: string; frame?: string; locale?: Locale;
  /** Added by `GET /api/projects`: with no agents, only claude-code can be seated. */
  hasAgents?: boolean; agentCount?: number;
};

export type PathCheck = {
  ok: boolean; isProject: boolean; hasClaudeMd: boolean;
  hasAgents: boolean; agentCount: number; error?: string;
};

/** One directory in the project folder picker. */
export type DirEntry = {
  name: string; path: string; hasAgents: boolean;
  /** Has a CLAUDE.md — the best material the frame writer can get. */
  hasClaudeMd: boolean;
  /** Looks like a codebase root, so it can be selected. */
  selectable: boolean;
  /** A selectable folder exists below. A hint: it is enterable either way. */
  leadsTo: boolean;
};

/** Everything readable, nothing hidden: what is not a project is greyed, not removed. */
export type Browse = { path: string; parent: string | null; entries: DirEntry[] };

export type ProjectStats = { conversations: number; artifacts: number };

/** One knob a role varies on. `choice` renders as a select, `text` as an input. */
export type ArchetypeParam = {
  id: string;
  kind: 'choice' | 'text';
  label: string;
  /** `choice` only. */
  options: string[];
  /** `text` only: examples, shown as the placeholder. */
  hint?: string;
};

/** A role archetype that ships with the app: the brief a persona is written from. */
export type Archetype = {
  id: string; label: string; description: string;
  /** Other names the role goes by, so a project's `vendedor` counts as covering `sales`. */
  aliases: string[];
  /** Where this role belongs by default: the form opens the scope select on it. */
  scope?: 'global' | 'project';
  /** What to ask before generating. Two people in one role differ by these. */
  params: ArchetypeParam[];
  tools: string[]; model?: string;
};

/** A persona the app just wrote into the pool. */
export type GeneratedAgent = {
  id: string; archetype: string; file: string; markdown: string; costUsd: number;
};

/**
 * Someone in the pool. Global: written once, seatable at any project. `id` is their name, `role`
 * the archetype they fill, `tuning` what they were made with — so regenerating starts from it.
 */
export type PersonaRef = {
  id: string; label: string; description: string;
  role?: string;
  /** Written for this project, and offered only there. Absent means global. */
  project?: string;
  tuning: Record<string, string>; model?: string;
};

export type ParticipantDef = {
  id: string; label: string; description: string; declaredTools: string[];
  /** Which archetype a generated persona fills. Its id is the person's name, so this says the seat. */
  role?: string;
  /** From the global pool rather than the project's own `.claude/agents/`. */
  pooled?: boolean;
  /** Written for one project, so offered only there. Pool entries only. */
  project?: string;
  /** A name the app invented because their own file gives none. Kept in the app's data. */
  person?: string;
  model?: string; builtin: boolean; sourceFile?: string; promptChars: number;
};

export type ToolCall = { name: string; summary: string };

export type Phase = 'open' | 'cross' | 'close';

export type Markers = {
  asks: Array<{ to: string; about: string }>;
  agreements: string[];
  blockers: string[];
  lifts: string[];
  closes: boolean;
};

export type Board = {
  agreements: Array<{ by: string; text: string }>;
  blockers: Array<{ by: string; text: string }>;
  closed: string[];
  pending: Array<{ to: string; from: string; about: string }>;
};

export type TranscriptEntry = {
  i: number; ts: string; role: 'moderator' | 'agent' | 'system';
  participantId?: string; text: string; toolCalls?: ToolCall[];
  costUsd?: number; tokens?: { in: number; out: number }; error?: string; cut?: boolean;
  phase?: Phase; markers?: Markers;
};

export type ArtifactType =
  'plan' | 'requirements' | 'proposal' | 'review' | 'decisions';

/** The server owns which types exist and who signs them; the labels live in the locale files. */
export type ArtifactTypeInfo = { type: ArtifactType; defaultAuthors: string[] };
export type ArtifactRef = {
  id: string; type: ArtifactType; file: string; createdAt: string; participantId: string;
  stagedPath: string; publishedPath?: string; publishedAt?: string; openBlocks?: number;
};

/**
 * How much work a seat puts into a turn. `effort` on the SDK side plus a length budget asked for
 * in the prompt — there is no `max_tokens` in the Agent SDK, so the budget is a request, not a
 * cap. `full` is the default and sets neither.
 */
export type Depth = 'quick' | 'medium' | 'full';

export type ConversationParticipant = {
  id: string; sessionId?: string; lastSeenIndex: number; enabled: boolean;
  /** Load the repo's CLAUDE.md. Technical profiles only. */
  loadProjectSettings: boolean;
  /** Overrides the persona's own file. Unset = whatever it declares. */
  model?: string;
  depth?: Depth;
  costUsd: number;
};

/**
 * One topic, owning everything about it — including who sits. There used to be a roundtable
 * between the project and this, whose only job was owning that; see CLAUDE.md.
 */
export type Conversation = {
  id: string; projectId: string; title: string; slug: string; brief: string; question: string;
  deliverables: ArtifactType[]; createdAt: string; closedAt?: string;
  /** Who chairs this conversation. Unset = open, anyone may ask anyone. */
  orchestrator?: string;
  participants: ConversationParticipant[];
  transcript: TranscriptEntry[]; artifacts: ArtifactRef[];
};

export type ConversationSummary = {
  id: string; projectId: string; title: string; slug: string; question: string;
  createdAt: string; closedAt?: string; orchestrator?: string;
  /** Seated ids, so the list can show who without loading each transcript. */
  participants: string[];
  turns: number; costUsd: number; artifacts: number;
};

export type StreamEvent =
  | { type: 'turn_start'; participantId: string }
  | { type: 'delta'; participantId: string; text: string }
  | { type: 'tool_use'; participantId: string; tool: ToolCall }
  | { type: 'turn_end'; participantId: string; text: string; costUsd: number;
      tokens: { in: number; out: number }; toolCalls: ToolCall[] }
  | { type: 'turn_error'; participantId: string; message: string }
  | { type: 'entry'; entry: TranscriptEntry }
  | { type: 'artifact'; artifact: ArtifactRef }
  | { type: 'conversation_updated' }
  | { type: 'auto_progress'; cycle: number; cycles: number; participantId: string }
  | { type: 'auto_stopping' }
  | { type: 'auto_done' }
  | { type: 'busy'; busy: boolean }
  | { type: 'session_progress'; round: number; rounds: number; phase: Phase; participantId: string }
  | { type: 'session_converged'; round: number }
  | { type: 'session_open'; blockers: number; notClosed: string[] }
  | { type: 'session_writing'; artifact: string; participantId: string }
  | { type: 'session_artifact_failed'; artifact: string; message: string };
