# The AI Office — notes for working in this repo

A local app that orchestrates discussions between several Claude Code agents. The README explains
**what it does and how to use it**; this is what you need to know to **change it without breaking
it**.

Node + TypeScript. `server/` is Fastify over the Agent SDK; `web/` is React + Vite. No database:
everything is JSON under `data/`. A single process serves both API and front end.

**Two levels, and they are not interchangeable:**

- **Project** (`config.json`, **written by the app**) — path to the repo, `frame` (the product
  frame) and `locale` (the language the agents are addressed in). `config.json` is gitignored: it
  holds absolute paths from one machine. Its own data lives in `data/projects/<id>/`: the
  conversations, `history.md`, and the deliverables staged for them.
- **Conversation** (`data/projects/<id>/conv/<cid>.json`) — one topic, and everything specific to
  it: the question, the deliverables, the chair, **who sits**, the transcript and the SDK
  sessions.

**There used to be a third, and knowing why it went matters.** A **roundtable** sat between them
and owned exactly one thing: who sits. Once the people themselves became global or project-scoped
(see «Personas are global» below) the group had nothing left to own — the project keeps the
history, and *which* of those people speak about a topic was always the topic's business. So the
layer was removed. `migrateRoundtablesToProjects()` folds the old tree in; `data/roundtables/` is
renamed to `data/roundtables.migrated`.

Do not reintroduce it. If you find yourself wanting a standing group, what you actually want is
the default the new-conversation dialog already has: the seats from the project's last
conversation.

The on-disk layout has changed twice. `migrateRooms()` and `migrateMesas()` in `store.ts` convert
the older models; both run at boot and rename the old tree aside (`data/rooms.migrated`,
`data/mesas.migrated`). **Don't delete either** until you are sure no machine still has an old
tree. Two more complete the set: `migrateProjectLocales()` in `config.ts` stamps `locale: 'es'` on
projects that predate the field (they were registered when the app was Spanish-only), and
`migrateChairToConversation()` in `store.ts` moves `orchestrator` off the roundtable onto each of
its conversations and drops `purpose`, saving any non-empty purpose to
`purpose.migrated.txt` first — it was text the user wrote. `migrateRoundtablesToProjects()` is the
newest and the largest: it removes the roundtable level entirely.

**Every migration is frozen against the layout it converts**, with its own local path helpers and
its own local types (`OldRoundtable`, `oldConvDir`, …). That is deliberate: a migration reaching
for the *live* path functions breaks the next time the layout moves, which is precisely when it
still has to work. They run oldest-first at boot, and the newest depends on the older ones having
produced the tree it folds in.

---

## Invariants

Things that look improvable and are not. Each is this way because the alternative was tried and
failed.

**The frontmatter in `.claude/agents/*.md` is NOT valid YAML.** Real descriptions contain `: `
unquoted (*"…a real buyer's reaction: what they understand…"*) and `js-yaml` rejects them as an
incomplete mapping. Claude Code reads them with a tolerant parser. That is why
`server/src/frontmatter.ts` exists. **Do not replace it with `gray-matter` or any strict YAML
parser** — it breaks participant discovery. (`gray-matter` used to be a declared dependency
without being used; it was removed.)

**The `claude_code` preset overrides the persona.** With `{ preset: 'claude_code', append:
<persona> }` the agent introduces itself as "Claude Code" and ignores its character. Measured.
That is why personas use a custom `systemPrompt` string, and the preset is left only for the
built-in `claude-code` participant, which is exactly what you want from it.

**`permissionMode: 'dontAsk'` is what makes a never-used folder work.** Running Claude Code by
hand in a new directory asks whether you trust the files in it. The SDK does not hit that, and the
reason is in the types: the CLI applies its trust filter *before honoring escalating modes*
(`bypassPermissions`, `auto`, `acceptEdits`). `dontAsk` is the opposite of escalating — "don't
prompt, deny if not pre-approved" — so there is nothing for the trust tier to gate. Combined with
`settingSources: []`, the target folder contributes no settings at all, so it has nothing to be
trusted for.

Verified against a directory created seconds earlier: the frame drafted in 14s with no prompt. If
you ever switch a mode here to `acceptEdits` or `bypassPermissions` "to make it smoother", you
will reintroduce the trust gate on exactly the case onboarding exists for — a project the person
has never opened before.

**`tools` limits the context; `allowedTools` only auto-approves.** They are different things and
you have to set both. With `allowedTools: []` the model still receives every schema: 28.6k tokens.
With `tools: ['Read','Grep','Glob']`, 15.6k. The SDK docs are explicit: *"to restrict which tools
are available, use the `tools` option"*.

**`settingSources: []` is deliberate.** Loading the target repo's settings would bring its hooks
(the reference project has a `Stop` that would run on every turn of every agent) and its permission
allowlist (which includes `git push` and `git commit`). The project's `CLAUDE.md` is read and
injected by hand, in `turn.ts`. **Do not "fix" it to `['project']`.**

**`withConversationLock` (in `bus.ts`) is not reentrant.** Calling a function that takes the lock
from inside a block that already holds it hangs the conversation forever — `busy: true` with no way
out, not even by opening another conversation. It happened once (marking a turn as cut). If you need
to mutate the conversation from inside a turn, do it on the object you already have in hand, before
the `saveConversation`.

**Agents never have `Edit` or `Write`.** Documents are written by the backend: the agent returns
markdown and the server saves it. Do not give a participant write tools "to make it more
practical".

**Nothing is ever written into the user's repo except a published deliverable.** That is the
*only* write path out of the app: deliverables stage to
`data/projects/<projectId>/artifacts/<convId>/` (`stagingDir` in `store.ts`) and reach
`<project>/AISPECS/<conversation slug>/` when someone publishes them. Do not add a second.

There briefly was one — generated personas were written into `<project>/.claude/agents/` with an
`ai-office-` prefix and a delete guard to keep them from colliding with hand-written files. All of
that machinery disappeared when the personas became global; if you find yourself reinventing the
prefix, you are about to reintroduce the write path it existed to make safe.

**Personas are global, not per project** (`data/personas/`, `personas.ts`). Two reasons, and the
second is the one that matters:

1. **The file never needed to live in the project.** A participant's persona reaches the SDK as
   `systemPrompt: buildSystemPrompt(def, …)` — a string built in-process in `turn.ts`. The `.md` is
   only where the text was read from. This app's own `frame-writer` and `agent-writer` have always
   worked that way: they live here and run with `cwd` set to someone else's repo.
2. **A persona written *for* a product can only ratify it.** When generation read the target repo,
   the domain specialist came back reciting the product's own model — internal ids, node names,
   state enumerations — which is exactly the independence it was seated to provide. A person who
   belongs to no product cannot be over-fitted to one. Their authority comes from their field; the
   product arrives when they are seated, through the frame on every turn, `CLAUDE.md` for the
   technical profiles, and `cwd` plus `Read`/`Grep`/`Glob` so they can go look.

**Writing for a project is the one way a repo gets read, and it may only answer a blank knob.**
Some knobs have no sensible default — "which field does this person know" pick-wrong is worse than
useless — so `generatePersona` takes an optional `projectId`, which is both the scope and the repo
to read. With one, `cwd` is that repo and the writer keeps its filesystem tools; without one,
`cwd` is `ROOT` and `toolLimit` strips them to `['WebSearch', 'WebFetch']`, because standing in
`ROOT` with `Read` the writer would ground the persona in *this app's* source, the one repo it
must never describe.

