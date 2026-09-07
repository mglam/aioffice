/** Language of the agent-facing protocol. The UI has its own, separate locale. */
export type Locale = 'en' | 'es';

export type Project = {
  id: string;
  name: string;
  path: string;
  /**
   * What this product is, in a few words, for EVERY participant.
   *
   * Not the same as CLAUDE.md: that one is implementation detail and only the technical
   * profiles receive it. Without this frame, a roundtable of domain personas ends up
   * discussing the domain instead of the product.
   */
  frame?: string;
  /**
   * Which language the agents are addressed in. Pick the one the personas in
   * `.claude/agents/` are written in — a Spanish persona under an English protocol
   * gets a mixed-language system prompt.
   */
  locale?: Locale;
};

export type ArtifactType =
  'plan' | 'requirements' | 'proposal' | 'review' | 'decisions';

/** A participant as discovered from the project — no per-roundtable state. */
export type ParticipantDef = {
  id: string;
  /** Short name, for the UI and the transcript. */
  label: string;
  description: string;
  /** Body of the .md = the persona's system prompt. Empty for the claude-code built-in. */
  body: string;
  /** Tools declared in the frontmatter (already normalized). */
  declaredTools: string[];
  /**
   * What a role varies on. Declared per archetype as `param-<id>: <kind> | <label> | <options>`,
   * and only legitimate when two personas of the same archetype with different values would
   * actually contradict each other at the table — otherwise it is decoration.
   */
  params: ArchetypeParam[];
  /** The values chosen for a generated persona, read back from its `tuning-*` frontmatter. */
  tuning: Record<string, string>;
  /**
   * Which archetype this persona fills, from the frontmatter. Only set on personas the app
   * generated — their id is the person's name, so this is what says which role that person is
   * covering.
   */
  role?: string;
  /**
   * Which project this persona was written for, when it is not a general one. Absent means
   * global: offered everywhere. A scoped one is only offered at that project, because the repo
   * is what decided its knobs.
   */
  project?: string;
  /**
   * Archetypes only: where this role belongs by default, so the form opens on the right answer.
   * `project` for the roles that are nobody in the abstract — a product manager in general is
   * nobody — and `global` for the ones whose usefulness is the craft, like sales.
   */
  scope?: 'global' | 'project';
  /** From the global pool rather than the project's own `.claude/agents/`. */
  pooled?: boolean;
  /**
   * A name the app invented for a persona whose own file gives none, so the others can address
   * them. Stored in the app's data, never in the user's repo, and told to the agent on every turn
   * — otherwise it would be a name everyone uses except the person answering to it.
   */
  person?: string;
  /**
   * Other names this role goes by, from the frontmatter. Only meaningful for an **archetype**,
   * where it is what lets the setup flow notice that a project's `vendedor` already covers
   * `sales` — matched by equality or as a prefix, so `especialista` covers a longer id.
   */
  aliases: string[];
  model?: string;
  /** True only for the built-in participant: Claude Code with no persona. */
  builtin: boolean;
  sourceFile?: string;
};

/** One knob on a role. `text` is free-form; `choice` offers `options` and still accepts none. */
export type ArchetypeParam = {
  id: string;
  kind: 'choice' | 'text';
  /** English, from the archetype file. The locale packs override it for display. */
  label: string;
  /** `choice` only: what to pick from. */
  options: string[];
  /** `text` only: examples, shown as the placeholder. */
  hint?: string;
};

export type ToolCall = { name: string; summary: string };

/** Phases of a session. The app tells each agent which one it is in. */
export type Phase = 'open' | 'cross' | 'close';

/**
 * The declared vocabulary of a turn, parsed out of the fenced block that closes it.
 * See `markers.ts` for the wire format in each language.
 */
