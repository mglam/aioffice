# The AI Office

A local web app that sits several Claude Code agents around one question and lets them argue it
out until they answer it.

**You type the question and press Play. Then it runs itself.** One of the agents chairs: it asks,
someone answers, and the turn comes back to the chair — or, with no chair, they hand the floor to
each other, and whoever was just asked something speaks next. They are not answering *you*, they
are answering each other, and you can watch them do it.

Each one is a different **profile** — a product manager, an architect, a domain specialist, the
customer who would have to buy it, the engineer who would have to run it — and each is an
independent Agent SDK session with its own instructions and its own memory. **All of them can read
your repository**, with the same tools you would use: `Read`, `Grep`, `Glob`, a web search. So they
argue from what is actually in the code, not from a summary of it — and each from where they sit,
which is the point. The architect and the customer's engineer look at the same file and disagree
about it.

It stops on **state, not on a counter**: when nothing is left unanswered, no blocker is standing
and everyone has taken a position. Then it writes the documents it was convened to produce and
stages them for you to read. Nothing reaches your repository until you publish it.

You can step in at any point — redirect them, take someone out, put someone else in, or stop it —
but you do not have to. The normal case is one Play.

**Two levels:**

- **Project** — a repo plus a frame: what the product being built is.
- **Conversation** — one topic, and everything about it: the question to answer, the deliverables,
  **who sits**, whether it is open or chaired, and the transcript.

A project has many conversations. One conversation *is* a roundtable — that is the metaphor the
word carries in the rest of this README — but there is no separate standing-group entity to set
up. To discuss another topic with the same people you open another conversation, and it arrives
with the previous one's seats already picked.

Who you can seat is the app's own pool of people plus whatever the repo has in its own
`.claude/agents/`. Nothing to register: add an agent to the repo and it shows up in the picker.

---

## Getting it running

You need **Node 20.10 or newer** and **Claude Code installed and logged in** — the app carries no
credentials of its own, it uses yours (see «Authentication»).

```bash
git clone https://github.com/<user>/ai-office
cd ai-office
npm install

npm run dev          # API on :5174, front on :5173 → http://localhost:5173
npm start            # or everything together from :5174
```

Nothing to configure before starting: projects are added from the web UI and the app writes
`config.json` itself. No database either — everything is JSON under `data/`.

### Authentication

No API key and no Claude Console account. The Agent SDK launches the Claude Code binary as a
subprocess, and that binary uses your Claude Code session credentials (macOS Keychain). **Usage
goes against your subscription.** If you log out of Claude Code, the roundtable stops working
until you log back in.

The amounts the UI shows are the API-equivalent estimate the SDK reports. They are useful for
comparing which participant is expensive; they are not an invoice.

### Languages

Two languages, set independently, because they answer different questions.

- **The interface** — a switcher in the top bar, English or Spanish. Per browser, remembered in
  `localStorage`, and it starts from your browser's language. The strings live in
  `web/src/i18n/`.
- **The agents** — per project, in its `locale`. This is the language the protocol, the phase
  briefs and the deliverable instructions are written in. It lives in `server/src/prompts/`, one
  pack per language.

A new project's agent language is **read off the repo**, not assumed: the setup flow looks at the
profiles in `.claude/agents/` if there are any, and at the README and CLAUDE.md otherwise. When
those disagree the profiles win, since theirs is the language that has to match. It is per project
and editable.

**A project's `locale` is the language its agents answer in**, and every turn says so outright
rather than leaving it to be inferred from the language the protocol happens to be written in.

That is why **the app's own people are written in English** and there is no language to choose when
you add one: a single language in the pool is what lets the same specialist sit at a Spanish
project and an English one. A profile you wrote by hand in your repo can be in whatever language
you like — the same instruction makes it answer in the project's.

You can run a Spanish roundtable from an English interface and the other way around. To add a
language, copy `server/src/prompts/en.ts`, translate it, and add it to `PACKS` in
`server/src/prompts/index.ts` — the `PromptStrings` type makes a missing piece a compile error
instead of a half-translated prompt.

### The app's own agents

The app does some of its own work with agents, and they ship with this repo, in
`.claude/agents/`. They are written exactly like the participants you seat at a roundtable —
the same frontmatter, the same tolerant parser — so adding one is adding a file.

There are three: `frame-writer.md`, which reads a repo and drafts its product frame;
`agent-writer.md`, which writes a person you can seat; and `namer.md`, which invents a name for a
profile whose own file gives none. If you don't like how one of them works, edit that file. No
TypeScript involved, and nothing to rebuild.

