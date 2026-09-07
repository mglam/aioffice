import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  ArtifactRef, ArtifactType, Board, Conversation, ParticipantDef, Project,
} from './types.js';
import { artifactSpec, buildArtifactPrompt } from './prompts/index.js';
import { getParticipant, stagingDir } from './store.js';
import { runTurn, type TurnEvent } from './turn.js';

export const AISPECS_DIR = 'AISPECS';

/** Never overwrites a file: `work-plan.md`, `work-plan-v2.md`, … */
function nextFreePath(dir: string, file: string): string {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let candidate = path.join(dir, file);
  let n = 1;
  while (existsSync(candidate)) {
    n += 1;
    candidate = path.join(dir, `${base}-v${n}${ext}`);
  }
  return candidate;
}

/** Strips the conversational preamble and ```markdown fences if the model added them. */
export function cleanMarkdown(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fence) text = fence[1].trim();
  const firstHeading = text.search(/^#\s+/m);
  if (firstHeading > 0) text = text.slice(firstHeading);
  return text.trim();
}

export async function generateArtifact(args: {
  conv: Conversation;
  type: ArtifactType;
  def: ParticipantDef;
  defs: Map<string, ParticipantDef>;
  projectDir: string;
  project: Project;
  /** If it carries standing blockers, the document has to say so. */
  board?: Board;
  onEvent?: (e: TurnEvent) => void;
}): Promise<{ artifact: ArtifactRef; markdown: string; costUsd: number }> {
  const { conv, type, def, defs, project, onEvent } = args;
  const spec = artifactSpec(type, project.locale);
  const cp = getParticipant(conv, def.id);

  const prompt = buildArtifactPrompt(
    type, conv, cp.lastSeenIndex, defs, def.id, project.locale, args.board);

  // fork: the synthesis request must not stay in the agent's conversational session, or
  // its next turn at the roundtable carries the tone of a document writer.
  const res = await runTurn({
    conv, cp, def, project, projectDir: args.projectDir,
    promptText: prompt, fork: true, maxBudgetUsd: 4.0, onEvent,
  });

  if (res.error) throw new Error(`Could not generate the deliverable: ${res.error}`);
  const markdown = cleanMarkdown(res.text);
  if (!markdown) throw new Error('The agent returned an empty document');

  // Staging: inside the app. The project repo is untouched until you publish.
  const dir = stagingDir(conv.projectId, conv.id);
  await mkdir(dir, { recursive: true });
  const staged = nextFreePath(dir, spec.file);

  const header =
    `<!-- ${conv.title} — ${new Date().toISOString()} — synthesized by: ${def.id} -->\n\n`;
  await writeFile(staged, header + markdown + '\n', 'utf8');

  cp.costUsd += res.costUsd;

  const artifact: ArtifactRef = {
    id: randomUUID(),
    type,
    file: path.basename(staged),
    createdAt: new Date().toISOString(),
    participantId: def.id,
    stagedPath: staged,
    openBlocks: args.board?.blockers.length || undefined,
  };
  conv.artifacts.push(artifact);

  return { artifact, markdown, costUsd: res.costUsd };
}

export function findArtifact(conv: Conversation, id: string): ArtifactRef {
  const a = conv.artifacts.find((x) => x.id === id);
  if (!a) throw new Error('That document is not in this conversation');
  return a;
}

export async function readArtifact(conv: Conversation, id: string): Promise<string> {
  const a = findArtifact(conv, id);
  if (!existsSync(a.stagedPath)) throw new Error('The draft file is gone');
  return readFile(a.stagedPath, 'utf8');
}

/** Copies the draft into the project repo. The only write outside the app. */
export async function publishArtifact(
  conv: Conversation, project: Project, id: string,
): Promise<ArtifactRef> {
  const a = findArtifact(conv, id);
  if (a.publishedPath) throw new Error(`Already published at ${a.publishedPath}`);
  if (!existsSync(a.stagedPath)) throw new Error('The draft file is gone');

  const dir = path.join(project.path, AISPECS_DIR, conv.slug);
  await mkdir(dir, { recursive: true });
  const target = nextFreePath(dir, a.file);
  await copyFile(a.stagedPath, target);

  a.publishedPath = target;
  a.publishedAt = new Date().toISOString();
  return a;
}

/** Discards a draft. If it was published, the project's copy stays: that one is yours to delete. */
export async function discardArtifact(conv: Conversation, id: string): Promise<void> {
  const a = findArtifact(conv, id);
  await rm(a.stagedPath, { force: true });
  conv.artifacts = conv.artifacts.filter((x) => x.id !== id);
}

/**
 * Who gets each document by default, as an ordered list of candidate participant ids.
 *
 * A preference, not a rule: the first candidate actually seated wins, and if none are, the
 * UI lets you pick. It is a list rather than a single id so that projects whose agents are
 * named in another language still get a sensible default — add your own ids here.
 */
export const DEFAULT_AUTHORS: Record<ArtifactType, string[]> = {
  plan: ['claude-code'],
  requirements: ['pm', 'product-manager'],
  decisions: ['pm', 'product-manager'],
  proposal: ['sales', 'vendedor'],
  review: ['claude-code'],
};

/** First candidate that is actually seated, else whoever is first at the table. */
export function resolveAuthor(type: ArtifactType, seated: string[]): string {
  return DEFAULT_AUTHORS[type].find((id) => seated.includes(id)) ?? seated[0];
}