What crosses over is **the blank knobs always, and the product's shape only for an inside role** —
per the grounding split above, and the writer defers to the archetype brief for which it is. Measured on
haiku with `specialty` left blank: with no project the writer invented *electrical distribution
networks*; pointed at a warehouse-robotics product it came back with that field and named the
product zero times. Reading costs about 4× the turn ($0.19 vs $0.05 on haiku).

If you touch that prompt, generate an **outside** role for a project and grep the output for the
product's name before believing the rule held. That is the case that broke before.

`deletePersona` guards on the **directory**, not a prefix — everything in `data/personas/` is the
app's own to remove, and a persona somebody wrote by hand in their repo is not reachable from
there at all. It still rejects ids that are not `[a-z0-9-]+`, because the id arrives from a URL.

**Three kinds of person can work on something, and the difference is who may change them.** The
People screen lists them apart rather than as one list with a badge, because what you can *do* to
a row differs per group and a list whose actions change row by row is one you read twice:

1. **Global** — in the pool, no `project:`. Written from the role alone, offered everywhere.
2. **Written for one project** — in the pool with `project: <projectId>`. Offered only there.
3. **Inherited from the repository** — the `.md` files in `<project>/.claude/agents/`. Read off
   disk, seatable, and **never** written, edited or deleted by the app. An id here wins over the
   app's own. It is a listing of files and nothing more: no model is ever run over them, which is
   why `agent-summarizer` has no caller (see "not here yet").

**Scope and grounding are two different axes, and conflating them is a mistake I made twice.**

**Scope** asks *does this person mean anything without a particular product?*

- **Global**, because their usefulness is the craft: **sales** (selling is selling — a salesperson
  sells anything), **domain-specialist** (an IP specialist is worth seating at every project that
  touches a network), **facilitator** (it knows only the conversation).
- **Project**, because they are nobody in the abstract: **pm** (a product manager in general is
  nobody; what makes one useful is being the product manager *of this product*),
  **customer-business** and **customer-technical** (a potential buyer is always a buyer of
  *something*, and the engineer who would have to run it has to have something to run),
  **software-architect** and **developer** (that architecture, that codebase).

Each archetype declares its own answer as `scope:` in its frontmatter, and the form opens the
scope select on it — picking a role sets it, changing the role resets it, and you can still
override. Where a role belongs is a property of the role, so it should not be something you have
to know. (No inline comment on that line: the tolerant parser takes everything after the first
colon as the value, so `scope: project   # because…` would parse as exactly that.)

**Grounding** asks *may they describe the product at all?* — and that is the old inside/outside
split, unchanged, because it is the one that produced the first persona disaster.

- **Inside** — pm, sales, architect, developer. Written for a project, they may hold its shape and
  — the load-bearing part — the vocabulary its team uses for its own concepts. Someone inside who
  calls the central entity by the wrong name is not credible.
- **Outside** — domain specialist, both customers, facilitator. Written for a project they still
  describe **nothing** about it. What the repo gives them is which field, which technologies, and
  what kind of organisation buys this — never the product's internals. A customer who recites a
  feature list is not a customer.

The two cross: **sales is inside but global**, and **the customers are outside but project-scoped**.
That combination is why one axis cannot carry both, and the second time round it is what tells you
the archetype briefs are right — they were written against grounding, so re-mapping the typical
scope changed none of them.

Neither axis ever licenses a feature list, an internal identifier, a node or table name, a metric
value or an enumeration of states: those age within a month and a persona is re-sent on every
single turn.

**Scope lives in the persona's frontmatter, not in a directory.** One flat `data/personas/`, and
`project:` says who it belongs to. That keeps ids unique across both kinds — otherwise a global
and a scoped `edvaldo-ramos` would collide at discovery — and makes changing someone's scope an
edit rather than a file move.

**Scope is also what licenses reading a repo, and that is the point of it.** Writing someone *for*
a project is the only path that reads that project: it is how the knobs nobody answered — which
field, which technologies — get a real answer instead of a guess. A global person is written from
the role alone, because if you needed the repo to write them, they are specific to it. What
crosses over is still only the answer to a blank knob; the no-leak rule below is unchanged.

**A role can be filled several times over, on purpose.** Three specialists tuned differently make
a better table than one, so `generatePersona` always *adds*; `replacing` is how you rewrite one.
Ids are the person's invented name (`freeId` suffixes a collision), and the archetype they fill is
recorded in `role:` — guessing the seat from `nora-bianchetti` would not work.

**What distinguishes two people in one role is the tuning.** Each archetype declares its knobs in
its own frontmatter, `param-<id>: <kind> | <label> | <a, b, c>` — pipes rather than more colons,
because the tolerant parser splits on the first colon and everything after it is the value. The
third field is the options for a `choice` and the placeholder examples for a `text`, which is why
it is only comma-split for the former. The chosen values are stored back as `tuning-*` in the
generated persona, so regenerating starts from them instead of from nothing.

An unanswered knob is deliberately **not** defaulted in code: the writer picks something coherent,
which beats a default that makes every unset persona identical. Requiring an answer was tried for
`specialty` and reverted — the reference repository below is the better answer, because it lets
the blank be *filled* rather than merely refused.

**Discovery merges two sources** (`discoverParticipants`): the global pool and the project's own
`.claude/agents/`, so bringing your own personas keeps working. **A local id wins a clash** — it is
the one somebody wrote deliberately — and without that rule the same id would resolve differently
depending on merge order. Pool entries are tagged `pooled: true`, which is how `summaries.ts` tells
"hand-written, needs a description written for it" from "already has the archetype's".

`migratePersonasToPool()` moves the `ai-office-*` files the old flow left in project repos into the
pool and deletes the originals — leaving them would seat the same person twice, once from each
source. It runs at boot and is a no-op afterwards.

**Generating a `CLAUDE.md` for a repo that lacks one was considered and dropped.** It is tempting —
the technical profiles receive it injected, and it would give the frame writer better material next
time. But `CLAUDE.md` is a file the repo's own people write and Claude Code reads on every session
there, so writing one is meddling in something outside this app's business, with a real chance of
overwriting or contradicting what a team meant to say. The frame lives in this app's `config.json`
for exactly that reason. A repo with only a README works fine.

**Archetypes are not agents, and that is why they live apart.** `.claude/archetypes/*.md` are
briefs `agent-writer` turns into a person. They use the same format and the same `readAgentDir()`,
but they are not runnable — putting them in `.claude/agents/` would make `officeAgents()` offer
them as dispatchable.

**Opening the setup flow never spends money.** Every model call sits behind a click. The one
automatic draft — the frame for a project that has none — runs precisely because there is nothing
there to overwrite; a project that already has a frame shows it verbatim behind a re-propose
button, and the people in the pool are read off disk, never re-run. If you add a step to that flow,
keep the rule.

**One component creates and configures, and the only difference is which steps are reachable.**
`ProjectSetup` opens a step once its prerequisites hold: a new project has none satisfied so it
walks 1 → 2, an existing one has all of them so both are open. That is deliberately one rule
rather than a mode flag threaded through the UI — resist adding the flag back.

**The app's own agents are dispatched inline, never discovered from disk.** They live in
`.claude/agents/` and are loaded by `officeAgents()` in `participants.ts`, then passed to the SDK
as `agents: { name: def }` plus `agent: 'name'` — which, per the SDK types, *"applies the agent's
system prompt, tool restrictions, and model"* to the main thread. **Do not switch this to
filesystem discovery.** Claude Code finding `.claude/agents/` itself would need
`settingSources: ['project']`, which also loads this repo's hooks and permission allowlist — the
invariant two entries up. Inline keeps both properties: agents in files, settings isolated.