Alongside them, `.claude/archetypes/` holds the eight roles — product manager, sales, the
customer's decision maker, the customer's engineer, software architect, domain specialist,
developer and facilitator. Each is a brief describing the role generically, plus the **knobs** that
role varies on; the writer turns brief and knobs into someone specific. They are briefs, not
agents, which is why they sit in their own folder.

Because they live in `.claude/agents/`, they are also available to you from your own Claude Code
terminal in this repo, which is often the fastest way to try a change to one.

They are **not** offered as participants. Pointing The AI Office at its own repo as a project is a
reasonable thing to do, and if you do, discovery skips these and leaves you `claude-code`.

### Projects

A project is a path to a repo plus a **frame**: what the product is, in a few words.

They are managed **from the web UI**: the gear beside the project selector, at the top left,
opens the list.
«Set up» — the same flow for a new project and for changing an existing one — has two steps. It is
the folder and the identity, which is all a project *is*. The people who sit at its conversations
are configured from the **people** icon in the masthead, described below.

1. **Folder.** A picker that starts one level above wherever the app itself is cloned, which is
   usually where your other repos are. Everything readable is listed, but only a **codebase root**
   can be selected — something with a `CLAUDE.md`, a README, a git repo, a package manifest or
   agents of its own. Anything else is greyed and still open, so you can walk through a container
   folder to the repo inside it; the search runs again at every step, which is why it only needs
   to look three levels down. A `›` means there is a project further in, and a badge marks a
   `CLAUDE.md` or existing agents. Pasting an absolute path still works, and either way it is
   validated as you type.

   A folder you have never opened Claude Code in works too. Running it by hand there would ask
   whether you trust the files; the app never hits that prompt, because it runs read-only with
   permissions that cannot escalate.

   A project with no `CLAUDE.md` is fine — the frame gets drafted from the README instead, and the
   flow says which it used. A project with no agents of its own is fine too: the people you seat
   don't have to come from it.
2. **Identity.** Name, the language the agents are addressed in, and the frame. A project with no
   frame gets one drafted here; one that already has a frame shows it as it is, and the **AI**
   button in the dialog header re-reads the repo when you ask it to. Nothing is saved until you
   confirm the step, and «Discard changes» puts back what was there.
For a new project the second step unlocks once the folder is valid. For an existing one both are
open, so you click straight to the one you came for.

**Opening the flow never costs anything.** Every model call is behind a button.

A repo with no agents of its own is not a dead end: the people are global, and `claude-code` is
built in either way — so the worst case is a roundtable of one, which still beats a solo chat.

They are stored in `config.json`, which **the app writes**. It is in `.gitignore` because it holds
absolute paths from one machine; there is a `config.example.json` to copy.

**The app reads the repo and reports three things**: the product's **name**, the **language** to
address the agents in, and the **frame** itself. All three only fill what is empty or unset, so
re-proposing never renames a project or switches the language of one you already configured.
Costs $0.05–$0.15 depending on how much there is to read, and takes fifteen to thirty seconds.

The name is often not the folder's — a repo in `~/code/acme-portal-v2` may be a product called
Northwind, and the folder name is only the fallback.

The frame is held to a hard budget: **one paragraph, under 400 characters**. Not for tidiness — it
is injected on *every* turn of *every* participant, so its length is a cost paid over and over for
the life of the project.

It is also deliberately **not** a summary of the repo. Architecture, the repo path, features and
status are all left out: they are readable, they age badly, and the technical profiles get the
`CLAUDE.md` in full anyway. What gets decided at a roundtable is left out too — the protocol
already tells every participant that, in the same words, so putting it in the frame was paying for
it twice per project.
It beats leaving it empty by a mile. It is drafted in the project's language, not the interface's:
the agents are the ones who read it.

**The frame matters more than it looks, and it goes to everyone.** The agents have domain roles: a
grid engineer, a hospital operations lead, a payments consultant. Given only their role and your
question, they
discuss the domain — what is happening to some customer's network — instead of the product. The
repo's `CLAUDE.md` does not solve this: it is implementation detail, only the technical profiles
receive it, and it drowns everyone else.

The frame is one paragraph and answers one question: **what is this product, who buys or uses it,
and what about its shape changes how decisions get argued?** That last clause is the part that
takes judgement — multi-tenant, sold through a channel, an internal tool with one operator,
on-premise at a customer's site. Each of those changes every later argument about what to build.

On top of that there is a protocol rule that always applies: customers and their systems are
**evidence**, not the topic, and every turn has to arrive at *"this changes what the product has to
do"*.

---

## The people

The **people** icon in the masthead opens the one screen where they are configured. It shows three
groups, because three kinds of person can work on something and the difference is who may change
them:

