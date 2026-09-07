import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { cleanMarkdown } from './artifacts.js';
import { archetype, officeAgent, readAgentDir, toAgentDefinition } from './participants.js';
import { parseAgentFile } from './frontmatter.js';
import { DATA_DIR, ROOT, slugify } from './base.js';
import { getProject } from './config.js';
import type { ParticipantDef } from './types.js';

/**
 * The people you can seat, and where they come from.
 *
 * They are **global, not per project**. A persona is a professional, not a project artifact: the
 * IP specialist knows IP networking whichever product is on the table, and the sales rep sells
 * whatever they are handed. So one pool lives here, in `data/personas/`, and a project gives them
 * its context at run time — the frame for everyone, `CLAUDE.md` for the technical profiles, and
 * `cwd` plus Read/Grep/Glob so they can go look for themselves.
 *
 * Two things follow, and both are improvements:
 *
 * - **The app writes nothing into your repository.** Publishing a deliverable to `AISPECS/` is
 *   again the only write outside itself, which is what CLAUDE.md always wanted to say.
 * - **A persona cannot be over-fitted to a product.** When it was generated *for* a project it
 *   was grounded in that project's docs, and a specialist grounded in the thing it is meant to
 *   judge can only ratify it. Written standalone, its authority comes from its field.
 *
 * A project's own `.claude/agents/` is still discovered and seatable — bring your own people. The
 * pool is what the app itself can write, so it is what the app is allowed to delete.
 *
 * **Everything here is written in English**, and the language a person *answers* in is decided per
 * turn, from the project's `locale` (`answerLanguage` in the prompt packs). One language in the
 * pool is what lets one person sit at a Spanish project and an English one; writing them in the
 * project's language would re-fragment exactly what making them global unified.
 *
 * A person is either **global** or written **for one project**, recorded as `project:` in their
 * own frontmatter rather than by which directory they sit in. Scope is a property of the person,
 * so ids stay unique across both kinds and changing someone's scope is an edit rather than a move.
 *
 * The two are not just a filter. Writing someone *for* a project is what licenses reading that
 * repo, which is the only way the knobs nobody answered — which field, which technologies — get a
 * real answer instead of a guess. A global person is written from the role alone, because if you
 * needed the repo to write them, they are specific to it.
 */
export const PERSONAS_DIR = path.join(DATA_DIR, 'personas');

const WRITER = 'agent-writer';

/**
 * A persona's id is their name — `nora-bianchetti`, not `domain-specialist`. That is what
 * everyone at the table calls them, and having three domain specialists who disagree is the
 * point, so the role cannot be the identity.
 *
 * **Every archetype is named now**, functions included: they sit at a table and have to address
 * each other, and a participant who is only "the product manager" gets talked about rather than
 * to. The fallback to the archetype id is for a writer that forgets the `PERSON:` line.
 *
 * The `ai-office-` prefix is gone with the reason for it: it existed to keep a generated file
 * from colliding with a hand-written one inside someone's repo. Nothing is written there now.
 */
export const personaId = (archetypeId: string, person?: string) =>
  person?.trim() ? slugify(person) : archetypeId;

export const personaPath = (id: string) => path.join(PERSONAS_DIR, `${id}.md`);

/** The whole pool, parsed like any other agent directory. */
export function listPersonas(): Promise<ParticipantDef[]> {
  return readAgentDir(PERSONAS_DIR);
}