**`discoverParticipants` skips the project's agents when the project *is* this repo.** Otherwise
pointing the app at itself — normal dogfooding — offers `frame-writer` as someone to seat.
`claude-code` is built in, so the app stays usable as its own project. The guard is
`path.resolve(project.path) === ROOT`.

**Two kinds of prompt, and only one of them is measured.** `server/src/prompts/` is the turn
protocol: measured, load-bearing, do not touch without re-measuring. `.claude/agents/` is
one-shot drafting work whose output a human reads and corrects before it is used — safe to tune.
That is why `frame-writer.md` carries a single set of instructions with the output language passed
per call, while `prompts/` keeps a fully separate pack per language.

**The board is derived from the transcript** (`boardOf` in `store.ts`), never stored separately. If
you cache it, it drifts out of sync with what was actually said.

**It is not shown in the UI any more, and that changed nothing about behaviour.** Every turn
prompt still receives it (`renderBoard` in `prompts/index.ts`) — that is what keeps agents from
re-litigating, and it is the load-bearing use. The panel in the right column was a summary of what
the transcript already shows on each turn, sitting in a column that is otherwise the
conversation's settings.

Removing it took the client's `board` state with it, which had been written by four code paths and
read by one. Two of those paths were an extra `GET` of the whole conversation on **every** `entry`
event, purely to recompute a panel. `conversation_updated` went too: it was declared in `bus.ts`
and published by nothing.

**The history is a tool, not context.** `history.md` is regenerated after every mutation and the
agents receive *the path*, not the content: reading it costs one tool call only when someone needs
it, instead of tokens on every turn. Access comes from `additionalDirectories` in `turn.ts` —
without that, `Read` outside the `cwd` is refused. SDK sessions are **not** reused across
conversations: each topic starts clean.

**The grant is `data/projects/<id>/shared/`, which holds that one file, and it must stay that
narrow.** It used to be the project's whole data folder, which also holds `conv/*.json` — the raw
transcript of every conversation. That handed an agent two things nobody meant to give it: another
conversation end to end, and its own conversation whole, which walks straight around the delta
injection that keeps a turn from carrying everything. One `Read` could also cost more tokens than
the turn it was serving. If you ever need to expose something else to the agents, put it in
`shared/` — do not widen the directory.

**It is one file per project**, covering every conversation held about that product. It used to be
one per roundtable, which siloed it: two groups working on the same product could not see each
other's conclusions. That was a real loss and removing the layer fixed it — do not scope it back
down.

**The transcript is normalized on load** (`normalize` in `store.ts`). The schema kept growing —
`question`, `deliverables`, `markers.lifts`, artifact ids — and there are conversations on disk from
every era. When you add a field, add its default there, not a `?.` at every use site.

**A cut turn is flagged, not sniffed.** `entry.cut` is a boolean set by `markCut`. The UI used to
detect it with `entry.error.startsWith('Cortado')`, which broke the moment the message became
locale-dependent. Don't go back to matching on the text.

---

## Two languages, and they are not the same axis

**The interface** is i18n'd in `web/src/i18n/` (`en.ts`, `es.ts`, and a provider). English is the
default; the choice is per browser, in `localStorage`. `Dict` is `typeof en`, so `es.ts` is typed
against it and a missing key is a compile error rather than a blank label.

**The agents** get their language from the project's `locale`, and it lives in
`server/src/prompts/`: `strings.ts` is the contract, `en.ts` and `es.ts` are the packs, `index.ts`
holds the builders. Everything an agent ever sees goes through a pack — the protocol, the phase
briefs, the deliverable instructions, the board headings, the history file, and even the system
notes the app writes into the transcript.

**Don't put agent-facing text anywhere else.** If you find yourself writing a Spanish or English
string inside `orchestrator.ts` or `history.ts`, it belongs in `PromptStrings`. Two of those were
missed on the first pass and had to be moved.

**The language an agent answers in is stated, not implied** (`answerLanguage` in the packs,
appended by `buildSystemPrompt` right after the protocol). It used to be implied — the protocol is
written in the project's language, so the model followed — and that stopped being enough when the
app's own personas became global and English. A persona is the bulk of the system prompt, so an
English one under a Spanish protocol is a lot of text pulling the other way.

It goes **before** the `CLAUDE.md` injection deliberately. Appended last it would sit underneath
thousands of lines of somebody else's document, which is where instructions go to die.

That is also what decides the pool's language: **every persona the app writes is in English**, and
one language in the pool is what lets one person sit at a Spanish project and an English one.
Writing them in the project's language would re-fragment exactly what making them global unified.
A persona brought by hand in a repo can be in any language — the same line makes it answer in the
project's.

The knobs, the `role:` and the option values stay English too, but those are identifiers rather
than prose: they are what the writer prompt consumes and what `tuning-*` stores.

**The marker parser accepts both keyword sets, always** (`markers.ts`). Not just for the locale in
force: transcripts written before the English protocol have to keep parsing, and an agent whose
persona is in one language sometimes answers in the other. The `Markers` type field names are
English (`asks`, `agreements`, `blockers`, `lifts`, `closes`); the *wire* keywords are per
language.

**The Spanish pack is the measured one.** The convergence numbers below were taken against the
Spanish text, which is kept verbatim in `prompts/es.ts`. The English pack is a translation that
preserves its structure and emphasis but has **not** been re-measured. If you care about the
numbers for an English project, measure them.

---

## UI traps

**In the folder picker, where you are standing is what is selected.** Navigating — into a folder
or up out of one — reports that directory as the choice, so the header's path, the validation line
and whether you can continue all describe the same place.

They were two things once: clicking a row selected *and* entered, while `↑` only entered. Enter a
repo, go back up, and the selection stayed on the repo while the list showed its parent — the badge
still read "8 agents" and Next stayed enabled for a folder you were no longer looking at. Greying
and the `›` chevron are navigation guidance, not a rule about what may be chosen; the caller
validates whatever directory you land on.

**The section bars carry a top rule and no margins, and that is not a style preference.** With
`margin-top` plus a bottom border, whether two bars are adjacent depends on whether the one above
is collapsed — and a sibling selector cannot see that. `bar + * + bar` matched only when exactly
one node sat between them, so collapsing left a white gap under some sections and not others,
which is what the screenshot showed. One top rule and no margin stacks identically in every
arrangement.

**A conversation is configured where you are looking at it, and there is no manager dialog.**
The right column is its settings — the question, the brief, the chair, who sits, the deliverables.
There was a `Conversations` dialog behind a gear, matching the pattern projects use; it was a
second place to read the same list. The gear pattern still fits **projects**, because a project's
settings are not on screen while you work; a conversation's are.

**The rail shows titles and nothing else, and the open one's title is a field.** Renaming belongs
where the name is shown, so it is not in the right column either. The input is **uncontrolled**,
with `key={id + title}`: a controlled value fights your typing on every background refresh, and
the key in it is what makes the field pick up a title changed from somewhere else. It saves on
blur and on Enter, reverts on Escape, and refuses an empty name rather than saving one.

Its row is a `div`, so `div.room-item` has to undo `.room-item`'s pointer cursor and hover shift —
the row is already the current one, and moving under the cursor would only look like a click did
something.

**The right column is three collapsible sections: Context, Participants, Deliverables.** Nothing
else, and each is edited where it is shown rather than behind a button.

`Section` in `App.tsx` renders one, and the header is a **bar** — painted, ruled top and bottom,
the whole row a single target. A caret on its own was too quiet to read as "this opens and closes":
11px of punctuation in a column that already has chevrons, carets and hues doing other jobs.