**1 · Global.** The people whose usefulness is their **craft**, not your product: a salesperson —
selling is selling, and one sells anything — a domain specialist, a facilitator. What they know
travels, so an IP specialist is worth seating at every project that touches a network. Written from
the role alone.

**2 · Written for one project.** The people who mean nothing in the abstract: its **product
manager** (a product manager in general is nobody), the **customers** who would buy it and the
engineer who would have to run it (a potential buyer is always a buyer of *something*), its
architect and its developers. Offered only there.

**3 · Inherited from the repository.** The `.md` files in the project's own `.claude/agents/`.
Yours — your Claude Code sees them in that folder too — so the app reads them off disk, seats them
like anyone else, and never writes, edits or deletes them. An id here wins over one of the app's
own.

Many of these are titled by role — *"El técnico del cliente"* — and a table cannot address a role:
someone who is only "the product manager" gets talked *about* instead of *to*. **«Ponerles
nombre»** invents one for whoever has none, in a single call, and keeps it in the app's own data —
**never in your repo**. The name goes into the roster the others read *and* into that agent's own
prompt, so they answer to it. Anyone whose file already names them is left alone, and asking twice
is free.

The first two the app writes; both live in its own `data/personas/`, which is outside your
repository and outside this one — if you want a history of them, make that directory a git
repository of its own and push it wherever you like. **Nothing is written into your repository** — the only thing the app ever puts there is a deliverable you publish.

**«Add a person»** opens one form: who they work for, the role, and the knobs that role varies on.
About $0.20 and a minute.

Picking the role sets the scope for you — a product manager arrives scoped to the project, a
salesperson global — because where a role belongs is a property of the role and not something you
should have to know. It stays a select, so it is a default and not a rule.

The knobs are the point. A salesperson can work for the maker or for a named partner, and sell by
closing, consultatively, customer-first or as technical pre-sales. A domain specialist has a field,
specific technologies, and authority that comes from practice, from the standards or from design.
Leave one empty and the writer picks something coherent.

**Editing is the same form**, arriving with the role fixed and the knobs that person was written
with already filled in. Generating replaces their text; the transcripts they already appear in are
untouched.

**Why the scope matters, and it is not only a filter.** Writing someone *for* a project is the one
thing that reads that project's repo, and that buys two different things.

For **any** role, it settles the knob with no sensible default: which field a specialist actually
knows. Left blank with no project, the writer invents one — coherent and arbitrary, and a
specialist in the wrong field is worse than none.

For a role that works **on** the product, it also gives them the product's shape and, more
importantly, the vocabulary its team uses for its own concepts. Someone on the inside who calls the
central entity by the wrong name is not credible.

For a role that judges it **from outside**, that is where it stops: the field, the technologies,
the kind of organisation that buys this — and nothing about the product itself, however much was
read. A customer who recites a feature list is not a customer, and a profile assembled out of a
product's own model could only ever ratify that model, which is exactly the independence you seated
it for.

Those two are separate from the scope: a salesperson is usually global but works *inside*, and a
customer is usually project-scoped but judges from *outside*.

And no profile ever holds a feature list, an internal identifier or a metric value. Those age
within a month, and a profile is re-sent on every single turn — so what gets written is how someone
forms a judgement and where they look, not a catalogue of what they already believe.

**A role can be filled as many times as you like.** Three specialists tuned differently is a
better table than one, so adding never replaces.

## Opening a conversation

A conversation owns everything about its topic: the question, the deliverables, whether it is open
or chaired, and **who sits**.

There used to be a **roundtable** in between — a standing group that owned who sits, and nothing
else. It was removed once the people themselves became global or project-scoped: the group had
nothing left to own. The project keeps the history, and *which* of those people speak about a topic
was always the topic's business. What survives of the convenience is the default: a new
conversation arrives with the seats from the last one, which is nearly always who you want again.

**Who you can seat.** Everyone in the app's own pool of people, plus any agents the repo has in its
own `.claude/agents/`, plus **`claude-code`**: Claude Code with no profile of its own, with the project's
`CLAUDE.md` loaded. That one is the programmer-analyst.

**Each seat is one button**, in the *Participants* section, and it cycles up a scale:

| | |
|---|---|
| **no participa** | seated, but not speaking |
| **rápida** | a position and its reason — on sonnet, fast and cheap |
| **media** | reasons it through |
| **a fondo** | goes and reads |

That one control is how much work this person puts into a turn, which is what a checkbox and two
selects were all circling. In a commercial conversation you want the salesperson on *rápida* — say
whether it is sellable, don't write an analysis — and the specialist *a fondo*, going to the
standards. Same people, different setting.

