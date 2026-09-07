import type { TurnEvent } from './turn.js';
import type { ArtifactRef, TranscriptEntry } from './types.js';

export type ConversationEvent =
  | TurnEvent
  | { type: 'entry'; entry: TranscriptEntry }
  | { type: 'artifact'; artifact: ArtifactRef }
  | { type: 'conversation_updated' }
  | { type: 'auto_progress'; cycle: number; cycles: number; participantId: string }
  | { type: 'auto_stopping' }
  | { type: 'auto_done' }
  | { type: 'busy'; busy: boolean }
  | { type: 'session_progress'; round: number; rounds: number; phase: string; participantId: string }
  | { type: 'session_converged'; round: number }
  | { type: 'session_open'; blockers: number; notClosed: string[] }
  | { type: 'session_writing'; artifact: string; participantId: string }
  | { type: 'session_artifact_failed'; artifact: string; message: string };

type Listener = (e: ConversationEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(convId: string, fn: Listener): () => void {
  if (!listeners.has(convId)) listeners.set(convId, new Set());
  listeners.get(convId)!.add(fn);
  return () => {
    listeners.get(convId)?.delete(fn);
    if (listeners.get(convId)?.size === 0) listeners.delete(convId);
  };
}

export function publish(convId: string, e: ConversationEvent): void {
  for (const fn of listeners.get(convId) ?? []) {
    try { fn(e); } catch { /* a dead SSE client must not stall the turn */ }
  }
}

/**
 * Serializes work per conversation: the turns of a parallel round run at the same time,
 * but writes to the conversation's JSON never clobber each other.
 */
const chains = new Map<string, Promise<unknown>>();

export function withConversationLock<T>(convId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(convId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(convId, next.catch(() => {}));
  return next;
}
