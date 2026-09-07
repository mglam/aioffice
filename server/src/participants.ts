import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { DATA_DIR, ROOT } from './base.js';

/** Inlined rather than imported from `personas.ts`, which imports this file. */
const PERSONAS_DIR = path.join(DATA_DIR, 'personas');
import { parseAgentFile } from './frontmatter.js';
import { loadNames } from './names.js';
import { toolPolicy } from './tools-policy.js';
import type { ArchetypeParam, ParticipantDef, Project } from './types.js';

export const CLAUDE_CODE_ID = 'claude-code';

/**
 * Claude Code with no `--agent`: the roundtable's programmer-analyst. It carries no custom
 * persona — its identity is the claude_code preset plus the project's CLAUDE.md.
 */
const CLAUDE_CODE_DEF: ParticipantDef = {
  id: CLAUDE_CODE_ID,
  label: 'Claude Code',
  description:
    'Programmer-analyst. Plain Claude Code with the project CLAUDE.md loaded: it knows the ' +
    'stack, the architecture and the actual code. The one who turns the discussion into a plan.',
  body: '',
  declaredTools: ['Read', 'Grep', 'Glob', 'Bash', 'WebSearch', 'WebFetch'],
  params: [],
  tuning: {},
  aliases: [],
  model: undefined,
  builtin: true,
};

/** Pulls a readable label out of the .md body: the first `# ...` heading. */
function labelFrom(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

/**
 * `param-<id>: <kind> | <label> | <a, b, c>` — the pipes rather than more colons, because the
 * frontmatter parser splits on the first colon and everything after it is the value.
 *
 * The third field is the options for a `choice` and the placeholder examples for a `text`.
 */
function parseParams(data: Record<string, string>): ArchetypeParam[] {
  const out: ArchetypeParam[] = [];
  for (const [key, raw] of Object.entries(data)) {
    if (!key.startsWith('param-')) continue;
    const [rawKind, label, third] = raw.split('|').map((x) => x.trim());
    const kind = rawKind === 'text' ? 'text' : 'choice';
    out.push({
      id: key.slice('param-'.length),
      kind,
      label: label || key.slice('param-'.length),
      // Not split for a text knob: its examples are one string, and splitting them would turn a
      // placeholder into options that do not exist.
      options: kind === 'choice' && third
        ? third.split(',').map((x) => x.trim()).filter(Boolean) : [],
      ...(kind === 'text' && third ? { hint: third } : {}),
    });
  }
  return out;
}

/** The values a generated persona was made with, so regenerating can start from them. */
function parseTuning(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(data)) {
    if (key.startsWith('tuning-') && raw.trim()) out[key.slice('tuning-'.length)] = raw.trim();
  }
  return out;
}

