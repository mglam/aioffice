/** The exact prompt a participant would receive if they spoke right now. */
import { findConversation, boardOf, listConversations } from './store.js';
import { historyPath } from './history.js';
import { discoverParticipants } from './participants.js';
import { getProject } from './config.js';
import { buildTurnPrompt } from './prompts/index.js';

const [, , convId, who, at] = process.argv;
if (!convId || !who) {
  console.error('usage: npm run prompt -- <conversationId> <participant> [index]');
  process.exit(1);
}

const conv = await findConversation(convId);
const project = await getProject(conv.projectId);
const defs = await discoverParticipants(project);
const map = new Map(defs.map((d) => [d.id, d]));

const def = map.get(who);
if (!def) { console.error(`No such participant: "${who}"`); process.exit(1); }
const cp = conv.participants.find((p) => p.id === who);
if (!cp) { console.error(`"${who}" is not in this conversation`); process.exit(1); }

console.log(buildTurnPrompt({
  conv, def, defs: map,
  fromIndex: at ? Number(at) : cp.lastSeenIndex,
  roster: conv.participants.map((p) => map.get(p.id)!).filter(Boolean),
  board: boardOf(conv), project,
  history: {
    path: historyPath(project.id),
    conversations: (await listConversations(project.id)).length,
  },
}));
