/** Prints the protocol and phase briefs exactly as an agent receives them. */
import { protocolFor, phaseBrief, stringsFor } from './prompts/index.js';
import type { Locale } from './types.js';

const locale = (process.argv[2] as Locale) ?? 'en';

console.log(protocolFor(locale));
// Appended right after the protocol by `buildSystemPrompt`, so it is part of what an agent
// receives and belongs in this preview.
console.log(`\n${stringsFor(locale).answerLanguage}`);
console.log('\n\n=== PHASES ===\n');
for (const [phase, text] of Object.entries(phaseBrief(locale))) {
  console.log(`--- ${phase} ---\n${text}\n`);
}