**Nothing else lives on the bar.** `+ seat` was on it and moved inside the section, under the list
it adds to: a second control on a row whose entire job is to collapse is a target you will
eventually hit meaning the other one. That is why `Section` has no `action` prop, and why
`.eyebrow-act` is gone.

- **The standing question is not shown there.** It was, read-only, and it went: you set it by
  typing it in the bar, so a copy of it in a column of settings was one more thing to scan past.
  It lives in the turn prompt, which is where it does its work.
- **The context is shown**, not hidden behind «Add context». It is what every participant reads on
  their first turn, so it has to be visible while you are deciding whether to run one. Click it to
  edit.
- **Selected first, in both lists.** Ticked deliverables and seats that are in the round sort to
  the top, so each list reads as what this conversation *is* with the rest available underneath.
- **The seats are alphabetical, and the one not taking part keeps its place.** It used to sink to
  the bottom and fade to 42%, which was meant to make the list read as who is *in* — but the empty
  ring already says that, and a row shunted to the end and greyed reads as a mistake rather than as
  something you chose. Only the name dims now.
- **Seating is a dialog, not a row of chips** (`SeatPicker.tsx`). An id on a chip
  (`cliente-negocio`) says almost nothing about who you are about to seat; what you want to read
  is the first heading of their persona and where they came from, and that does not fit on a chip.
  Multi-select, because seating three people is one decision.
- **A seat's checkbox writes `enabled`, not just the round selection.** Those were two names for
  one idea and only one of them survived a reload — the UI moved `selected` and the persisted flag
  was never touched by anything. Taken-out seats **sort to the bottom and grey**, so the list
  reads as who is actually in this conversation. The patch is optimistic (no full reload) because
  it is a checkbox.
- **Every deliverable type is listed with a yes/no**, not only the chosen ones. What a conversation
  is *for* is a decision you revise, and a list that hides the unchosen gives you nothing to
  revise it with. A new conversation has only `decisions` ticked. Unchecked rows stay legible
  rather than near-invisible: it is a choice you might reverse.
- **Pressing a deliverable opens its document; only the checkbox toggles it.** The row was one
  `<label>` around both, so reaching for it to *read* the deliverable forwarded the click to the
  checkbox and unticked it. Same row, opposite outcome, and nothing on screen said which you would
  get. Restyling the little file line underneath did not fix it — the server log settled that: the
  browser never once requested the artifact, so the click was never landing there at all. The name
  is now a button when something has been written and a `<label htmlFor>` when nothing has.
  (There were also two `.artifact-file` rules, one left from before it was a button.)
- **`markdown.tsx` renders headings at their own level, and drops HTML comments.** Every heading
  used to come out as `<p><strong>`, which is fine for a turn and useless for a deliverable: five
  thousand words with six heading levels all the same size has no shape. Every generated document
  also opens with a provenance comment meant for the file, not the reader. Ordered lists,
  blockquotes, rules and fences are there for the same reason — a real document uses them. Still
  no dependency, and it should stay that way.
- **A deliverable row is a checkbox and the documents it produced.** «Write it now» went — it
  wrote one document immediately, which nobody could tell apart from publishing it to the repo,
  and ticking one deliverable and pressing Play does the same through the one engine. «Signed by»
  went too: the author resolves from the archetype (`DEFAULT_AUTHORS` picks the pm for decisions,
  whoever sells for a proposal), and overriding it was not a decision anyone was making. The
  `POST C/artifacts` route stays — it is a documented interface, and the session path calls
  `makeArtifact` through it.

**Deleting is a mode, from the bin beside the `+`.** An `×` on every row reads as a warning about
the whole list, and one that only appears on hover cannot be found on purpose. You reach for the
bin, the rows turn red and say to pick one, and the pick still asks — a transcript cannot be
recovered. What was published to the repo is untouched, and the prompt says so.

**Only the open dialog is mounted, and that is the fix — not the state shape.** `App.tsx` keeps a
single `Modal` union *and* renders each dialog behind `modal?.kind === '…' && …`. The union alone
was not enough: with every dialog mounted and `showModal()`/`close()` driven from sibling effects,
the order those effects run in, and the `close` events they fire (each running its own `onClose`),
decided what ended up in the top layer — and two dialogs got there anyway. «Nueva mesa» sat on top
of the setup wizard with an empty participant picker and a permanently disabled submit, and the
wizard underneath was inert, so neither could be used.

An unmounted `<dialog>` cannot be in the top layer. Do not go back to keeping them all mounted,
and do not reintroduce per-dialog booleans.

**Archetype `aliases` are still parsed, and nothing reads them any more.** They existed for the
"roles this project is missing" diff, which offered every archetype to a project whose agents are
named in Spanish, then mislabelled the customer's engineer as the customer's decision maker when
the alias `cliente` prefix-matched a longer id. The diff went away with per-project
personas: the pool lists who exists and adding is a deliberate act, so nothing has to guess which
seat a hand-written file fills. Left in place because a future "you have nobody for X" hint would
want them, and because scoring by alias length is the non-obvious part worth not rediscovering.

**No persona is grounded in a product, and the road to that rule is worth knowing.**
`agent-writer.md` first told every archetype to ground itself in "real nouns, real constraints,
real gaps" from the repo. For a PM or an architect that read as right — the product's specifics
look like their material. For a domain specialist it was a disaster: the persona came back full of
internal ids, node names, state enumerations and metric values, which is precisely the model it
was seated to judge from outside.

The first fix split the archetypes into inside and outside roles, and only the outside ones were
forbidden from describing the product. Making the personas global removed the distinction
altogether: **every** archetype is now grounded in the practice of its own field, and every one
carries the sentence that does the work — *when what is on the table and their own judgement
disagree, their judgement is what they report.* An inside role says how it forms a judgement and
that it reads before it asserts, rather than what it already believes; a remembered product is
stale within a month, and the persona can read the repo when it is seated.

**Every persona gets a name, functions included, and the name is not the biography.** They sit at
a table and have to address each other: a participant who is only "the product manager" gets
talked *about* rather than *to*, and a table where three have names and two do not reads as though
two of them are furniture. It also shows in the transcripts — an agent that knows a name uses it
("Elena, on an ordinary Tuesday in your operation…") while still addressing the marker to the id.

The two halves are separate. A **person-role** gets a name *and* a short situation — about
**them**, never about anything they are working on — because someone arguing from a position holds
it consistently. A **function** gets a name *and nothing else*: no invented history, no employer,
no war stories. That was the original rule ("do not invent a biography for those") and it still
holds; what changed is that withholding the *name* along with the biography was throwing away the
useful half.

**Addressing is by id and only by id.** `markers.ts` resolves `FOR @x` against seated ids, exact
and case-insensitive, and **silently drops anything else** — a made-up handle must not send the
turn off to nobody. So a name in the roster is for prose, never for the marker. If you ever make
the resolver tolerant of names, make the drop visible first: today a mis-addressed ask vanishes
with no note, no turn handed and no block on convergence.

**A repo's own personas are often titled by role, and the app names them without touching the
file** (`names.ts`). "El técnico del cliente" cannot be addressed; someone who is only a role gets
talked *about* rather than *to*. The app must not edit `<project>/.claude/agents/`, so the name is
invented once, kept in `data/projects/<id>/names.json`, applied in `discoverParticipants` — which
is why the roster, the seat rows and the artifact prompts all get it from one place — and told to
the agent itself through `yourName`, because otherwise it would be a name everyone at the table
uses except the person answering to it.

**`names.json` records who was *asked*, not who has a name.** A persona whose own heading names
them gets an **empty string**: asked, has their own. Keying on "has no name" instead made them a
candidate on every run, so a second click paid for a call that could not add anything —
`added: 0` at $0.0066. With the sentinel a repeat run is free and the button hides itself.

