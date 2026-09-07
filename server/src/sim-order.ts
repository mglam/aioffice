/** Who would speak, in what order, without spending a turn to find out. */
import { findConversation, boardOf } from './store.js';
import { nextSpeaker } from './orchestrator.js';

const conv = await findConversation(process.argv[2]);
const board = boardOf(conv);
const ids = conv.participants.map((p) => p.id);

console.log('pending:',
  board.pending.map((p) => `${p.from}→${p.to}`).join(', ') || '(none)');
console.log();

const remaining = [...ids];
const order: string[] = [];
while (remaining.length) {
  const id = nextSpeaker(board, remaining);
  remaining.splice(remaining.indexOf(id), 1);
  order.push(id);
}
console.log('round order (against the current board, without recalculating):');
order.forEach((id, i) => console.log(`  ${i + 1}. ${id}`));
