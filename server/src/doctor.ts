/** Which participants are discovered in each project, and what tools they end up with. */
import { loadProjects, getProject } from './config.js';
import { discoverParticipants } from './participants.js';
import { toolPolicy } from './tools-policy.js';

for (const p of await loadProjects()) {
  const project = await getProject(p.id);
  const defs = await discoverParticipants(project);
  console.log(`\n## ${project.name}  (${project.path})`);
  console.log(`   product frame: ${project.frame ? `${project.frame.length} chars` : 'NOT SET'}`);
  console.log(`   participants: ${defs.length}\n`);
  for (const d of defs) {
    const pol = toolPolicy(d);
    console.log(`  ${d.id.padEnd(16)} ${d.builtin ? '[built-in]' : `[${d.sourceFile?.split('/').pop()}]`}`);
    console.log(`    ${d.label}`);
    console.log(`    model: ${d.model ?? '(default)'}  ·  persona: ${d.body.length} chars`);
    console.log(`    tools:  ${pol.tools.join(', ') || '(none)'}\n`);
  }
}
