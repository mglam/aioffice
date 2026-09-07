import type { ParticipantDef } from './types.js';

/**
 * At the roundtable, agents are READ-ONLY. Deliverables are written by the backend.
 *
 * A distinction that matters (measured):
 *  - `tools`           → which tools EXIST in the model's context. Cuts tokens.
 *  - `allowedTools`    → which are auto-approved without asking. Does not cut tokens.
 *  - `disallowedTools` → second line of defence.
 */
const READ_TOOLS = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];

/** Bash for inspection only. Same `Bash(cmd *)` syntax as settings.json. */
const SAFE_BASH = [
  'Bash(ls *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(wc *)',
  'Bash(find *)', 'Bash(grep *)', 'Bash(rg *)', 'Bash(tree *)', 'Bash(file *)',
  'Bash(git log *)', 'Bash(git show *)', 'Bash(git diff *)', 'Bash(git status *)',
];

const DENY = [
  'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'TodoWrite', 'Task', 'Agent',
  'Bash(rm *)', 'Bash(mv *)', 'Bash(cp *)', 'Bash(git commit *)', 'Bash(git push *)',
  'Bash(git checkout *)', 'Bash(git add *)', 'Bash(npm *)', 'Bash(npx *)',
  'Bash(curl *)', 'Bash(chmod *)', 'Bash(kill *)',
];

export type ToolPolicy = {
  tools: string[];
  allowedTools: string[];
  disallowedTools: string[];
};

export function toolPolicy(def: ParticipantDef): ToolPolicy {
  const declared = new Set(def.declaredTools);
  const tools = READ_TOOLS.filter((t) => declared.has(t));
  const allowedTools = [...tools];

  if (declared.has('Bash')) {
    tools.push('Bash');
    allowedTools.push(...SAFE_BASH);
  }

  return { tools, allowedTools, disallowedTools: DENY };
}
