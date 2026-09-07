import type {
  ArtifactType, Board, Conversation, Locale, ParticipantDef, Phase, Project,
  TranscriptEntry,
} from '../types.js';
import type { PromptStrings } from './strings.js';
import { en } from './en.js';
import { es } from './es.js';

export type { PromptStrings } from './strings.js';

const PACKS: Record<Locale, PromptStrings> = { en, es };

/** English is the default: an unset project locale is not an error. */
export const stringsFor = (locale?: Locale): PromptStrings => PACKS[locale ?? 'en'] ?? en;

/** The protocol appended to every participant's system prompt, in one language. */
export const protocolFor = (locale?: Locale): string => stringsFor(locale).protocol;

/** What is expected of a turn, by phase. */
export const phaseBrief = (locale?: Locale): Record<Phase, string> => stringsFor(locale).phase;

/** Title, file name and instructions for one deliverable. */
export const artifactSpec = (type: ArtifactType, locale?: Locale) =>
  stringsFor(locale).artifacts[type];

/**
 * The deliverables that exist, and the order the UI lists them in. Single source of truth
 * for *which* types there are; their display names come from the web's own locale files,
 * so the UI can be in a different language than the agents.
 */
export const ARTIFACT_TYPES: ArtifactType[] =
  ['plan', 'requirements', 'proposal', 'review', 'decisions'];

/** Full system prompt for one participant. */
export function buildSystemPrompt(
  def: ParticipantDef,
  claudeMd: string | null,
  locale?: Locale,
  /** How long an answer this seat was asked for. Absent means as long as it takes. */
  length?: string,
): string | { type: 'preset'; preset: 'claude_code'; append: string } {
  const s = stringsFor(locale);
  // Right after the protocol, and *before* the CLAUDE.md: appended last it would sit under
  // thousands of lines of someone else's document, which is where instructions go to die. The
  // length budget rides with it, for the same reason.
  const protocol = [
    protocolFor(locale),
    s.answerLanguage,
    // Only when the app invented it. A persona that names itself already says so in its own body,
    // which *is* the system prompt.
    def.person ? s.yourName(def.person) : undefined,
    length,
  ].filter(Boolean).join('\n\n');
  const projectContext = claudeMd
    ? `\n\n---\n\n# Project context (CLAUDE.md)\n\n${claudeMd}`
    : '';

  // The built-in IS Claude Code: there the preset is exactly what we want.
  if (def.builtin) {
    return { type: 'preset', preset: 'claude_code', append: protocol + projectContext };
  }

  // For personas the claude_code preset overrides the identity (measured): the agent
  // introduces itself as "Claude Code" instead of as its character.
  return `${def.body}\n\n${protocol}${projectContext}`;
}

/**
 * The board. This is what keeps every agent from re-litigating from scratch: it sees what
 * is already agreed and is explicitly told not to go back over it.
 */
function renderBoard(board: Board, conv: Conversation, selfId: string, s: PromptStrings): string {
  const parts: string[] = [s.board.heading];

  if (conv.question.trim()) parts.push(s.board.question(conv.question.trim()));

  if (board.agreements.length) {
    parts.push(s.board.agreed(
      board.agreements.map((a) => `- ${a.text}  *(${a.by})*`).join('\n')));
  }

  if (board.blockers.length) {
    parts.push(s.board.blockers(
      board.blockers.map((b) => `- ${b.text}  *(${b.by})*`).join('\n')));
  }

  const forMe = board.pending.filter((p) => p.to === selfId);
  if (forMe.length) {
    parts.push(s.board.askedOfYou(forMe.map((p) => `- ${p.from}: ${p.about}`).join('\n')));
  }

  const others = board.closed.filter((c) => c !== selfId);
  if (others.length) parts.push(s.board.alreadyClosed(others.join(', ')));

  return parts.length > 1 ? parts.join('\n\n') : '';
}

/** What the conversation was opened to produce, in prose. The goal, not a file list. */
export function deliverableNames(conv: Conversation, locale?: Locale): string {
  const s = stringsFor(locale);
  const names = (conv.deliverables ?? [])
    .map((t) => s.artifacts[t]?.title.toLowerCase())
    .filter(Boolean);
  return names.length ? s.joinNames(names) : '';
}

function speakerLabel(
  entry: TranscriptEntry, defs: Map<string, ParticipantDef>, s: PromptStrings,
): string {
  if (entry.role === 'moderator') return s.speaker.moderator;
  if (entry.role === 'system') return s.speaker.system;
  const def = entry.participantId ? defs.get(entry.participantId) : undefined;
  if (!def) return entry.participantId ?? s.speaker.unknown;
  return `${def.id} — ${def.label}`;
}

/**
 * Instructions that depend on who hands out the turn.
 *
 * In an open conversation anyone can ask, and that makes almost everyone ask: nobody owns
 * the thread, so each participant pushes their own way. With a chair, whoever answers only
 * has to answer — which is far easier and yields fuller answers.
 *
 * Takes the chair's id rather than the conversation, because it is the only thing needed
 * and that keeps the wording independent of where the chair happens to be stored.
 */
export function orchestrationBrief(
  chair: string | undefined, selfId: string, defs: Map<string, ParticipantDef>,
  locale?: Locale,
): string {
  if (!chair) return '';
  const s = stringsFor(locale);

  if (chair === selfId) return s.orchestration.youRun.join('\n\n');

  const def = defs.get(chair);
  const who = def ? `**${chair}** (${def.label})` : `**${chair}**`;
  return s.orchestration.someoneElseRuns(who).join('\n\n');
}