Hover a row and it says in words what the ring means: *no participa*, *participa con respuestas
cortas y concretas*, *da una respuesta completa*, *hace un análisis detallado de la respuesta*.

**The star beside a name is who runs the conversation.** Click another to move it, or click the lit
one to leave the conversation open. Exactly one seat can hold it, or none.

**Whoever runs it has to be taking part.** You cannot star someone who is out, and you cannot take
out whoever is starred — move the star first. Otherwise the conversation would claim to have
someone running it while every round left them out, and nothing would say so.

The seats are listed alphabetically, and one that isn't taking part keeps its place — the empty
ring already says so.

The mark fills as the level rises, in that speaker's colour, so the column reads as a profile of
the conversation at a glance. Hover for the words, and for what the next click will do.

Under it: the level sets how much the model reasons before answering, which is a real parameter,
and asks for a length — about 500 characters, about 2000, or as long as it takes. **The length is
asked for, not enforced**: the Agent SDK exposes no token cap, so treat it as a budget the model
respects rather than a hard limit. *Rápida* also pins the model to sonnet; above that, whatever
the profile's own file declares.

It belongs to the seat, not to the person, so the same specialist can be brief in one
conversation and thorough in the next.

**You can seat someone after it has started.** «+ seat», next to *Who sits* in the right column.
A new seat has seen nothing and holds no session, which is the state everyone begins in, so their
first turn receives the whole transcript so far. Taking someone out is the checkbox — nobody is
ever removed, because the transcript refers to them.

**The right column is three collapsible sections** — **Context**, **Participants**,
**Deliverables** —
and each is edited where it is shown. Click the context to change it, `+ sentar` to bring someone
else in, a checkbox to take someone out (they sink to the bottom and grey), a yes/no against each
deliverable. In both lists what is selected sorts to the top. A new conversation has only
*Acuerdos* ticked. There is no manager dialog and
no gear — projects keep theirs, because a project's settings are not on screen while you work; a
conversation's are.

The list on the left shows titles and nothing else. **The open one's title is a field**: click and
type to rename it, Enter or click away to save, Escape to undo. The `+` on the heading opens a new
conversation, and the bin beside it lets you pick one to delete — which asks first.

## Open or chaired — per conversation

- **Open conversation** — anyone asks anyone. More natural, but it struggles to close: if nobody
  carries the thread, everyone pushes their own.
- **Chaired by X** — X is the only one who asks. The others answer and hand the turn back. Turns
  alternate: chair → the person asked → chair. It ends when the chair considers the question
  answered.

The difference is large and it was measured. In an open conversation, **82% of turns included a
question** — nearly one per turn, even in the closing phase. With a chair, the ones answering
dropped to **0%**, and they contribute no less: they leave more agreements and more blockers per
turn.

It makes sense: when anyone can ask, nobody owns the thread and each participant pushes their own
way. And since an unanswered question keeps the roundtable from closing, a roundtable where
everyone asks never converges.

If a conversation has a chair, anyone else's ask is discarded — the protocol tells them so, and
the app makes it true even when they ignore it.

You pick this when you **open a conversation**, and you can change it at any time from the right
column while you are in it. It only affects that conversation.

## What was already discussed

Each project keeps a **history** at `data/projects/<id>/history.md`: every conversation held about
it, who took part, what was agreed, what was left blocked, and which documents came out. It
regenerates itself after every change, in the project's language.

That history is **not injected as context** — it would be expensive and is almost never needed.
Instead, from the second conversation on, they are told where it is and given read access to
**that one directory**, which holds only this file. Whoever wants to know what was decided last
month goes and looks with their own tools.

The grant is deliberately that narrow. The raw transcripts sit one level up, outside it: an agent
reading another conversation end to end is neither something you asked for nor something you want
to pay for.

It is one file per project. It used to be one per group, which meant two groups working on the
same product could not see each other's conclusions — a silo nobody asked for, and removing the
group layer is what fixed it.

Sessions, by contrast, start clean on every conversation: they carry over neither the tone nor the
thread of the previous topic.

---

## What a conversation is made of

Each topic is a conversation, defined by three things:

**The question.** Not a topic: a question that can be answered. *"The assurance layer"* does not
converge; *"what is cut 1 and what is left out?"* does. Every participant has it in front of them
on every turn, and the session ends when it is answered. You set it by typing it into the bar and
pressing Play — there is no field to fill in first — and the right column shows whichever one is
currently standing.

**What it is opened to produce.** Deliverables are not buttons off to the side: they are the goal
you convened for, and the participants know it from the first turn.

