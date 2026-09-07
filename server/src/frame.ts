import { query } from '@anthropic-ai/claude-agent-sdk';
import { cleanMarkdown } from './artifacts.js';
import { validateProjectPath } from './config.js';
import { officeAgent, toAgentDefinition } from './participants.js';
import type { Locale } from './types.js';

/**
 * Drafts the **product frame** by reading the repo.
 *
 * The frame matters more than it looks: without it, a roundtable of domain personas (a
 * network engineer, an ISP owner) discusses the domain instead of the product. And it is
 * easy to leave the field empty when registering a project, so the app offers to draft it.
 *
 * The instructions live in `.claude/agents/frame-writer.md`, not here, so anyone can retune
 * them without touching TypeScript. They are dispatched with the SDK's `agent` option,
 * which applies that file's system prompt, tool restrictions and model to the main thread.
 *
 * It does NOT reuse `runTurn`: that one is coupled to `Conversation`/
 * `ConversationParticipant`, and bending it to fit a read-only task with no conversation
 * would leave it worse forever.
 */
const AGENT = 'frame-writer';

/**
 * The frame is read by the agents, so it is written in the project's language. Only the
 * output language varies — the instructions themselves stay in one place, in one language.
 */
const OUTPUT_LANGUAGE: Record<Locale, string> = {
  en: 'English',
  es: 'Rioplatense Spanish',
};

/**
 * Pulls the three reported fields apart.
 *
 * The product's name is usually not the folder's, and the language the agents should be addressed
 * in is a property of the repo's own docs — the agent has just read both, so it reports them
 * rather than leaving the UI to guess from a basename and the browser's locale.
 */
function parseReport(text: string): { name: string; locale?: Locale; frame: string } {
  const field = (key: string) => {
    const m = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'im').exec(text);
    // The model sometimes wraps a value in emphasis.
    return m ? m[1].replace(/[*`_]/g, '').trim() : '';
  };

  const reported = field('LANGUAGE').toLowerCase();
  const summary = /^\s*SUMMARY:\s*([\s\S]+)$/im.exec(text);

  return {
    name: field('NAME'),
    locale: reported === 'es' || reported === 'en' ? reported : undefined,
    // Fall back to the whole reply: better a frame with stray labels a person can trim than none.
    frame: (summary ? summary[1] : text.replace(/^\s*(NAME|LANGUAGE):.*$/gim, '')).trim(),
  };
}

export async function proposeFrame(projectPath: string, locale?: Locale): Promise<{
  name: string; locale: Locale; frame: string; costUsd: number;
}> {
  const check = await validateProjectPath(projectPath);
  if (!check.ok) throw new Error(check.error ?? 'Invalid path.');

  // Throws naming the file if it is missing: a silent fallback would hide exactly the kind
  // of breakage that editing these definitions can introduce.
  const def = await officeAgent(AGENT);

  // With no locale given, the agent picks one from the repo and writes in it. With one given —
  // an existing project whose language somebody already set — that setting is respected.
  const asked = locale
    ? `\n\nWrite the summary in ${OUTPUT_LANGUAGE[locale]} and report that as the LANGUAGE.`
    : '';

  let text = '';
  let costUsd = 0;

  for await (const msg of query({
    prompt: `Read this repository and report its NAME, LANGUAGE and SUMMARY.\n\n`
      + `You are already running in its root. Its absolute path is \`${projectPath}\` — `
      + `do not go looking for it.${asked}`,
    options: {
      // Rooted in the project: Glob and Grep default to `cwd`, so a task that reads the
      // user's repo has to start there.
      cwd: projectPath,
      // Inline, not discovered from disk. Discovery would need settingSources:
      // ['project'], which would also load this repo's hooks and permission allowlist.
      agents: { [AGENT]: toAgentDefinition(def) },
      agent: AGENT,
      settingSources: [],
      permissionMode: 'dontAsk',
      maxTurns: 14,
      maxBudgetUsd: 0.5,
    },
  }) as AsyncIterable<any>) {
    if (msg.type === 'result') {
      costUsd = msg.total_cost_usd ?? 0;
      if (msg.subtype !== 'success') {
        throw new Error(`Could not read the repo: the turn ended with "${msg.subtype}"`);
      }
      if (typeof msg.result === 'string') text = msg.result;
    }
  }

  // Parsed before cleaning for the same reason as personas: `cleanMarkdown` would drop the
  // reported lines if the model ever prefixed the summary with a heading.
  const report = parseReport(text);
  report.frame = cleanMarkdown(report.frame);
  if (!report.frame) throw new Error('The model returned nothing. Write the frame by hand.');
  return {
    name: report.name,
    locale: locale ?? report.locale ?? 'en',
    frame: report.frame,
    costUsd,
  };
}