The namer only ever returns a name. Nothing else about them is the app's to decide: whoever wrote
that file said everything else already.

If you reintroduce repo reading into generation, check a specialist's output before believing it
helped.

**What an existing agent is for comes from its own file first, and a model only on request.** The
first `#` heading in a persona is usually already a one-line summary — "Arquitecto de software —
dónde vive cada cosa, y por qué" — so `summaryOf` reads that, falling back to the first sentence
of the frontmatter description. Free, and right most of the time.

`agent-summarizer` was built for where it is not: a heading that is a person's name ("Elena
Duarte — dueña de Fibra Andina" does not say they are the customer who signs), or two agents whose
headings do not distinguish them. It runs once for all of a project's agents, behind a click, and
caches to `data/agent-summaries/<projectId>.json` keyed on a fingerprint of the personas' ids and
mtimes.

**It currently has no caller.** The inherited group is a listing of the repo's own files and
nothing more — running a model over somebody's `.claude/agents/` to relabel them was tried in the
UI and rejected. `summaries.ts`, the two endpoints, `api.agentSummaries`/`writeAgentSummaries` and
`.claude/agents/agent-summarizer.md` are all still there and all unreferenced; decide whether to
delete them rather than leaving that undecided.

**People are not configured in the project flow, and the step that did it was a second door onto
one room.** You configure someone standing in a project, which is exactly where the People screen
is opened from — so a third wizard step showing the same component only made the same thing
reachable two ways. `ProjectSetup` is the folder and the identity, which is all a project *is*.

Registering the project when step 2 is confirmed is what makes that work: People needs a
`projectId` to offer a scope and to list the inherited agents, and abandoning the flow leaves a
named project with no conversations — harmless, resumable, and a normal state anyway, since this
same flow is how you edit one. What it costs is trust, hence the `justCreated` note, which now
also says where the people are.

**One refresh-with-AI control per screen, and the step decides what it re-reads.**
`ProjectSetup` builds a single `refresh` descriptor from the current step and renders one
`AiRefresh` in the dialog header. Two copies of it on one screen — header and inline beside a
section heading — made one affordance look like two features, which is worse than not having it.

The rule is per screen, not per app: a component mounted on its own, with no dialog header to put
a button in, puts one beside the section it acts on.

**Adding a person and editing one are the same form, and it is inline.** `People` renders one
`Draft` either way; `editing` carries the id being rewritten, which fixes the role and pre-fills
the knobs from what that person was written with. There is nothing else to decide when editing,
so there is nothing else to build — and a second form would drift from the first the next time an
archetype gains a knob.

It is inline and not a `<dialog>` because this component is already inside one, and two dialogs in
the top layer is the trap two entries up. That is also why editing has no `confirm()`: the form is
the deliberate act, and its own footer says that generating replaces the text.

**A control that is working must not look disabled.** `AiRefresh` (`web/src/AiRefresh.tsx`) stays
lit and spins while it runs, reporting `aria-busy`, rather than greying out. The first version
disabled itself mid-run, which hid the one element on screen saying something was happening — the
moment you most want to find it. It refuses the second click without going quiet about it.

**`confirm()` is for what cannot be undone, and nothing else.** Refreshing the frame does not ask,
because nothing is written until the step is confirmed and «Discard changes» restores the previous
values. Regenerating a persona does ask, because it overwrites a file on disk immediately. The
same line separates deleting a conversation or a project, which also ask. A prompt in front of a reversible
action reads as a warning and trains people to click through the ones that matter.

**The question is what you type in the bar, not a field you configure.** Play in a question mode
writes the box onto `conv.question` and then runs. Leave the box empty and it carries on with the
question already standing.

It is still **stored on the conversation**, and that is not a contradiction — it is the whole
point. The question is re-injected into *every* turn (`questionFocus` / `questionDeferred` in
`buildTurnPrompt`), which is what keeps five agents pointed at one target instead of at a topic. A
moderator note is shown once; by turn five nobody would still have the target in front of them. So
the box is the **input**, the conversation is the **storage**, and the rail only *shows* it —
putting an editor there too would be two doors onto one room.

**One converging engine, and the two guards on it were both wrong.** `runSession` needs neither a
question nor a deliverable:

- `converged()` never looks at the question — it is closed + nothing pending + no blockers — and
  every use of the question in the prompts is already guarded by `conv.question.trim()`. So a
  session with no question converges on producing what the conversation was opened to produce.
- With no deliverables ticked it converges and writes nothing, which is exactly "let them talk
  until they are done, but don't spend on documents".

That is what killed `takeAuto` — 80 lines, a route, and `api.auto`. It was `runSession` minus the
phase briefs, minus the convergence check and minus the documents, and all three of those are now
reachable by not asking for them. **Unticking the deliverables is a better control than a second
engine**, because it is the same list you would have unticked anyway.

| mode | what only it does |
|---|---|
| `answer` | the box becomes the standing question, then the converging session |
| `sweep` | the only **parallel** one — everyone answers the same snapshot, so the first speaker cannot anchor the rest |
| `deliver` (default) | the same session with no question: they converge on the deliverables. Default because it needs nothing typed in first, so Play is live as soon as two people are seated |

Also dropped: **"one round, in turns"** was one cycle of the engine with the phase brief removed,
and "step through it" is `answer` plus the stop button beside it.

**Recovering `runConducted` cost an hour, so: the chaired loop lives between `noteOpen` and
`runSession`.** Deleting `takeAuto` by slicing from its declaration to the next column-0 `}` took
`runConducted` with it — the closing brace it found belonged to a nested block. It was recovered
verbatim from the session transcripts (`~/.claude/projects/*/*.jsonl`), which is worth knowing as
a recovery path in a repo with no git history. Slice by *both* boundaries next time.

**Order is `nextSpeaker(board, remaining)` in every sequential mode**, recalculated before each
turn: whoever has a pending question aimed at them goes first. It is never the seat order, and
that is the fix for a question asked on turn 2 of a round of seven going unanswered for six turns.

`resolve` is the default, but a conversation with no question opens on `explore` — otherwise it
would show a dead Play with no reason why.

**The bar is a mode, a play and a stop, and everything it used to hold was a duplicate.** Two
round buttons became two entries in the mode select (parallel and sequential were always modes).
The round-count input went: it was 4, and it was never the interesting decision. The
say/redirect button went because ⌘↵ is what anyone typing already reaches for — and mid-round
that is the redirect, which is the one thing with no button.

The chip-per-participant "give them the floor" went for a better reason: **a round with one seat
ticked is exactly one turn.** No capability was lost, and who speaks now lives in the right
column next to who sits, instead of being two lists of the same people in two places.

`canPlay` is where the preconditions live: `once` runs with a single seat, the rest need two, and
`resolve` needs a question because there is nothing to converge on without one. The progress that
the stop button's label used to carry (phase, round *n* of *m*, which deliverable is being
written) is in the hint line under the bar, which is text rather than a control.

**Whatever you type lands in the transcript, and `play()` is the only thing that sends it.**
It did not, and the bug was invisible in exactly the default case: only `openRound` posted the
moderator entry, while a session merely passed the text along as its first-round `note`. That
reaches the agents through the prompt and is **never recorded** — so in `deliver`, which is a
session and the default, you watched them answer something you could not see yourself having
said.

Posting from `play()` rather than inside each runner means it happens exactly once, and the text
is handed down as an argument instead of being re-read from `note` — which `setNote('')` has
already emptied for the next render. Nothing needs a reload: `addModeratorMessage` publishes an
`entry` over SSE.