export type Markers = {
  /** Who it puts on the spot, and about what. The app hands that person the turn. */
  asks: Array<{ to: string; about: string }>;
  /** What this participant considers settled. */
  agreements: string[];
  /** What stops them from agreeing. While blockers stand, the roundtable has not closed. */
  blockers: string[];
  /** Own blockers being withdrawn. Without this the board lies. */
  lifts: string[];
  /** Declared they have nothing more to add. */
  closes: boolean;
};

/** Running state, derived from the transcript. Injected into every turn. */
export type Board = {
  agreements: Array<{ by: string; text: string }>;
  blockers: Array<{ by: string; text: string }>;
  closed: string[];
  pending: Array<{ to: string; from: string; about: string }>;
};

export type TranscriptEntry = {
  i: number;
  ts: string;
  role: 'moderator' | 'agent' | 'system';
  participantId?: string;
  text: string;
  toolCalls?: ToolCall[];
  costUsd?: number;
  tokens?: { in: number; out: number };
  error?: string;
  /**
   * The turn was cut by the moderator, as opposed to having failed. Structural rather than
   * sniffed out of `error`, whose wording depends on the locale.
   */
  cut?: boolean;
  phase?: Phase;
  markers?: Markers;
};

export type ArtifactRef = {
  id: string;
  type: ArtifactType;
  /** Proposed file name, e.g. `work-plan.md`. */
  file: string;
  createdAt: string;
  participantId: string;
  /** Where it lives while you review it: always inside the app, never in your repo. */
  stagedPath: string;
  /** Where it landed in the project, if you published it. */
  publishedPath?: string;
  publishedAt?: string;
  /** Blockers still standing when it was written. Any at all means it had not closed. */
  openBlocks?: number;
};

/**
 * A **conversation** is one topic, and it owns everything about it: the question, the
 * deliverables, the chair, who sits, and the transcript.
 *
 * There used to be a **roundtable** between the project and this — a standing group that owned
 * "who sits". It was removed once the people themselves became global or project-scoped: the
 * group had nothing left to own that was not better owned by the project (its history) or by the
 * topic (who actually speaks about it). See CLAUDE.md.
 */
export type Conversation = {
  id: string;
  projectId: string;
  title: string;
  slug: string;
  /** Context for this topic: what to know before weighing in. */
  brief: string;
  /** The decision to be made. Without it, nothing converges. */
  question: string;
  /** What this conversation was opened to produce. */
  deliverables: ArtifactType[];
  createdAt: string;
  /** When the participants considered it closed. */
  closedAt?: string;
  /**
   * Who runs this conversation. If set, they are the only one who asks: everyone else
   * answers and hands the turn back. Unset = open conversation, anyone may ask anyone.
   */
  orchestrator?: string;
  participants: ConversationParticipant[];
  transcript: TranscriptEntry[];
  artifacts: ArtifactRef[];
};

/**
 * How much work a participant puts into a turn.
 *
 * Two mechanisms under one control, because only one of them is a real parameter:
 *
 * - **`effort`** is an SDK option (`'low' | 'medium' | 'high' | …`, default `high`) and it is the
 *   load-bearing half: it decides how much reasoning happens before the answer. This is the
 *   difference between a salesperson saying whether something is sellable and a specialist going
 *   to the standards.
 * - **a length line in the prompt**, because the Agent SDK exposes no `max_tokens` — that is a
 *   Messages API parameter and it is not among the SDK's options. So the budget is asked for, not
 *   enforced. Soft, and it works; do not describe it as a cap.
 */
export type Depth = 'quick' | 'medium' | 'full';

export type ConversationParticipant = {
  id: string;
  sessionId?: string;
  lastSeenIndex: number;
  enabled: boolean;
  /** Load the repo's CLAUDE.md. Technical profiles only. */
  loadProjectSettings: boolean;
  /** Overrides whatever the persona's own file declares. Unset = the persona decides. */
  model?: string;
  /** Unset behaves as `full`: the SDK's own default effort and no length asked for. */
  depth?: Depth;
  costUsd: number;
};
