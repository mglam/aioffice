import type { ArtifactType, Phase } from '../types.js';

/**
 * Everything the agents are told, in one shape per language.
 *
 * The builders in `index.ts` hold the logic and stay in English; this holds the words.
 * Making it a type rather than a loose object is deliberate: a new locale that forgets a
 * piece fails to compile instead of silently sending an agent a half-translated prompt.
 *
 * Keep a locale's wording tuned as a whole. The ordering and the emphasis inside
 * `protocol` and `phase` are load-bearing — see the notes in CLAUDE.md before editing
 * either, and re-measure afterwards.
 */
export type PromptStrings = {
  /** Name of the fenced block agents close their turn with, e.g. ```roundtable */
  fence: string;

  /** Appended to every participant's system prompt. */
  protocol: string;

  /**
   * Told to a participant whose own file never named them: the app invented one so the table can
   * address them, and they have to answer to it.
   */
  yourName: (name: string) => string;

  /**
   * How long an answer is wanted, when the seat asks for a short one. There is no `max_tokens` in
   * the SDK, so this is asked for rather than enforced — which is also why it is worded as a
   * budget with a reason, not as a rule.
   */
  length: Record<'quick' | 'medium', string>;

  /**
   * The language to answer in, stated outright.
   *
   * It used to be implied — the protocol is written in the project's language, so the model
   * followed. That broke the moment the app's own personas became global and English: an English
   * persona is a lot of text, and implication is not an instruction. Saying it costs one line and
   * makes a Spanish project work with an English persona, which is what lets one pool serve every
   * project.
   */
  answerLanguage: string;

  /** What is expected of a turn, by phase of the session. */
  phase: Record<Phase, string>;

  /** Title, file name and writing instructions per deliverable. */
  artifacts: Record<ArtifactType, { title: string; file: string; instructions: string }>;

  /** How a speaker is labelled in the transcript handed to an agent. */
  speaker: { moderator: string; system: string; unknown: string };

  /** The running board, injected into every turn. */
  board: {
    heading: string;
    question: (q: string) => string;
    agreed: (lines: string) => string;
    blockers: (lines: string) => string;
    askedOfYou: (lines: string) => string;
    alreadyClosed: (who: string) => string;
  };

  /** Who hands out the turn, and what that means for this participant. */
  orchestration: {
    youRun: string[];
    someoneElseRuns: (who: string) => string[];
  };

  /** The turn prompt itself. */
  turn: {
    headingConversation: (title: string) => string;
    productHeading: string;
    historyHeading: string;
    history: (previous: number, path: string) => string;
    briefHeading: string;
    rosterHeading: string;
    rosterLine: (id: string, label: string, description: string) => string;
    saidSoFar: string;
    saidSinceYourTurn: string;
    yourTurn: string;
    chairHeading: string;
    chairTail: string;
    justSpeak: string;
    questionFocus: (q: string) => string;
    questionDeferred: (q: string) => string;
    deliverables: (goal: string) => string;
    dontForgetBlock: (fence: string) => string;
  };

  /** The synthesis prompt that produces a deliverable. */
  artifactPrompt: {
    saidSinceYourTurn: string;
    task: (title: string) => string;
    mustAnswer: (q: string) => string;
    notClosed: (lines: string) => string;
    format: string;
  };

  /**
   * Notes the app itself writes into the transcript. Agents read the transcript, so these
   * follow the project locale too.
   */
  systemNotes: {
    cutMidTurn: string;
    cutBeforeSpeaking: string;
    noAnswer: string;
    didNotClose: string;
    standingBlockers: string;
    notClosedBy: (who: string) => string;
    carryOnOrWrite: string;
    drafted: (who: string, title: string) => string;
  };

  /**
   * The roundtable's history file. Agents read this one off disk with their own tools, so
   * it follows the project locale like everything else they see.
   */
  historyDoc: {
    heading: (name: string) => string;
    intro: string;
    /** Who took part in one conversation. Per conversation now, not per group. */
    tookPart: (who: string) => string;
    chairedBy: (who: string) => string;
    conversations: (n: number) => string;
    none: string;
    closedOn: (date: string) => string;
    openWithBlockers: (n: number) => string;
    open: string;
    meta: (date: string, state: string, turns: number) => string;
    question: (q: string) => string;
    agreed: string;
    blocked: string;
    published: string;
  };

  /** Joins deliverable names into prose: "a, b and c". */
  joinNames: (names: string[]) => string;
};
