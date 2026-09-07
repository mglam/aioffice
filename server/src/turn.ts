import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Conversation, ConversationParticipant, ParticipantDef, Project, ToolCall,
} from './types.js';
import { toolPolicy } from './tools-policy.js';
import { buildSystemPrompt, stringsFor } from './prompts/index.js';

export type TurnEvent =
  | { type: 'turn_start'; participantId: string }
  | { type: 'delta'; participantId: string; text: string }
  | { type: 'tool_use'; participantId: string; tool: ToolCall }
  | { type: 'turn_end'; participantId: string; text: string; costUsd: number;
      tokens: { in: number; out: number }; toolCalls: ToolCall[] }
  | { type: 'turn_error'; participantId: string; message: string };

export type TurnResult = {
  text: string;
  costUsd: number;
  tokens: { in: number; out: number };
  toolCalls: ToolCall[];
  sessionId?: string;
  error?: string;
};

/** In-flight queries, so the API can interrupt them. */
const inFlight = new Map<string, { interrupt: () => Promise<unknown> }>();

export function interruptTurn(convId: string, participantId: string): boolean {
  const q = inFlight.get(`${convId}:${participantId}`);
  if (!q) return false;
  void q.interrupt().catch(() => {});
  return true;
}

const claudeMdCache = new Map<string, string | null>();

async function loadClaudeMd(project: Project): Promise<string | null> {
  if (claudeMdCache.has(project.path)) return claudeMdCache.get(project.path)!;
  const file = path.join(project.path, 'CLAUDE.md');
  const value = existsSync(file) ? await readFile(file, 'utf8') : null;
  claudeMdCache.set(project.path, value);
  return value;
}

function summarizeTool(name: string, input: unknown): ToolCall {
  const i = (input ?? {}) as Record<string, unknown>;
  const first = (...keys: string[]) => {
    for (const k of keys) if (typeof i[k] === 'string' && i[k]) return i[k] as string;
    return '';
  };
  const detail = first('file_path', 'pattern', 'path', 'command', 'query', 'url', 'prompt');
  return { name, summary: detail ? `${name} ${detail}`.slice(0, 160) : name };
}

/**
 * Runs one turn. `promptText` arrives already built (either the delta or a deliverable
 * request). `fork` keeps a synthesis request from contaminating the conversational session.
 */
export async function runTurn(args: {
  conv: Conversation;
  cp: ConversationParticipant;
  def: ParticipantDef;
  project: Project;
  /**
   * The one directory an agent may read outside the repo, and it holds only the history file.
   * Deliberately not the project's whole data folder — see `historyDir` in `history.ts`.
   */
  projectDir: string;
  promptText: string;
  fork?: boolean;
  maxBudgetUsd?: number;
  onEvent?: (e: TurnEvent) => void;
}): Promise<TurnResult> {
  const { conv, cp, def, project, promptText, fork = false, onEvent } = args;
  const key = `${conv.id}:${def.id}`;

  // Per participant, and it lives on the conversation's own seat: it used to hang off the
  // roundtable, which was the only per-participant setting that layer held.
  const claudeMd = cp.loadProjectSettings ? await loadClaudeMd(project) : null;
  const policy = toolPolicy(def);

  /**
   * The seat's own settings, and they override the persona's file.
   *
   * `effort` is the half that actually changes the model's behaviour; the length budget is a line
   * in the system prompt because the SDK has no `max_tokens`. `full` sets neither: the SDK's
   * default effort is already `high`, and asking for "as long as you like" is noise.
   */
  const EFFORT = { quick: 'low', medium: 'medium' } as const;
  const effort = cp.depth && cp.depth !== 'full' ? EFFORT[cp.depth] : undefined;
  const length = cp.depth && cp.depth !== 'full'
    ? stringsFor(project.locale).length[cp.depth] : undefined;
  const model = cp.model || def.model;

  let text = '';
  let costUsd = 0;
  let tokens = { in: 0, out: 0 };
  let sessionId: string | undefined;
  const toolCalls: ToolCall[] = [];

  onEvent?.({ type: 'turn_start', participantId: def.id });

  const q = query({
    prompt: promptText,
    options: {
      cwd: project.path,
      // Read access to the history file's own directory, and nothing else: that is where what
      // was discussed before lives. It is not injected as context — they read it if needed.
      additionalDirectories: [args.projectDir],
      systemPrompt: buildSystemPrompt(def, claudeMd, project.locale, length),
      // Deliberately isolated: loading the repo's settings would bring its `Stop` hook
      // and the settings.local.json allowlist (git push, npm run). We inject CLAUDE.md
      // ourselves, explicitly.
      settingSources: [],
      tools: policy.tools,
      allowedTools: policy.allowedTools,
      disallowedTools: policy.disallowedTools,
      permissionMode: 'dontAsk',
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      ...(cp.sessionId ? { resume: cp.sessionId, forkSession: fork } : {}),
      includePartialMessages: true,
      maxTurns: 16,
      maxBudgetUsd: args.maxBudgetUsd ?? 2.0,
    },
  });

  inFlight.set(key, q);

  try {
    for await (const msg of q as AsyncIterable<any>) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionId = msg.session_id;
        continue;
      }

      if (msg.type === 'stream_event') {
        const d = msg.event?.delta;
        if (d?.type === 'text_delta' && d.text) {
          text += d.text;
          onEvent?.({ type: 'delta', participantId: def.id, text: d.text });
        }
        continue;
      }

      if (msg.type === 'assistant') {
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_use') {
            const tc = summarizeTool(block.name, block.input);
            toolCalls.push(tc);
            onEvent?.({ type: 'tool_use', participantId: def.id, tool: tc });
          }
        }
        continue;
      }

      if (msg.type === 'result') {
        sessionId = msg.session_id ?? sessionId;
        costUsd = msg.total_cost_usd ?? 0;
        const u = msg.usage ?? {};
        tokens = {
          in: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) +
              (u.cache_read_input_tokens ?? 0),
          out: u.output_tokens ?? 0,
        };
        // `result` carries the final assembled text; the deltas may have been left
        // incomplete if there was tool use in between.
        if (msg.subtype === 'success' && typeof msg.result === 'string' && msg.result.trim()) {
          text = msg.result;
        }
        if (msg.subtype !== 'success') {
          const message = `The turn ended with "${msg.subtype}"`;
          onEvent?.({ type: 'turn_error', participantId: def.id, message });
          return { text: text.trim(), costUsd, tokens, toolCalls, sessionId, error: message };
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onEvent?.({ type: 'turn_error', participantId: def.id, message });
    return { text: text.trim(), costUsd, tokens, toolCalls, sessionId, error: message };
  } finally {
    inFlight.delete(key);
  }

  const result = { text: text.trim(), costUsd, tokens, toolCalls, sessionId };
  onEvent?.({ type: 'turn_end', participantId: def.id, ...result, text: result.text });
  return result;
}