Sending it *and* passing it as `note` is not a duplicate: `buildTurnPrompt` skips a `note` that
already appears among the moderator entries it pulled out of the transcript. Keep that check if
you touch either side.

**Every long operation is fire-and-forget + SSE.** A session takes minutes; hanging it off the HTTP
request kills it by timeout. The `auto` and `session` endpoints start and return; progress goes over
events. Useful side effect: closing the tab does not stop the discussion.

**Per-conversation state is cleared when you switch.** `live`, `board`, `session`, `auto`,
`openRoundtable`, `seating`, `stopping`. Otherwise an in-flight turn from another conversation keeps painting
over the new one — that is how a participant who wasn't even seated appeared, "speaking" and never
advancing.

**The transcript is what was said, and nothing else.** Which tools ran, what the turn cost, which
phase it was in, **the marker block**, and — while a turn is being written — the half-finished
text: all of it is in a panel behind the speaker's name (`Detail` in `Transcript.tsx`). The column
holds the speech.

**The panel is sized for the marker block, and it is clipped by the transcript.** Two things
follow, and both are easy to undo by accident:

- It is **wide before it is tall** (`min-width: 22em`, up to `42em`) — width is what stops seven
  one-sentence markers wrapping into a column twice as tall. `width: max-content` keeps a turn
  with only a cost line small.
- The last few turns open **upward** (`.thread > *:nth-last-child(-n+4)`). `.transcript` scrolls,
  so it clips: a panel anchored below the name on the final turn opens into nothing. The `4`
  counts the end-of-thread sentinel and any live turn, and errs towards flipping one turn early —
  harmless — rather than one late, which loses the panel entirely.

The markers were the hard call, and they were in the column for a while on the argument that a
question put to someone *is* the conversation. Read end to end that turned out to be wrong: turns
here run 1,500–5,500 characters and carry **two to seven** marker boxes each, so between every two
turns sat four boxes of clipped restatement of what you had just read. That is where you lose the
thread. What was said carries the conversation; the markers are for auditing how the app read
it — which is exactly what the panel is for.

**Hover *and* click, and both are needed.** Hover alone cannot be read: the moment you move
towards the panel to scroll a long tool list, a hover-only panel is gone. So hovering reveals it
and a click pins it, one at a time.

**Whoever holds the floor is shown by the ring pulsing, in both places.** In the rail the level
ring beats and throws a halo; in the transcript the live turn is a name and a pulse. It replaced a
«tiene la palabra» badge beside the name — a word appearing in one row of five is read *after* the
movement anyway, and it reflowed the row when it arrived and again when it left.

Both fall back to a solid mark under `prefers-reduced-motion`, which is the only reason the
speaking state is also in the button's `aria-label`: motion cannot be the sole carrier.

**A turn in progress is a name and a pulse.** The stream used to paint into the column, and
watching tokens arrive is not reading a conversation — half a sentence about to be rewritten is
worse than no sentence. Two things follow: the pulse is now the only signal that anything is
happening, so do not remove it; and because the stream no longer changes the column's height, the
scroll effect depends on `live.length` rather than the total text length, which stops it firing on
every delta.

**Late responses are discarded** (`stale` in the SSE effect, `current` in `loadConv`). Otherwise
they overwrite the conversation you are looking at.

**Busy state comes from the server**, over the `busy` event. Inferring it client-side by asking for
the conversation state when a turn ends is a race: that request can go out before the lock is
released, answer `true` late, and leave the interface stuck with nothing to unstick it.

**Hues are reassigned per conversation** (`primeHues`). A global map accumulating across
conversations wraps around the palette and two people seated together end up the same colour —
which is exactly what the colour is there to prevent.

---

## The prompt is the product

Most of the discussion's behaviour is not in the code but in `server/src/prompts/`. If something
"doesn't work", it is almost always the prompt, not the orchestration.

Order of precedence inside `## Your turn`, and it is intentional:

1. **What the moderator said** since that participant's last turn — quoted, outside the transcript,
   with explicit authority.
2. The phase (`open` / `cross` / `close`).
3. The standing question and its deliverables — **suppressed while a live redirection stands**.

That order took work to find. When the moderator's message travelled inside the transcript with the
same formatting as any other turn, the agents read it and carried on with their own thread, because
the imperative section repeated the original question as their north star. The prompt was beating
the moderator.

**`base.ts` exists to break a cycle, not for tidiness.** `config.ts` needs `writeJson` and
`slugify`, and `store.ts` needs `DATA_DIR`. If those live in either one, the circular import makes
`DATA_DIR` be read before it exists and the server **won't boot**
(`ReferenceError: Cannot access 'DATA_DIR' before initialization`). It happened. Don't move those
four things out of `base.ts`.

**Deletion never touches `<project>/AISPECS/`.** What was published belongs to the user: the app
does not revert what it handed over. `deleteConversation` and `deleteProjectConversations` only
touch `data/projects/`. The delete dialog says so, and it has to keep saying so.

**`DELETE /api/projects/:id` requires `?confirm=<id>` and the server verifies it.** Confirming in
the browser is not enough: the delete cascades and there is no trash.

**`frame.ts` does not reuse `runTurn`, on purpose.** `runTurn` is coupled to
`Conversation`/`ConversationParticipant`; drafting a frame is a read-only task with no conversation.
It uses `query()` directly with `model: 'sonnet'` — summarizing a repo does not need Opus, and it
costs ~$0.15. It carries its own EN/ES prompt pair, because the frame is read by the agents.

**The frame has a word budget, and the reason is in `buildTurnPrompt`.** The full frame goes in
each participant's first turn, but `frame.trim().split('\n\n')[0]` — the first paragraph — is
re-injected on every turn after that, for everyone, forever. So paragraph one's length is a
recurring cost. `frame-writer.md` caps it at **one paragraph of 300–400 characters** and says why;
without the reason stated the model read "no longer than five lines" as a suggestion and produced
331 words.

**Most of what a frame could say does not belong in it**, and the file lists what to leave out:
architecture and the repo path (readable, and the technical profiles get the `CLAUDE.md` in full),
features and status (they age), and — the one worth knowing — **what gets decided at a
conversation**. That last was a whole paragraph duplicating the protocol's "What this roundtable
is about" section, which every participant already receives verbatim. It was being paid for once per
project to say the same thing twice.

Since the frame is one paragraph, `buildTurnPrompt` no longer distinguishes a first-turn frame
from a later-turn reminder — the reminder used to be `frame.split('\n\n')[0]`, which is now the
whole thing. If you ever make the frame multi-paragraph again, that distinction has to come back.

**`frame-writer` reports three fields, and `parseReport()` in `frame.ts` splits them.** `NAME`,
because the product's name is usually not the directory's — pointing at `acme-portal-v2`
should propose «Northwind». `LANGUAGE`, because the locale is a property of the repo rather than of
the browser. And the summary. Each only fills what is empty or unset: re-proposing must not rename
a project or switch its language.

**Language detection reads the personas first, then the docs, and the order matters.** The
reference project's `CLAUDE.md` and `README` are in English while its eight personas are in
Spanish — so an instruction that said "whichever the docs are written in" reported `en`, which is
the wrong prompt language for those personas. `.claude/agents/*.md` wins when they disagree,
because theirs is the language that has to match the protocol.

Passing a `locale` to `proposeFrame` overrides detection and is what an existing project does: its
language was already chosen by a person, so re-proposing respects it.