/** Two people can share a name; two files cannot. */
function freeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** The heading a persona gives itself: a one-line summary, already in its own language. */
function headingOf(body: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

/**
 * The frontmatter is assembled here, from the archetype, rather than trusting the model to emit
 * valid frontmatter. It is also what the tolerant parser in `frontmatter.ts` will read back, so
 * a malformed line would cost a participant.
 *
 * `description` comes from the persona's **own first heading**, not from the archetype's, because
 * the archetype's describes the *role* — which `role:` already records — while the heading
 * describes this person. It also used to be the one line of the file in a different language from
 * the rest, back when personas were written in the project's language.
 */
function fileFor(def: ParticipantDef, archetypeId: string, id: string, projectId: string | null,
                 tuning: Record<string, string>, body: string): string {
  const front = [
    '---',
    `name: ${id}`,
    `description: ${(headingOf(body) || def.description).replace(/\n+/g, ' ').trim()}`,
    // Which seat this person fills. The id is their name, so without this nothing downstream
    // could tell that «Nora Bianchetti» is the domain specialist.
    `role: ${archetypeId}`,
    // Absent for a global person, which is what makes the absence meaningful.
    ...(projectId ? [`project: ${projectId}`] : []),
    // What this person was made with, so regenerating starts from it rather than from nothing.
    ...Object.entries(tuning).map(([k, v]) => `tuning-${k}: ${v}`),
    `tools: ${def.declaredTools.join(', ')}`,
    ...(def.model ? [`model: ${def.model}`] : []),
    '---',
  ].join('\n');
  return `${front}\n\n${body}\n`;
}

/** Pulls the `PERSON:` line off the front, leaving the persona. Absent for a function role. */
function splitPerson(text: string): { person: string; body: string } {
  const m = /^\s*PERSON:\s*(.+?)\s*(?:\n|$)/i.exec(text);
  if (!m) return { person: '', body: text.trim() };
  return {
    person: m[1].replace(/[*`_]/g, '').trim(),
    body: text.slice(m.index + m[0].length).trim(),
  };
}

export type GeneratedPersona = {
  id: string;
  archetype: string;
  file: string;
  markdown: string;
  costUsd: number;
};

/**
 * Writes one person into the pool. Always adds — a role can be filled several times over, and
 * what distinguishes those people is the tuning they were made with. Pass `replacing` to
 * regenerate one in place.
 */
export async function generatePersona(args: {
  archetype: string;
  /** The role's knobs, as chosen. Missing ones are left to the writer to decide. */
  tuning?: Record<string, string>;
  /** Replace this person instead of adding one. The id of someone already in the pool. */
  replacing?: string;
  /**
   * Write this person **for** one project: they are offered only there, and that repo is read
   * while deciding the knobs nobody answered. Omit for a global person, written from the role
   * alone. It changes nothing about what the persona may *say* — see the reference block below.
   */
  projectId?: string;
}): Promise<GeneratedPersona> {
  const { archetype: archetypeId, tuning = {}, replacing, projectId } = args;
  const brief = await archetype(archetypeId);
  const writer = await officeAgent(WRITER);
  const reference = projectId ? await getProject(projectId) : null;

  const existing = await listPersonas();
  const prior = replacing ? existing.find((d) => d.id === replacing) : undefined;
  if (replacing && !prior) throw new Error(`${replacing} is not in the pool`);

  // What the role varies on, and what was chosen. An unanswered knob is left to the writer rather
  // than defaulted here: a coherent professional is its job, not ours.
  const knobs = brief.params.map((prm) => {
    const chosen = tuning[prm.id];
    const opts = prm.options.length ? ` (one of: ${prm.options.join(', ')})` : '';
    return chosen
      ? `- ${prm.label}: **${chosen}**`
      : `- ${prm.label}: not specified — choose something coherent${opts}`;
  }).join('\n');

  /**
   * A reference repository answers exactly one kind of question: the knobs nobody set. Which
   * field is this? Which technologies are actually involved? Those are not inferable from
   * anything else, and refusing to generate without them would be worse than letting somebody
   * point at a repo.
   *
   * What it must not do is ground the persona. That is the whole reason the personas went global,
   * so the instruction is emphatic and the archetype briefs repeat it: nothing read here reaches
   * the persona's text.
   */
  const referenceBlock = reference
    ? '--- THE PROJECT THIS PERSON IS FOR ---\n\n'
      + `You are running in its root. Its absolute path is \`${reference.path}\` — do not go `
      + 'looking for it.\n\n'
      + 'Read it for **one purpose only**: to decide the knobs above that say *not specified*. '
      + 'Which field is this product\'s subject matter, which technologies are really involved, '
      + 'what kind of organisation buys it. Start with CLAUDE.md and README.md.\n\n'
      + 'Then leave it behind. **Nothing you read goes into the persona** — not the product or '
      + 'company name, not an internal identifier, not the architecture, not a feature list, not '
      + 'a metric value. This person will be seated at this product\'s table and at others, and '
      + 'every table hands them its own context when they get there. A persona assembled out of a '
      + 'product\'s own model can only ratify that model, which is precisely the independence you '
      + 'were writing them for.\n\n'
    : '';

  const toolLimit = reference
    // Reading is the point, and `cwd` is the repository somebody pointed at.
    ? {}
    // Nothing to read. `cwd` is only somewhere for the process to stand, so the filesystem tools
    // come off: standing in ROOT with `Read`, the writer would ground the persona in *this app's*
    // source, which is the one repo it must never describe.
    : { tools: ['WebSearch', 'WebFetch'] };

  let text = '';
  let costUsd = 0;

  for await (const msg of query({
    prompt: `Write the persona for the **${brief.id}** archetype.\n\n`
      + (knobs ? `--- HOW THIS ONE IS TUNED ---\n\n${knobs}\n\n` : '')
      + referenceBlock
      + `--- ARCHETYPE BRIEF: ${brief.id} ---\n\n${brief.body}`,
    options: {
      cwd: reference ? reference.path : ROOT,
      agents: { [WRITER]: { ...toAgentDefinition(writer), ...toolLimit } },
      agent: WRITER,
      settingSources: [],
      permissionMode: 'dontAsk',
      maxTurns: 20,
      maxBudgetUsd: 1.0,
    },
  }) as AsyncIterable<any>) {
    if (msg.type === 'result') {
      costUsd = msg.total_cost_usd ?? 0;
      if (msg.subtype !== 'success') {
        throw new Error(`Could not write ${brief.id}: the turn ended with "${msg.subtype}"`);
      }
      if (typeof msg.result === 'string') text = msg.result;
    }
  }

  // Split before cleaning, not after: `cleanMarkdown` drops everything ahead of the first `#`,
  // which is exactly where the reported line sits.
  const reported = splitPerson(text);
  const body = cleanMarkdown(reported.body);
  if (!body) throw new Error(`The writer returned nothing for ${brief.id}.`);

  const taken = new Set(existing.filter((d) => d.id !== replacing).map((d) => d.id));
  const id = freeId(personaId(archetypeId, reported.person), taken);
  const target = personaPath(id);

  await mkdir(PERSONAS_DIR, { recursive: true });
  // Only the one being replaced goes. Siblings filling the same role stay: having several is
  // the point.
  if (prior?.sourceFile && prior.sourceFile !== target) {
    await rm(prior.sourceFile, { force: true });
  }
  await writeFile(target, fileFor(brief, archetypeId, id, projectId ?? null, tuning, body), 'utf8');

  return { id, archetype: archetypeId, file: target, markdown: body, costUsd };
}

/** Reads one back, so the UI can show a person without paying to rewrite them. */
export async function readPersona(id: string): Promise<string> {
  const file = personaPath(id);
  if (!existsSync(file)) throw new Error(`${id} is not in the pool`);
  return readFile(file, 'utf8');
}

/**
 * Deletes one. The guard is the directory, not a prefix: everything in the pool is the app's own
 * to remove, and a persona somebody wrote by hand in their repo is not reachable from here at
 * all. The id is still checked for path escapes, since it arrives from a URL.
 */
export async function deletePersona(id: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Not a persona id: ${id}`);
  const file = personaPath(id);
  if (!existsSync(file)) throw new Error(`${id} is not in the pool`);
  await rm(file, { force: true });
}

/**
 * One-time repair of the personas written before `description` came from the body's own heading:
 * their frontmatter carries the archetype's English line above a Spanish persona. Cosmetic, but
 * it is the first thing you see opening the file, and regenerating to fix a label costs $0.20.
 */
export async function migratePersonaDescriptions(): Promise<number> {
  if (!existsSync(PERSONAS_DIR)) return 0;
  let fixed = 0;
  for (const file of (await readdir(PERSONAS_DIR)).filter((f) => f.endsWith('.md'))) {
    const full = path.join(PERSONAS_DIR, file);
    const raw = await readFile(full, 'utf8');
    const { content } = parseAgentFile(raw);
    const heading = headingOf(content);
    if (!heading) continue;
    // Only inside the frontmatter, and only when it is not already the heading.
    const next = raw.replace(/^description:.*$/m, `description: ${heading}`);
    if (next === raw) continue;
    await writeFile(full, next, 'utf8');
    fixed += 1;
  }
  return fixed;
}

/**
 * One-time move of the personas the app generated into a project's repo, back when they were
 * per-project. It takes the file out of the user's `.claude/agents/` — leaving it there would
 * seat the same person twice, once from the pool and once locally.
 */
export async function migratePersonasToPool(projectPaths: string[]): Promise<number> {
  let moved = 0;
  for (const root of projectPaths) {
    const dir = path.join(root, '.claude', 'agents');
    if (!existsSync(dir)) continue;
    for (const file of (await readdir(dir)).filter((f) => f.startsWith('ai-office-'))) {
      const from = path.join(dir, file);
      const raw = await readFile(from, 'utf8');
      const id = slugify(path.basename(file, '.md').replace(/^ai-office-/, ''));
      await mkdir(PERSONAS_DIR, { recursive: true });
      // `name:` has to follow the file, or discovery would keep the old prefixed id.
      await writeFile(personaPath(id), raw.replace(/^name:.*$/m, `name: ${id}`), 'utf8');
      await rm(from, { force: true });
      moved += 1;
    }
  }
  return moved;
}
