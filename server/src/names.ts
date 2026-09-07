import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { query, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { projectDataDir } from './store.js';
import { ROOT } from './base.js';
import type { ParticipantDef, Project } from './types.js';

/**
 * Names for personas whose own file gives none.
 *
 * A repo's hand-written agents are often titled by role — "El técnico del cliente" — and the
 * table cannot address a role. Someone who is only "the product manager" gets talked *about*
 * rather than *to*, which shows up in the transcripts.
 *
 * **The app cannot fix that in the file**: writing into `<project>/.claude/agents/` is the write
 * path the whole persona design exists to avoid. So the name is invented here and kept here, in
 * the app's own data, and handed to the agent on every turn — otherwise it would be a name
 * everyone uses except the person answering to it.
 *
 * Only ever a name. Nothing else about them is the app's to decide: whoever wrote that file said
 * everything else already.
 */
export const NAMER = 'namer';

const namesFile = (projectId: string) => path.join(projectDataDir(projectId), 'names.json');

export async function loadNames(projectId: string): Promise<Record<string, string>> {
  const file = namesFile(projectId);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, string>;
  } catch {
    // A hand-mangled file must not take the project down with it.
    return {};
  }
}

async function saveNames(projectId: string, names: Record<string, string>): Promise<void> {
  await mkdir(projectDataDir(projectId), { recursive: true });
  await writeFile(namesFile(projectId), `${JSON.stringify(names, null, 2)}\n`, 'utf8');
}

/** `id: Name` per line, and nothing else is trusted from the answer. */
function parseNames(text: string, known: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*[-*]?\s*([a-z0-9-]+)\s*:\s*(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const id = m[1].trim();
    const name = m[2].replace(/[*`_"]/g, '').trim();
    // The model decides who needs one; it does not get to invent participants.
    if (known.has(id) && name && name.length < 60) out[id] = name;
  }
  return out;
}

/**
 * Invents one for everybody at this project who lacks one, in a single call. Keeps whatever was
 * already decided: a name people have been reading in transcripts should not change under them.
 */
export async function generateNames(
  project: Project,
  defs: ParticipantDef[],
  /**
   * The namer, already resolved. Passed in rather than looked up here: `participants.ts` imports
   * `loadNames` from this file, so importing `officeAgent` back from there would close a cycle —
   * the exact shape of the bug `base.ts` exists to prevent.
   */
  namer: AgentDefinition,
): Promise<{ names: Record<string, string>; added: number; costUsd: number }> {
  const existing = await loadNames(project.id);
  /**
   * Anyone this has not been *asked* about, which is not the same as anyone without a name.
   * Someone whose own heading names them — "Elena Duarte — dueña de Fibra Andina" — correctly
   * gets nothing back, and keying on "has no name" would make them a candidate on every run: a
   * second click would pay for a call that cannot add anything. They are recorded with an empty
   * string instead, meaning *asked, has their own*.
   *
   * The app's own people are named by `agent-writer` when they are written, so they never qualify.
   */
  const candidates = defs.filter((d) => !d.builtin && !d.pooled && !(d.id in existing));
  if (!candidates.length) return { names: existing, added: 0, costUsd: 0 };

  const roster = defs
    .filter((d) => !d.builtin)
    .map((d) => `${d.id}: ${existing[d.id] ? `${existing[d.id]} — ` : ''}${d.label}`)
    .join('\n');

  let text = '';
  let costUsd = 0;
  for await (const msg of query({
    prompt: `The people at this table, as their own files title them:\n\n${roster}\n\n`
      + 'Name the ones who have none.',
    options: {
      cwd: ROOT,
      agents: { [NAMER]: namer },
      agent: NAMER,
      settingSources: [],
      permissionMode: 'dontAsk',
      maxTurns: 4,
      maxBudgetUsd: 0.5,
    },
  }) as AsyncIterable<any>) {
    if (msg.type === 'result') {
      costUsd = msg.total_cost_usd ?? 0;
      if (msg.subtype !== 'success') throw new Error(`Naming failed: ${msg.subtype}`);
      if (typeof msg.result === 'string') text = msg.result;
    }
  }

  const fresh = parseNames(text, new Set(candidates.map((d) => d.id)));
  const names = { ...existing, ...fresh };
  // Asked and left alone, so nobody pays to ask again.
  for (const d of candidates) if (!(d.id in names)) names[d.id] = '';
  await saveNames(project.id, names);
  return { names, added: Object.keys(fresh).length, costUsd };
}