| Deliverable | What it is | Signed by default |
|---|---|---|
| Work plan | scope, phases, verification | `claude-code` |
| Requirements | problem, constraints, acceptance criteria | `pm` |
| Commercial proposal | what ships, what goes to roadmap, what is NOT promised, demo | `sales` |
| Review of what exists | what is solid, what is weak, what is missing, in what order | `claude-code` |
| Agreements | decided, open, disagreements | `pm` |

Who signs each is resolved from the archetype, not asked for: the default is an ordered preference
and the first candidate actually seated wins, so a project whose agents are named in another
language still gets something sensible. Add your own ids to `DEFAULT_AUTHORS` in
`server/src/artifacts.ts`.

**How it runs.** Open, or chaired by one of the people seated. This is the setting with the
largest measured effect on whether the conversation converges — see «Open or chaired» above — and
it is per conversation, so the same group can work either way depending on the topic.

The question, the deliverables and the chair can all be changed later, from the right column.

## Running it

The bar under the transcript is **a mode, a play, a stop, and somewhere to write**. That is all.

Who speaks is whoever is ticked in the right column — and **one ticked seat is one turn**, which is
why there is no separate single-turn control.

**The box is the question.** You don't configure one before you can run anything: you type what
you want answered and press Play. From then on it is the *standing* question — put in front of
every participant on every turn, which is what keeps them converging on one target instead of
drifting around a topic. Leave the box empty to carry on with the question already standing.

Three modes:

- **Reach the deliverables** — the default. Three phases (open, cross, close) with a brief for
  each, it skips whoever already closed and wasn't asked anything, **stops as soon as everyone has
  closed**, and then writes whatever is ticked under *Deliverables*. **Untick them all and it
  writes nothing**, which is how you let them talk without spending on documents. Needs nothing
  typed in first.
- **Answer a question** — the same engine, with what you typed as the standing question.
- **One round, all at once** — the only **parallel** mode: everyone answers the same snapshot, so
  they don't see each other inside the round and the first speaker can't anchor the rest. The
  fastest way to open a topic, and the only one that runs with a single participant.

**In every sequential mode the order is recalculated before each turn**: whoever has a question
pending on them speaks first, then the rest. It's never the seat order.

**Play** runs the mode. **⌘↵** does the same — and mid-round it sends what you typed as a
**redirect**, the one thing without a button of its own. **Stop** replaces Play while anything is
in flight.

### Who speaks now

In the sequential modes, **before each turn** the app recalculates whose turn it is:

1. Of those who have not spoken this round, whoever has an unanswered question.
2. If several, whoever has been waiting longest.
3. If none, the next one on the list.

Each speaks once per round, even if they are asked something again. If someone put on the spot
could jump again, two agents would play ping-pong and nobody else would ever speak.

That is why someone may ask a question and a different person speaks: if that other person already
had a question waiting, they go first. The new question is not lost — it joins the queue.

`npm run order -- <conversationId>` shows the order the roundtable would follow now, and why.

### Stopping

Anything that occupies the conversation can be stopped: a single turn, a round, «Let them run» or
«Resolve». While something is running, the primary button is **Stop**.

Stopping cuts the current turn and does not start the next. Whatever the agent managed to say
stays in the transcript, marked as *cut by the moderator* — a turn you already paid for is not
thrown away.

---

## You moderate, and that carries weight

What you write enters the transcript, but not as just another comment: it is repeated to whoever
speaks next **at the very top, quoted**, with the instruction that what you say outweighs the
standing question and whatever thread they were following. If you redirect, they drop what they
were doing.

That is deliberate and it took work to find: when the moderator's message travelled inside the
transcript, formatted like any other participant's turn, the agents read it and carried straight
on — because the imperative section of the prompt repeated the original question as their north
star. The prompt was beating the moderator.

**You can redirect mid-round** with **⌘↵** (Ctrl↵) in the box — the same keys that play it when
nothing is running. The message does not cut the turn in flight: it queues behind it and whoever
speaks next reads it. If you also want to cut off whoever is speaking, that is **Stop**.

---

## The marker block

Each agent closes its turn with a fenced block the app parses. This is what turns a chat into a
discussion that converges:

````
```roundtable
FOR @grid-relays: does the selectivity hold if the feeder is back-fed?
AGREE: cut 1 is the ingest path
BLOCKER: without Huawei coverage I can't sign off
LIFT: the optical thresholds — the real fixture convinced me
CLOSE
```
````