**Agents drift to the domain if you have no `frame`.** Their personas are domain personas (network,
ISP, consulting) and with no product frame they discuss the domain: what is happening to a
customer's network, not what the software has to do. The repo's `CLAUDE.md` is no substitute — it is
implementation, only the technical profiles receive it (`WANTS_PROJECT_CONTEXT`), and it drowns a PM
or a simulated customer. The `frame` is short and goes to **everyone**, plus the "What this
discussion is about" section of the protocol. If you add a project and the discussion seems to be
about anything at all, check this first.

**Seating someone in a conversation that already started works, and it used to be refused.** The
reason it works is that a fresh seat (`seat()` in `store.ts`) has `lastSeenIndex: 0` and no
session — exactly the state everyone begins in — so their first turn receives the whole transcript
so far as its delta, through the same machinery that hands everyone else what they missed.

**Nobody is ever un-seated.** Their turns are in the transcript and removing the seat would leave
it referring to a stranger; `enabled: false` is how you take someone out of the rotation. So
`seatMore` only ever adds, and `POST C/participants` is add-only by construction.

**One control per seat, and it is a scale: `off → low → medium → high`.** A checkbox and two
selects were three questions asked to settle one — *how much work does this person put into a
turn* — so there is one button that cycles up it.

**Chairing is not on that scale, and it was.** `chair` sat at the top as a fifth rung, and it read
badly: a different *kind* of thing at the end of a quantity, so getting from thorough back to off
meant passing through "runs the discussion". It is a **star beside the name** now — one thing that
is either true or not, true of exactly one seat, faint on the others until the row is hovered,
which is how you find out you can move it.

`levelOf()` **derives** the level from what is already stored (`enabled`, `depth`) rather than
storing another field, so there is nothing extra to keep in sync. The star writes
`conv.orchestrator`, which enforces uniqueness by being a single field — setting it on someone
takes it off whoever had it.

**A chair is always enabled, and it is enforced in three places because it was reachable from
two.** A conversation whose chair has been taken out says it has someone running it while
`seated()` leaves them out of every round — so `runSession` takes its open branch and it runs
leaderless, with the interface still showing a chair, and nothing announces it.

- **`normalize()`** repairs it on load: a chair that exists is forced `enabled`, and an
  `orchestrator` naming nobody seated is cleared. Conversations already on disk can hold the bad
  state, so guarding the edges alone would not have been enough.
- **`PATCH C/participants/:pid`** refuses `enabled: false` on the chair. Move the star first.
- **`PATCH C`** refuses an `orchestrator` who is seated but taken out. Someone *not seated at all*
  still silently means "open", which is the documented behaviour — but seated-and-disabled is a
  mistake worth a message, since quietly opening the conversation is not what was asked for.

The UI closes both doors too: the star is disabled on a seat that is out, and the chair's own cycle
skips `off` (`NEXT_CHAIR` wraps `high → low`). A **deliberately** open conversation — no star on
anyone — stays valid and is a measured mode; what is not valid is a chair who cannot speak.

**The state is captioned in the row, not in a `title`.** A native tooltip does not re-show while
the pointer stays put, so after a click it reads as the level you just left — stale by design.
`.seat-state` is real DOM revealed on hover, so it changes with the click. The `title` stays for
whoever is not using a pointer.

**Reveal on `:hover` and `:has(:focus-visible)`, never `:focus-within`.** A button keeps focus
after a click, so `:focus-within` leaves the thing lit on a row the pointer has already left — and
on a panel you clicked in order to *close*. A mouse click does not match `:focus-visible` while
tabbing to it does, which is exactly the split wanted. Both `.seat-state` and the transcript's
`.turn-detail` had this; if you add a third, use the same pair.

**The model rides along instead of being asked for separately.** `sonnet` on `low` is the whole
point of a low seat — fast and cheap for a position you do not need reasoned at length — and
everything above it is left to whatever the persona's own file declares. That is why the model
select went: nobody was choosing a model, they were choosing how much they cared.

**Read as a filling ring, not as words.** The mark grows with the level in the speaker's own hue,
so a glance down the column reads as a profile of the conversation; the chair gets a ring *and* a
fill, because it is different rather than merely more. The words live in the tooltip, where they
can be a sentence instead of a cramped label — and the tooltip also names what a click will do,
which is what makes a five-state cycle usable.

**Underneath it, two mechanisms, and only one is an API parameter. Do not describe the other as
a cap.**

- **`depth`** (`quick` | `medium` | `full`, default `full`) sets the SDK's **`effort`** — `low`,
  `medium`, or left alone, since the SDK's own default is already `high`. This is the load-bearing
  half: it decides how much reasoning happens before the answer, which is the difference between a
  salesperson saying whether a thing is sellable and a specialist going to the standards.
- **The same control also asks for a length** — ~500 or ~2000 characters — as a line in the system
  prompt, next to `answerLanguage`. **The Agent SDK has no `max_tokens`.** It is not among the 65
  options; that is a Messages API parameter the SDK does not surface. So the budget is *asked for*,
  not enforced. It works, and it is worded as a budget with a reason rather than as a rule, because
  that is what it is. If you ever go looking for the hard cap again: it is not there.
- **`model`** overrides whatever the persona's own file declares (pool personas say `model: opus`).
  Unset means the persona decides; the select offers **aliases**, not dated ids, because the CLI
  resolves them to whatever is current and this is a setting somebody leaves alone for months.

Both are per **seat**, not per persona, and that is the point: the same salesperson is wanted brief
in a commercial conversation and thorough in a technical one. `null` clears either back to the
persona's declaration, which is not the same as leaving the field out — the route distinguishes
them.

**`loadProjectSettings` lives on the seat.** It was the roundtable's only per-participant setting,
and `normalize()` defaults it from `WANTS_PROJECT_CONTEXT` for conversations written before the
move — the same rule that seats a new one.

**With a chair (`conv.orchestrator`), only they hand out the floor.** Anyone else's ask is
discarded in `record()`, not merely discouraged in the prompt: the instruction alone is not enough.
The loop is `runConducted` — chair, person asked, chair — and it ends when the chair closes or stops
asking. `converged()` receives the chair and, if there is one, looks only at their close.

**The chair belongs to the conversation.** It used to live on the roundtable, which meant the
"chair" select in the conversation's right column was patching a global setting from a
local-looking control — it silently re-chaired every conversation of that group, including open
ones. The same people legitimately want a chaired conversation one week and an open one the next,
so the setting follows the topic. That was the first thing to move off the roundtable; who sits
followed later, and then there was nothing left. `orchestrationBrief` takes the chair's **id**, not
the conversation, so nothing downstream depends on where it is stored.

**`purpose` was removed from the roundtable, deliberately** — before the roundtable itself went.
It reached the agents through exactly one path: the history file, which they get as a *path* and
only from the second conversation on, so on a group's first conversation it reached nobody, and it
was never rendered in the main UI. Rather than wire it into the turn prompt (which is measured), it
was deleted. If you find yourself wanting it back, put it in the conversation's `brief`, which does
reach every participant's first turn.

**Careful with rules that push toward asserting.** The instruction added to reduce the use of the
ask marker — "if in doubt between asking and asserting, assert" — made agents answer questions they
could not possibly know, inventing plausible data from within their persona (a salesperson reporting
a pipeline that does not exist). It is scoped to **judgement**, not data, and balanced by the "When
you don't know, say so" section. If you touch that part again, measure both things: how much they
ask and how much they invent.

Agents with their own epistemic markers (`[verifiable]`, `[assumption]`) hold up fine without the
protocol; those without depend on it entirely. `grep -c` over `.claude/agents/*.md` shows which are
which.