function parseTools(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Every `.md` in one agent directory, in filename order. Missing directory = no agents. */
export async function readAgentDir(dir: string): Promise<ParticipantDef[]> {
  if (!existsSync(dir)) return [];

  const defs: ParticipantDef[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const full = path.join(dir, file);
    const { data, content } = parseAgentFile(await readFile(full, 'utf8'));
    // The frontmatter `name` wins over the filename: network_engineer.md may
    // declare `name: grid-relays`.
    const id = data.name?.trim() ? data.name.trim() : path.basename(file, '.md');
    const body = content.trim();
    defs.push({
      id,
      label: labelFrom(body, id),
      description: data.description?.trim() ?? '',
      body,
      declaredTools: parseTools(data.tools),
      role: data.role?.trim() || undefined,
      project: data.project?.trim() || undefined,
      scope: data.scope?.trim() === 'project' ? 'project'
        : data.scope?.trim() === 'global' ? 'global' : undefined,
      params: parseParams(data),
      tuning: parseTuning(data),
      aliases: parseTools(data.aliases),
      model: data.model?.trim() || undefined,
      builtin: false,
      sourceFile: full,
    });
  }
  return defs;
}

const agentsDir = (root: string) => path.join(root, '.claude', 'agents');

/**
 * Everyone who can sit at this project's table, from two places at once:
 *
 * - the **pool** (`data/personas/`), the people the app itself writes. One of these is either
 *   global — no `project:`, offered everywhere — or written **for** one project, in which case it
 *   is offered only there, because that repo is what decided its knobs;
 * - the project's **own** `.claude/agents/`, so bringing your own personas keeps working.
 *
 * A local persona wins an id clash: it is the one somebody wrote deliberately, and the pool is
 * replaceable. Without this the same id would resolve differently depending on merge order.
 */
export async function discoverParticipants(project: Project): Promise<ParticipantDef[]> {
  const defs = await discoverRaw(project);
  // Applied here rather than at each use site: the roster the agents read, the seat rows and the
  // artifact prompts all take `label`, and a name that only reached one of them would be a name
  // half the table did not know.
  const names = await loadNames(project.id);
  return defs.map((d) => {
    const person = names[d.id];
    if (!person) return d;
    return {
      ...d,
      person,
      label: d.label.startsWith(person) ? d.label : `${person} — ${d.label}`,
    };
  });
}

async function discoverRaw(project: Project): Promise<ParticipantDef[]> {
  // Pointing the app at its own repo is a reasonable thing to do, and its agents are the
  // app's own machinery, not people to seat. `claude-code` is built in, so the app stays
  // usable as its own project.
  const own = path.resolve(project.path) === ROOT;
  const local = own ? [] : await readAgentDir(agentsDir(project.path));
  const localIds = new Set(local.map((d) => d.id));
  const pool = (await readAgentDir(PERSONAS_DIR))
    // Someone else's project's people are not offered here. A global one has no `project:`.
    .filter((d) => !d.project || d.project === project.id)
    .filter((d) => !localIds.has(d.id))
    .map((d) => ({ ...d, pooled: true }));
  return [CLAUDE_CODE_DEF, ...pool, ...local];
}

/**
 * The agents that ship with this repo, which do the app's own work — drafting a frame, and
 * whatever comes next. They are defined exactly like a user's participants, so adding one
 * is adding a file.
 *
 * They are dispatched through the SDK's `agents` option rather than discovered from disk by
 * Claude Code: discovery would need `settingSources: ['project']`, which would also load
 * this repo's hooks and permission allowlist. See CLAUDE.md.
 */
export async function officeAgents(): Promise<ParticipantDef[]> {
  return readAgentDir(agentsDir(ROOT));
}

/**
 * The role archetypes that ship with this repo: briefs `agent-writer` turns into a persona for
 * a specific project.
 *
 * They live in `.claude/archetypes/`, not `.claude/agents/`, because they are not runnable —
 * putting them alongside the real agents would make `officeAgents()` offer them as dispatchable.
 * Same file format, same parser.
 */
export async function archetypes(): Promise<ParticipantDef[]> {
  return readAgentDir(path.join(ROOT, '.claude', 'archetypes'));
}

export async function archetype(id: string): Promise<ParticipantDef> {
  const found = (await archetypes()).find((a) => a.id === id);
  if (!found) throw new Error(`Unknown archetype: ${id}`);
  return found;
}

export async function officeAgent(id: string): Promise<ParticipantDef> {
  const found = (await officeAgents()).find((a) => a.id === id);
  if (!found) {
    throw new Error(`Missing agent definition: ${path.join(agentsDir(ROOT), `${id}.md`)}`);
  }
  return found;
}

/**
 * A participant definition as the SDK wants it. Held to the same read-only tool policy as
 * every other agent the app runs: the backend writes files, agents never do.
 */
export function toAgentDefinition(def: ParticipantDef): AgentDefinition {
  const policy = toolPolicy(def);
  return {
    description: def.description,
    prompt: def.body,
    tools: policy.tools,
    disallowedTools: policy.disallowedTools,
    ...(def.model ? { model: def.model } : {}),
  };
}

export async function getParticipant(project: Project, id: string): Promise<ParticipantDef> {
  const found = (await discoverParticipants(project)).find((p) => p.id === id);
  if (!found) throw new Error(`Unknown participant in ${project.id}: ${id}`);
  return found;
}
