import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { boardOf, listConversations, loadConversation, projectDataDir } from './store.js';
import { getProject } from './config.js';
import { stringsFor } from './prompts/index.js';

export const HISTORY = 'history.md';

/**
 * The one directory the agents get read access to, and it holds exactly one file.
 *
 * It used to be the project's whole data folder — which also holds `conv/*.json`, the raw
 * transcript of every conversation. That granted far more than the history: an agent could read
 * another conversation end to end, bypassing the delta injection that keeps a turn from carrying
 * everything, and spend a great many tokens doing it on one tool call. The grant is now the file
 * it was always described as being.
 */
export const historyDir = (projectId: string) =>
  path.join(projectDataDir(projectId), 'shared');

export const historyPath = (projectId: string) =>
  path.join(historyDir(projectId), HISTORY);

/**
 * The project's history: every conversation held about it, and where each landed.
 *
 * It is NOT injected as context — that would be expensive and is almost never needed. It sits on
 * disk and the agents are given read access to the project's own data folder, so whoever wants to
 * know what was decided last month goes and looks. Regenerated after every mutation, so it never
 * lies.
 *
 * It used to be per roundtable, which siloed it: two groups working on one product could not see
 * each other's conclusions. Now one file covers the product.
 */
export async function writeHistory(projectId: string): Promise<string> {
  const convs = await listConversations(projectId);
  // Agents read this file, so it follows the project's locale, not the UI's.
  const project = await getProject(projectId).catch(() => undefined);
  const s = stringsFor(project?.locale).historyDoc;

  const L: string[] = [s.heading(project?.name ?? projectId), '', s.intro, ''];
  L.push(s.conversations(convs.length), '', '---', '');

  if (!convs.length) L.push(s.none);

  for (const meta of convs) {
    const conv = await loadConversation(projectId, meta.id);
    const board = boardOf(conv);
    const state = conv.closedAt
      ? s.closedOn(conv.closedAt.slice(0, 10))
      : board.blockers.length
        ? s.openWithBlockers(board.blockers.length)
        : s.open;

    L.push(`## ${conv.title}`, '');
    L.push(s.meta(conv.createdAt.slice(0, 10), state, meta.turns), '');
    // Who sits is per conversation now, so it is reported per conversation.
    L.push(s.tookPart(conv.participants.map((p) => p.id).join(', ')), '');
    if (conv.orchestrator) L.push(s.chairedBy(conv.orchestrator), '');
    if (conv.question.trim()) L.push(s.question(conv.question.trim()), '');

    if (board.agreements.length) {
      L.push(s.agreed, '');
      for (const a of board.agreements) L.push(`- ${a.text} *(${a.by})*`);
      L.push('');
    }

    if (board.blockers.length) {
      L.push(s.blocked, '');
      for (const b of board.blockers) L.push(`- ${b.text} *(${b.by})*`);
      L.push('');
    }

    const published = conv.artifacts.filter((a) => a.publishedPath);
    if (published.length) {
      L.push(s.published, '');
      for (const a of published) L.push(`- \`${a.publishedPath}\``);
      L.push('');
    }
  }

  const file = historyPath(projectId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, L.join('\n'), 'utf8');
  // Where it used to live, one level up. Left there it would be a stale copy of this one.
  await rm(path.join(projectDataDir(projectId), HISTORY), { force: true });
  return file;
}