/**
 * Turn prompt: only the DELTA since this participant's last turn. The accumulated context
 * of their own turns already lives in their SDK session.
 */
export function buildTurnPrompt(args: {
  conv: Conversation;
  def: ParticipantDef;
  defs: Map<string, ParticipantDef>;
  fromIndex: number;
  note?: string;
  roster: ParticipantDef[];
  phase?: Phase;
  board?: Board;
  project?: Project;
  /** Path to the project's history file, if there were earlier conversations. */
  history?: { path: string; conversations: number };
}): string {
  const { conv, def, defs, fromIndex, note, roster, phase, board, project, history } = args;
  const s = stringsFor(project?.locale);
  const isFirst = fromIndex === 0;
  const parts: string[] = [];

  parts.push(s.turn.headingConversation(conv.title));

  // Without this the discussion drifts to the domain: each persona has its role but nobody has
  // the product. The full CLAUDE.md doesn't do the job — it is implementation detail that drowns
  // the non-technical profiles. This is a paragraph, and it goes to everyone on every turn.
  //
  // It used to be three paragraphs, with only the first repeated after the opening turn. The
  // frame is now one paragraph, so that distinction had nothing left to distinguish.
  if (project?.frame?.trim()) {
    parts.push(`${s.turn.productHeading}\n\n${project.frame.trim()}`);
  }

  if (isFirst && history && history.conversations > 1) {
    parts.push(
      `${s.turn.historyHeading}\n\n${s.turn.history(history.conversations - 1, history.path)}`,
    );
  }

  if (isFirst) {
    if (conv.brief.trim()) parts.push(`${s.turn.briefHeading}\n\n${conv.brief.trim()}`);
    const others = roster.filter((p) => p.id !== def.id);
    if (others.length) {
      parts.push(
        `${s.turn.rosterHeading}\n\n` +
          others.map((p) => s.turn.rosterLine(p.id, p.label, p.description)).join('\n'),
      );
    }
  }

  // Own turns are filtered out: they already live in this participant's session. This is
  // what lets each of them, in a parallel round, catch up afterwards on what the others
  // said without rereading their own.
  const delta = conv.transcript.slice(fromIndex).filter((e) => e.participantId !== def.id);
  if (delta.length) {
    const header = isFirst ? s.turn.saidSoFar : s.turn.saidSinceYourTurn;
    parts.push(
      `## ${header}\n\n` +
        delta.map((e) => `**[${speakerLabel(e, defs, s)}]**\n${e.text.trim()}`).join('\n\n'),
    );
  }

  if (board) {
    const rendered = renderBoard(board, conv, def.id, s);
    if (rendered) parts.push(rendered);
  }

  // What the moderator said since the last turn is repeated here, outside the transcript.
  // Buried among everyone else's turns it carried the same weight as any other comment,
  // and the agents just carried on with their own thread.
  const fromChair = conv.transcript
    .slice(fromIndex)
    .filter((e) => e.role === 'moderator' && e.text.trim());

  const brief = orchestrationBrief(conv.orchestrator, def.id, defs, project?.locale);
  if (brief) parts.push(brief);

  const turn: string[] = [s.turn.yourTurn];

  if (fromChair.length) {
    turn.push(
      `${s.turn.chairHeading}\n\n` +
      fromChair.map((e) => e.text.trim().split('\n').map((l) => `> ${l}`).join('\n')).join('\n>\n') +
      `\n\n${s.turn.chairTail}`,
    );
  }

  if (phase) turn.push(s.phase[phase]);
  if (note?.trim() && !fromChair.some((e) => e.text.trim() === note.trim())) {
    turn.push(note.trim());
  }
  if (!phase && !note?.trim() && !fromChair.length) turn.push(s.turn.justSpeak);

  // The standing question must not override a live redirection.
  if (conv.question.trim() && !fromChair.length) {
    turn.push(s.turn.questionFocus(conv.question.trim()));
  } else if (conv.question.trim()) {
    turn.push(s.turn.questionDeferred(conv.question.trim()));
  }

  const goal = deliverableNames(conv, project?.locale);
  if (goal && !fromChair.length) turn.push(s.turn.deliverables(goal));

  turn.push(s.turn.dontForgetBlock(s.fence));
  parts.push(turn.join('\n\n'));

  return parts.join('\n\n');
}

/** Synthesis prompt. Runs on a fork of the session so as not to contaminate it. */
export function buildArtifactPrompt(
  type: ArtifactType, conv: Conversation, fromIndex: number,
  defs: Map<string, ParticipantDef>, selfId: string,
  locale?: Locale, board?: Board,
): string {
  const s = stringsFor(locale);
  const spec = s.artifacts[type];
  const parts: string[] = [];

  const pending = conv.transcript.slice(fromIndex).filter((e) => e.participantId !== selfId);
  if (pending.length) {
    parts.push(
      `${s.artifactPrompt.saidSinceYourTurn}\n\n` +
        pending.map((e) => `**[${speakerLabel(e, defs, s)}]**\n${e.text.trim()}`).join('\n\n'),
    );
  }

  parts.push(s.artifactPrompt.task(spec.title));
  parts.push(spec.instructions);

  if (conv.question.trim()) parts.push(s.artifactPrompt.mustAnswer(conv.question.trim()));

  // If it didn't close, the document says so up top. A deliverable that feigns consensus
  // where a blocker was standing is worse than no deliverable.
  if (board?.blockers.length) {
    parts.push(s.artifactPrompt.notClosed(
      board.blockers.map((b) => `- (${b.by}) ${b.text}`).join('\n')));
  }

  parts.push(s.artifactPrompt.format);

  return parts.join('\n\n');
}
