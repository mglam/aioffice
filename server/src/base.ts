import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Primitives used by both `config.ts` and `store.ts`.
 *
 * They live here rather than in either one because if `config` imports from `store` and
 * `store` imports `DATA_DIR` from `config`, the cycle makes `DATA_DIR` be read before it
 * exists and the server won't boot:
 * `ReferenceError: Cannot access 'DATA_DIR' before initialization`.
 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, 'data');

/** Atomic write: never leaves a half-written JSON behind. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file);
}

export function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}