| Marker | What the app does |
|---|---|
| `FOR @x` | **gives x the turn** and, until they answer, the roundtable cannot close. It is the most expensive line: the protocol reserves it for when the agent genuinely cannot move on without that answer. |
| `AGREE` | enters the board. Everyone is shown it, with the instruction not to revisit. |
| `BLOCKER` | while blockers stand, the roundtable has not closed. |
| `LIFT` | withdraws one of your own blockers. You can only lift yours. |
| `CLOSE` | nothing more to add. If someone puts you on the spot afterwards, it reopens. |

In a project whose `locale` is `es`, the block is ```` ```mesa ```` and the keywords are `PARA`,
`ACUERDO`, `BLOQUEO`, `LEVANTO`, `CIERRO`. **The parser accepts either set regardless of locale**,
so transcripts written before the English protocol still read, and an agent that answers in the
other language still parses.

**The centre column is what was said.** Everything else — the marker block, which tools they ran,
what the turn cost, the phase — is behind their **name**: hover it, or click to pin the panel
open. A turn still being written shows a name and a pulse; what it is producing is in that same
panel, because watching tokens arrive is not reading a conversation.

The block is never shown as text. It is shown as **structure**, in that panel: turns run one to
five thousand characters and declare two to seven markers each, so putting them between the turns
meant reading everything twice and losing the thread in the middle.
There is no separate running-total panel — it was a summary of what the turns already show, and the
place it sat is the conversation's settings. The agents still receive the running board on every
turn, which is the use that matters: it is what keeps them from re-litigating what is already
agreed.

### When they don't know, they say so

The profiles are rich — a salesperson with their book, a customer with their plant — and
that makes them useful, but it also tempts them to answer anything from within the fiction. If you
ask the salesperson how many deals are pending, that fact exists nowhere.

The protocol asks them to distinguish three things: **what they verified** in the code or a
document (with the citation), **their judgement and experience** (what they were brought in for,
no source needed), and **what they are assuming** (marked as an assumption). And when they don't
know, to say so with three things: that they don't know, who or what would know, and whether it
changes the decision.

An agent that answers *"I have no real pipeline to report; the human who owns the commercial
relationship knows that"* is more useful than one that invents three accounts in negotiation. The
invented number sounds exactly as good as the true one and nobody is going to check it.

Most turns should not ask anything: answering, agreeing and closing is a complete turn. When `FOR`
is overused the roundtable never converges — someone is always waiting on an answer — and the
turn-handing fills up with noise.

`BLOCKER` is the strongest closing lever there is. A participant saying "I cannot sell / build /
operate this" keeps the roundtable from converging, and that is exactly what should happen.

---

## The converging session, in detail

Both **Responder una pregunta** and **Llegar a los entregables** are the same engine — the
difference is only whether there is a question to converge on. It works in three phases:

- **Open** — each says how they see the problem from their role. Disagreement is useful here.
- **Cross** — no new topics. Each has to take up something concrete another person said: answer
  it, refute it, or say it convinced them.
- **Close** — take a position on the question. What I sign off on, what blocks me, and a review of
  my own blockers to lift the ones that were resolved.

It ends when no question is left unanswered, **no blockers stand**, and whoever has to close has
closed: in an open conversation, everyone; in a chaired one, the chair. The number of rounds is a
cap, not a plan.

What you typed only rides the first round: from there on the discussion has to hold itself up with
what they said to each other, or it was never a discussion.

### Starting over

When a discussion goes somewhere useless — usually because the question was not the right question
— there are two buttons at the top of the right column, and they differ in one thing: whether the
run you are leaving survives.

- **Copiar** opens the same conversation again beside this one. Same people at the same levels,
  same chair, same deliverables, nothing said yet. Its title gets ` · 2`.
- **Reiniciar** empties this one and keeps its setup. It **asks first**, because it cannot be
  undone — there is no archive here.

Then change the question in the bar and press Play.

Neither carries anything from the previous run: no transcript, no sessions, no accrued cost, no
drafts. Only the setup. And neither touches a document you already **published** to your repo.

### If it doesn't close, it doesn't write

If the rounds run out without converging, **it writes nothing**. It tells you which blockers stand
and who has not closed, and you choose between carrying on or writing anyway. If you write anyway,
the documents open with a «What didn't close» section and are marked `not closed`.

A deliverable that feigns consensus where a blocker was standing is worse than no deliverable.

---

## Deleting

Only deleting: there is no archive and no trash.

- **A conversation** — the × on its row, which appears when you hover it. Takes its transcript
  and its drafts, and asks first.
- **A project** — from «Manage projects». It takes all its conversations with it, and asks for
  **two confirmations**: the first lists what is lost, the second makes you type the project name.
  The server verifies the token too, so a careless `curl` doesn't delete anything either.

**What is never touched are the documents you already published** to `<project>/AISPECS/`. Those
are yours: the app does not revert what it already handed over. If you want them gone, you delete
them.

Before a big cleanup, `data/` can be copied by hand.

## Deliverables go to a draft, not to your repo

Generating a document **writes nothing into the project**. It lands in
`data/projects/<projectId>/artifacts/<convId>/` and shows in the right column marked
`draft`.

**Click the deliverable** — its name in the right column — and it opens in the viewer, rendered:
headings, lists, quotes and code, not raw markdown. From there:

- **Publish to the project** — copies it to `<project>/AISPECS/<conversation-slug>/`. Only then
  does it touch your repo, and it never overwrites a file (`work-plan.md`, `work-plan-v2.md`, …).
- **Download** — saves the `.md` as it stands. For a draft this is the only way to get it out
  without publishing, which is the point of publishing being a separate act.
- **Copy** — to the clipboard.
- **Discard** — deletes the draft. If you had already published it, the project's copy stays: that
  one is yours to delete. The app does not revert what it handed over.

A type that has produced more than one document lists them all underneath; clicking the name opens
the most recent. You can regenerate as many times as you like: each one is a new draft.

---

## What the agents can do

Read, and nothing else. Each participant receives the intersection of the tools its frontmatter
declares and a read-only list (`Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, and `Bash`
restricted to inspection commands). `Edit` and `Write` **do not exist in their context**.

