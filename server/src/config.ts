import { readFile, readdir } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, slugify, writeJson } from './base.js';
import type { Locale, Project } from './types.js';

export { ROOT, DATA_DIR } from './base.js';

const CONFIG_PATH = path.join(ROOT, 'config.json');

const LOCALES: Locale[] = ['en', 'es'];
const asLocale = (v: unknown): Locale | undefined =>
  LOCALES.includes(v as Locale) ? (v as Locale) : undefined;

export async function loadProjects(): Promise<Project[]> {
  if (!existsSync(CONFIG_PATH)) return [];
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as { projects?: Project[] };
  return raw.projects ?? [];
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await writeJson(CONFIG_PATH, { projects });
}

export async function getProject(id: string): Promise<Project> {
  const p = (await loadProjects()).find((x) => x.id === id);
  if (!p) throw new Error(`Unknown project: ${id}`);
  if (!existsSync(p.path)) throw new Error(`The project path does not exist: ${p.path}`);
  return p;
}

export type PathCheck = {
  /** A readable directory. Kept permissive: the API still accepts a repo with no CLAUDE.md. */
  ok: boolean;
  /** Looks like a codebase root. The setup flow requires this before it lets you continue. */
  isProject: boolean;
  /**
   * Has a `CLAUDE.md`. Not required — the frame writer falls back to the README — but it is the
   * best material it can get, so the UI says when it is missing.
   */
  hasClaudeMd: boolean;
  /** Has `.claude/agents/` with at least one `.md`. Without it, only `claude-code` can be seated. */
  hasAgents: boolean;
  agentCount: number;
  error?: string;
};

/**
 * A project with no `.claude/agents/` **still works**: `claude-code` is built in and does
 * not come from there. So that is a warning, not an error — the only things rejected are a
 * path that doesn't exist or isn't a directory.
 */
export async function validateProjectPath(raw: string): Promise<PathCheck> {
  const p = (raw ?? '').trim();
  const none = { ok: false, isProject: false, hasClaudeMd: false, hasAgents: false, agentCount: 0 };

  if (!p) return { ...none, error: 'Path is missing.' };
  if (!path.isAbsolute(p)) return { ...none, error: 'The path must be absolute.' };
  if (!existsSync(p)) return { ...none, error: 'That path does not exist.' };
  if (!statSync(p).isDirectory()) return { ...none, error: 'That path is not a directory.' };

  const agentCount = agentCountIn(p);
  return {
    ok: true,
    isProject: isProject(p),
    hasClaudeMd: has(p, 'CLAUDE.md'),
    hasAgents: agentCount > 0,
    agentCount,
  };
}

/** One directory the user can descend into or pick as a project root. */
export type DirEntry = {
  name: string;
  path: string;
  /** Has `.claude/agents/` with at least one `.md`. */
  hasAgents: boolean;
  /** Has a `CLAUDE.md` — the best material the frame writer can get. */
  hasClaudeMd: boolean;
  /** Looks like a codebase root, so it can be selected. See `isProject`. */
  selectable: boolean;
  /** A selectable folder exists somewhere below. Only a hint — it is enterable either way. */
  leadsTo: boolean;
};

export type Browse = {
  path: string;
  /** null at the filesystem root, so the UI knows to hide "up". */
  parent: string | null;
  /** Everything readable, nothing hidden. What is not a project is greyed, not removed. */
  entries: DirEntry[];
};

/**
 * Where browsing starts: one level above the app's own root, which is where sibling
 * repos live. Typing an absolute path still works — this only saves you the typing.
 */
export const browseStart = (): string => path.dirname(ROOT);

/** Never worth offering as a project root, and they make the list unreadable. */
const SKIP = new Set(['node_modules', 'dist', 'build', 'target', 'vendor', '__pycache__']);

const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const has = (p: string, ...rest: string[]) => existsSync(path.join(p, ...rest));

/** At least one `.md` — a `.claude/agents/` with nothing in it is not agents. */
function agentCountIn(dir: string): number {
  const agents = path.join(dir, '.claude', 'agents');
  if (!isDir(agents)) return 0;
  try {
    return readdirSync(agents).filter((f) => f.endsWith('.md')).length;
  } catch { return 0; }
}

/**
 * How deep to look for a project below a folder, and how many directories that search may visit
 * before giving up.
 *
 * Deliberately stingy, because this is only a **hint**: nothing is hidden either way, so a folder
 * whose search runs out of budget simply loses its chevron and is still there to click into. The
 * search then runs again from wherever you land, which is what lets the depth stay this shallow —
 * three levels per step, as many steps as you like.
 */
const MAX_DEPTH = 3;
const MAX_VISITS = 150;

/**
 * What makes a folder a codebase root you can point this at.
 *
 * Deliberately wider than "has a CLAUDE.md". Measured against a real machine, that narrower rule
 * rejected four out of ten actual projects — ones with a README and a git repo but no CLAUDE.md —
 * while the frame writer reads the README too and `claude-code` is built in, so neither a
 * CLAUDE.md nor `.claude/agents/` is actually required for the app to work.
 *
 * Anything with none of these is almost certainly a container folder, and gets greyed rather than
 * hidden: you can still walk into it.
 */
const MARKERS = ['CLAUDE.md', '.git', 'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'];