**The ask marker has to be exceptional, and it needs watching.** An ask takes the turn away from
whoever was next, and until it is answered `converged()` cannot return true. With the first wording
of the protocol — an "mandatory" block and an example showing all five lines — 82% of turns asked
something, nearly one per turn, and sessions never converged: they ran out of rounds. The example in
the protocol anchors harder than the caveat below it. If you touch that section again, measure
afterwards:

```bash
# turns containing an ask, over total turns carrying a marker block
python3 - <<'EOF'
import json, glob
tot=con=0
for f in glob.glob('data/projects/*/conv/*.json'):
    for e in json.load(open(f))['transcript']:
        if e['role']=='agent' and e.get('markers'):
            tot+=1; con += 1 if e['markers'].get('asks') else 0
print(f"{con}/{tot} = {100*con/tot:.0f}%")
EOF
```

**Before touching `prompts/`, look at what you are changing:**

```bash
npm run protocol           # English
npm run protocol -- es     # Spanish
```

Prints the protocol and the phases exactly as an agent receives them. What is in there governs
almost all of the discussion's behaviour.

```bash
npm run order -- <conversationId>
```

Shows the pending questions and the order the round would follow. Answers "why did that one speak
and not the one who was just asked?" without spending a turn.

```bash
npm run prompt -- <conversationId> <participant> [index]
```

Prints the exact prompt that participant would receive. The third argument forces a
`lastSeenIndex`, to reproduce what they saw on a past turn. It is the difference between verifying
and assuming.

`npm run doctor` does the same for discovery: which participants came from which file, and what
tools each ended up with.

---

## Verifying changes

**There are no tests, and running the app costs money and quota.** An Opus turn is $0.10–$0.60
equivalent against the user's subscription, and a full session can pass $6.

Before spending a turn:

- `npm run typecheck` — runs `tsc` over `server/` and `web/`.
- `npm run doctor` — discovery and permissions, free.
- `npm run prompt -- …` — the prompt, free.
- `npm run protocol` — the protocol as an agent receives it, free.

When you do have to run for real, use **`model: 'haiku'`** in a test script: for verifying plumbing
(auth, streaming, marker parsing, stopping) it makes no difference and costs a fraction.

Long turns exceed a shell command's timeout. Fire them in the background and poll
`GET /api/projects/:id/conversations/:cid` in a loop; the work lives on the server side and
survives the client dying.

---

## API

`C` = `/api/projects/:id/conversations/:cid`

```
GET    /api/projects                    list, with hasAgents and agentCount
POST   /api/projects                    { name, path, frame?, locale? } — validates the path
PATCH  /api/projects/:id                { name?, path?, frame?, locale? }
DELETE /api/projects/:id?confirm=<id>   cascade: project + its conversations
GET    /api/projects/:id/stats          what would be lost
POST   /api/projects/validate-path      { path } → { ok, hasAgents, agentCount, error? }
GET    /api/browse?path=…               folder picker; defaults to the parent of ROOT
POST   /api/projects/propose-frame      { path, locale? } → { frame, costUsd }
GET    /api/artifact-types              which deliverables exist + default authors
GET    /api/projects/:id/participants   the pool + the repo's own agents + claude-code
GET    /api/projects/:id/agent-summaries   cached one-liners, or null; free
POST   /api/projects/:id/agent-summaries   (re)generate them — one turn
GET    /api/archetypes                  the role archetypes that ship with this repo, + their knobs

GET    /api/personas                    everyone the app has written; `project` scopes one
POST   /api/personas                    { archetype, tuning?, replacing?, projectId? } — writes one
GET    /api/personas/:pid               read one back
DELETE /api/personas/:pid               remove one from the pool

GET    /api/projects/:id/conversations  the project's index
POST   /api/projects/:id/conversations  open a topic — takes the seats and the chair too
GET    C                                conversation + project + board + busy
DELETE C                                deletes the conversation and its drafts
PATCH  C                                title, brief, question, deliverables, closed,
                                        orchestrator
POST   C/duplicate                      the same setup again, empty transcript
POST   C/reset                          empties this one, keeps its setup
POST   C/participants                   { participantIds } — seats more; add-only
PATCH  C/participants/:pid              enabled, loadProjectSettings

POST   C/moderator                      note / redirect (works while busy)
POST   C/turn                            one turn
POST   C/round                           one round (parallel | sequential)
POST   C/session                         phases + deliverables — starts and returns.
                                        Needs neither a question nor a deliverable.
POST   C/stop                            stops whatever is in flight
GET    C/stream                          SSE

POST   C/artifacts                      generate (stays a draft)
GET    C/artifacts/:aid                 read the draft
POST   C/artifacts/:aid/publish         copy into the project repo
DELETE C/artifacts/:aid                 discard the draft
```

The event bus is keyed by **conversation id** — which is why removing the roundtable level cost
it nothing.

SSE events: `turn_start`, `delta`, `tool_use`, `turn_end`, `turn_error`, `entry`, `artifact`,
`conversation_updated`, `busy`, `auto_progress`, `auto_stopping`, `auto_done`, `session_progress`,
`session_converged`, `session_open`, `session_writing`, `session_artifact_failed`.

`/api/artifact-types` returns only `{ type, defaultAuthors }`. The display names live in the web's
locale files, so the UI can be in a different language than the agents — don't move them back to
the server.

---

## Things that are not here yet

- Turn handing recalculates before **every** turn (`nextSpeaker`), not once per round. The latter
  was the original implementation and meant a question asked on turn 2 of a round of seven went
  unanswered for six turns.
- No archiving: only deletion. That was a decision, not an oversight.
- **Two ways to start over, and they differ in one thing: whether the run you are leaving
  survives.** «Copy» (`duplicateConversation`) opens the same setup beside it; «Restart»
  (`resetConversation`) empties this one. Both live **above** the sections, because they act on
  the conversation as a whole — inside «Context» was only where there happened to be room.

  Only «Restart» asks, and that is the whole of the `confirm()` rule: it cannot be undone, and
  there is no archive here. «Copy» asks nothing because it takes nothing away.

  Both keep **setup** and discard **history**. Setup is the seats with their levels, the chair, the
  question, the brief, the deliverables. History is the transcript, the SDK sessions, each seat's
  `lastSeenIndex` and cost, and the staged documents. The participants are rebuilt through `seat()`
  in both, precisely so neither can inherit a `sessionId` and answer as though it remembered a
  conversation that no longer exists.

  **Published documents are never touched** by either. They are in the user's repo.

  A copy's title gains ` · 2`, a **number rather than a word** so it does not pick a language, and
  the base strips any existing suffix so copying a copy gives ` · 3` instead of ` · 2 · 2`.

- **«Close» is gone, and `closedAt` is now only ever cleared.** It marked a conversation done, and
  nothing depended on it: the nav shows it, the history file reports it, and `runSession` never set
  it. Conversations from before still carry it and still render as closed; `resetConversation`
  clears it. If you want the state back, it needs a reason to exist first.
- **Un-seating somebody is `enabled: false`, never removal.** A conversation keeps every seat it
  ever had, because the transcript refers to them. If you ever want real removal, the transcript
  has to be able to name a participant who is no longer in the list.
- The product name is **The AI Office**; the entities are **project** and **conversation**.
- «Let them run» does not stop on convergence: it does the rounds asked for even if everyone has
  already closed. The one that stops is «Resolve».
- A facilitator agent that decides when the discussion has wandered. Evaluated and dropped as a fix
  for convergence — that was solved in the protocol, which affects everyone and doesn't cost a turn
  per round. It still makes sense as an addition, and the board is already structured to give it
  something to read.
- The English prompt pack has not been measured. See "Two languages" above.