Documents are written by the backend: the agent returns markdown and the server saves it.

**They can read exactly one directory outside your repo**, and it holds one file: the project's
`shared/history.md`. Not the whole of the app's data — the raw transcripts sit one level up,
outside the grant, so an agent cannot read another conversation end to end.

Each turn runs with `settingSources: []` on purpose — it does not inherit the repo's hooks or
its permission allowlist. The `CLAUDE.md` is read and injected explicitly, only for the
participants that need it (by default the technical ones; for a PM or a simulated customer it is
6k tokens of implementation detail that pulls them off their role).

---

## Diagnostics

Everything here is free — no turn is spent.

```bash
npm run doctor
```

Lists the participants discovered in each project, what tools each ended up with, and which file
they came from. The first thing to run when an agent doesn't show up, or shows up with odd
permissions.

```bash
npm run protocol           # English, the default
npm run protocol -- es     # the Spanish pack
```

Prints the protocol and the phase briefs exactly as an agent receives them. What is in here
governs almost all of the roundtable's behaviour.

```bash
npm run order -- <conversationId>
```

Shows the pending questions and the order the round would follow. Answers "why did that one speak
and not the one who was just asked?" without spending a turn.

```bash
npm run prompt -- <conversationId> <participant> [index]
```

Prints the **exact prompt** that participant would receive if they spoke now. The third argument
forces a different `lastSeenIndex`, to reproduce what they saw on a past turn.

This is the tool that settles the most common and hardest class of doubt: *"I told it something
and it ignored me — did it even arrive?"*. Instead of inferring it from behaviour, you look.

```bash
$ npm run prompt -- 0f3c9a71-0000-4000-8000-000000000000 pm 15
## Your turn

### The moderator is telling you this

> STOP THERE. Drop the pricing thread. I want the two options for the first release…

**That takes precedence.** If it is taking you to another topic, drop the previous thread and
follow it.
```

Conversation ids are the file names under `data/projects/<projectId>/conv/`, and
`GET /api/projects/:id/conversations` returns them too. Pass the full id: `findConversation`
looks for the exact file, it does not resolve prefixes.

---

## How it is put together

```
server/src/
  index.ts          API + SSE + serves the front
  base.ts           shared primitives (paths, atomic write, slug)
  config.ts         projects: read, create, edit, delete, validate paths
  frame.ts          drafts a project's frame by reading its repo
  participants.ts   discovers and parses .claude/agents/*.md, and the pool
  frontmatter.ts    tolerant parser (the real frontmatter is not valid YAML)
  tools-policy.ts   which tools exist and which are auto-approved
  prompts/
    strings.ts      the shape every language pack has to satisfy
    en.ts           English pack (the default)
    es.ts           Spanish pack
    index.ts        the builders: system prompt, turn, synthesis
  markers.ts        parser for the marker block, in either language
  turn.ts           one turn: SDK session, streaming, cost
  orchestrator.ts   turns, rounds, session, stopping, artifacts
  store.ts          conversations, derived board, deletion, migrations
  personas.ts       the pool of people, and writing one
  names.ts          names for a repo's own profiles that have none
  history.ts        the project history the agents can read
  artifacts.ts      synthesis → local draft, and publishing to AISPECS/
  bus.ts            SSE events and the per-conversation lock

web/src/            React: transcript, turn rail, moderator bar, document viewer
  i18n/             en.ts, es.ts and the provider — interface language only

data/personas/*.md            the people the app wrote — one file each, `project:` scopes one
data/projects/<projectId>/
  shared/history.md           every conversation and where it landed — the ONE folder agents read
  names.json                  names invented for the repo's own profiles
  conv/<convId>.json          one topic: who sits, the transcript, the sessions
  artifacts/<convId>/*.md     drafts, before publishing
```