function isProject(dir: string): boolean {
  if (MARKERS.some((m) => has(dir, m))) return true;
  // A bare `.claude/` is usually just settings and says nothing about the folder — only actual
  // agents count. This is what keeps a container folder like `x/` from looking like the project
  // that lives in `x/the-repo/`.
  if (agentCountIn(dir) > 0) return true;
  try {
    return readdirSync(dir).some((f) => /^readme(\.|$)/i.test(f));
  } catch { return false; }
}

/** Whether a project exists below `dir`, within the caps. Exits on the first one it finds. */
function leadsToProject(dir: string): boolean {
  let budget = MAX_VISITS;

  const walk = (at: string, depth: number): boolean => {
    if (depth > MAX_DEPTH || budget <= 0) return false;
    let names: string[];
    try { names = readdirSync(at); } catch { return false; }

    const children: string[] = [];
    for (const name of names) {
      if (name.startsWith('.') || SKIP.has(name)) continue;
      const child = path.join(at, name);
      if (!isDir(child)) continue;
      if (budget-- <= 0) return false;
      if (isProject(child)) return true;
      children.push(child);
    }
    // Breadth first: a repo one level down is far likelier than one buried four deep, so the
    // common case never pays for the deep search.
    return children.some((c) => walk(c, depth + 1));
  };

  return walk(dir, 1);
}

/**
 * Lists the subdirectories of `raw`, plus whether each one has `.claude/agents/`, so the
 * list can show at a glance which folders are worth pointing at.
 *
 * Directories that cannot be read are skipped rather than failing the whole listing: one
 * unreadable folder in a home directory should not break the browser.
 */
export async function browseDirectories(raw?: string): Promise<Browse> {
  const dir = (raw ?? '').trim() ? path.resolve(raw!.trim()) : browseStart();

  if (!existsSync(dir)) throw new Error('That path does not exist.');
  if (!statSync(dir).isDirectory()) throw new Error('That path is not a directory.');

  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name))
      .map((d) => d.name);
  } catch {
    throw new Error('That folder cannot be read.');
  }

  const entries: DirEntry[] = names
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(dir, name))
    // Browsing starts at the app's own parent, so its own folder is the first thing you see.
    // It is not a project you point this at, so it is not offered. Typing the path still works,
    // and `discoverParticipants` handles that case by offering only `claude-code`.
    .filter((full) => full !== ROOT)
    .map((full) => {
      const selectable = isProject(full);
      return {
        name: path.basename(full),
        path: full,
        hasAgents: agentCountIn(full) > 0,
        hasClaudeMd: has(full, 'CLAUDE.md'),
        selectable,
        // Computed even when the folder is selectable: a git repo whose real project sits one
        // level in should still say so rather than quietly look like the destination.
        leadsTo: leadsToProject(full),
      };
    });

  const up = path.dirname(dir);
  return { path: dir, parent: up === dir ? null : up, entries };
}

/** The id comes from the name and never changes: it is what roundtables store in `projectId`. */
function freeId(name: string, taken: Set<string>): string {
  const base = slugify(name) || 'project';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function createProject(args: {
  name: string; path: string; frame?: string; locale?: Locale;
}): Promise<Project> {
  const check = await validateProjectPath(args.path);
  if (!check.ok) throw new Error(check.error ?? 'Invalid path.');

  const name = args.name.trim();
  if (!name) throw new Error('The project name is missing.');

  const projects = await loadProjects();
  if (projects.some((p) => p.path === args.path.trim())) {
    throw new Error('There is already a project registered at that path.');
  }

  const project: Project = {
    id: freeId(name, new Set(projects.map((p) => p.id))),
    name,
    path: args.path.trim(),
    frame: args.frame?.trim() || undefined,
    locale: asLocale(args.locale) ?? 'en',
  };

  await saveProjects([...projects, project]);
  return project;
}

export async function updateProject(id: string, patch: {
  name?: string; path?: string; frame?: string; locale?: Locale;
}): Promise<Project> {
  const projects = await loadProjects();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error(`Unknown project: ${id}`);

  if (typeof patch.path === 'string' && patch.path.trim() !== project.path) {
    const check = await validateProjectPath(patch.path);
    if (!check.ok) throw new Error(check.error ?? 'Invalid path.');
    project.path = patch.path.trim();
  }
  if (typeof patch.name === 'string' && patch.name.trim()) project.name = patch.name.trim();
  // An empty frame is cleared: better left unset, with the UI saying so.
  if (typeof patch.frame === 'string') project.frame = patch.frame.trim() || undefined;
  const locale = asLocale(patch.locale);
  if (locale) project.locale = locale;

  await saveProjects(projects);
  return project;
}

/**
 * Any project already in `config.json` was registered when the app was Spanish-only, so
 * its personas and its frame are in Spanish. Defaulting those to English would silently
 * hand their agents a protocol in the wrong language; new projects still default to `en`.
 *
 * Runs once at boot and is a no-op afterwards.
 */
export async function migrateProjectLocales(): Promise<number> {
  const projects = await loadProjects();
  const pending = projects.filter((p) => !p.locale);
  if (!pending.length) return 0;
  for (const p of pending) p.locale = 'es';
  await saveProjects(projects);
  return pending.length;
}

export async function removeProject(id: string): Promise<void> {
  const projects = await loadProjects();
  if (!projects.some((p) => p.id === id)) throw new Error(`Unknown project: ${id}`);
  await saveProjects(projects.filter((p) => p.id !== id));
}