### The decisions holding this up

**One isolated session per participant, with delta injection.** Each receives only what was said
since their last turn; the accumulated context of their own turns already lives in their SDK
session. That is why a long roundtable does not grow quadratically, and why in a parallel round
each of them still learns afterwards what the others said.

**The board is derived from the transcript**, never kept alongside it. That way it cannot drift out
of sync with what was actually said.

**The server announces when the roundtable is busy**, rather than the client inferring it.
Inferring it from outside raced with the end of the turn, and left the interface stuck.

**Work lives on the server side.** Close the tab mid-session and the roundtable carries on; you
find it where it got to.

### Migrations

The on-disk layout has changed a few times. Every migration runs at boot and is a no-op
afterwards:

- `data/rooms/` — the oldest layout, where one "room" was group and conversation at once. Each
  becomes a roundtable holding one conversation. Renamed to `data/rooms.migrated`.
- `data/mesas/` — the Spanish layout, with `mesa.json` and Spanish marker field names inside the
  transcript. Field names and phase values translated, and the original renamed to
  `data/mesas.migrated`.
- `data/roundtables/` — conversations used to hang off a **roundtable**, a standing group whose
  only job was owning who sits. Each folds into its project: `loadProjectSettings` moves onto each
  conversation's own seats, the group's name is kept in `roundtable.migrated.txt` (and prefixed
  onto the conversation titles when a project had more than one, so you can still tell them
  apart), and the history is rebuilt to cover the whole project. The original is renamed to
  `data/roundtables.migrated`.

- `ai-office-*.md` inside a project's `.claude/agents/` — profiles the app used to write into the
  repo, from back when they were per project. They move into `data/personas/` and the originals are
  deleted: leaving them would seat the same person twice, once from each source. Nothing else in
  that directory is touched.

Projects already in `config.json` when the `locale` field arrived are stamped `es`, because they
predate the English protocol and their profiles are Spanish. New projects default to `en`.

---

## Costs

An Opus turn with these agents runs roughly $0.10 to $0.60 equivalent, depending on the length of
the profile and whether the `CLAUDE.md` is loaded. One round of 4 participants is ~2 minutes and
~$1.50; a converging session of 4 rounds plus the documents can pass $6 and 20 minutes.

**The cheapest lever is each seat's own level.** *Rápida* puts that participant on sonnet with low
reasoning effort — for a salesperson saying whether something is sellable, that is the right answer
*and* a fraction of the cost. Reserve *a fondo* for the seats whose judgement the question actually
turns on.

The one-offs are small: drafting a project's frame is $0.05–$0.15 on sonnet, writing a person about
$0.20, naming a repo's unnamed profiles about $0.02 for all of them at once.

All of that goes against your subscription, not against the API. The per-turn number is behind each
speaker's name and the running total per participant is in the right column.

---

## License

MIT — see [LICENSE](LICENSE). Use it, modify it and distribute it however you like; the only thing
it asks is that the copyright notice be kept. It comes with **no warranty**: it runs against your
Claude subscription and writes to your disk, so check what you point it at.

## If you work against a private repo

The app is pointed at *your* project, so anything you write while using it — a comment, a
placeholder, an example in these docs — tends to arrive with whatever was on screen. If this
checkout is one you also publish from, enable the guard once:

```bash
git config core.hooksPath .githooks
cp .private-terms.example .private-terms   # then list your own names in it
```

`pre-commit` refuses a commit that adds one of those names, and `npm run privacy` checks the whole
tree, untracked files included. `.private-terms` is gitignored — a list of private names is
exactly the thing not to publish.

---

## Contributing

There are no tests: verifying a change costs money and quota. If you send a PR, run the free
things first and say what you got:

```bash
npm run typecheck    # tsc over server/ and web/
npm run doctor       # participant discovery and permissions
npm run protocol     # the protocol exactly as an agent receives it
```

`CLAUDE.md` holds the repo's invariants: things that look improvable and are not, each with the
reason it ended up that way. Read it before "fixing" something that looks odd — especially the
frontmatter parser, `settingSources: []`, and the order of precedence in `prompts/`.
