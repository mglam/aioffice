# The AI Office

**Several Claude Code agents, each with a different professional profile, reading the same
repository and disagreeing about it.**

Seat a product manager, an architect, a domain specialist, the customer who would sign for it, the
engineer who would have to run it. All of them read your code with the tools you use yourself —
`Read`, `Grep`, `Glob`, a web search — so nobody argues from a summary somebody wrote for them.
And each argues from where they sit: the architect and the customer's engineer open the same file
and draw opposite conclusions.

**You type the question and press Play.** One of them chairs, the rest answer each other, and it
runs until the question is actually answered — not for a fixed number of rounds. Then it writes
the documents it was convened to produce. You can redirect them, reseat, or stop at any point; the
normal case is one Play and a read.

Local, no database, no API key — it runs on your own Claude Code, against your own subscription.
Nothing reaches your repository until you publish it.

**Two levels, and no more.** A **project** is a repo plus one paragraph saying what the product
is. A **conversation** is one question and everything about it: who sits, the deliverables, the
transcript. A project holds as many as you like, and a new one opens with the previous
conversation's seats already picked.

---

## Getting it running

**This runs on Claude Code, not on an API key.** Every participant is a Claude Code process the
app starts for you, so the `claude` command has to be installed, on your `PATH` and **logged in**
before any of this works. There is no fallback: without it the app boots, the interface loads, and
the first turn fails.

So the shortest path is to do the whole thing **from inside Claude Code** — if `claude` runs, the
requirement is already met:

```bash
claude                 # in a terminal. Then, at its prompt:

> clone https://github.com/mglam/aioffice into ~/code and start it
```

Or by hand, once you know `claude --version` answers and `claude` has been logged in at least
once:

```bash
claude --version       # must print a version. If not: https://claude.com/claude-code
claude                 # once, to log in, then /exit

git clone https://github.com/mglam/aioffice
cd aioffice
npm install
npm start              # http://localhost:5174
```

`npm start` serves the API and the built front end together on **:5174**. `npm run dev` instead
gives you Vite with hot reload on **:5173**, talking to the same API on :5174 — use that one only
if you are changing the interface.

You also need **Node 20.10 or newer**. Nothing else to configure: projects are added from the web
UI and the app writes `config.json` itself. No database — everything is JSON under `data/`.

### A few things that follow from that

**Authentication.** No API key, no Console account. The SDK ships no binary: it spawns the
`claude` on your `PATH`, which supplies your existing session credentials. If you log out, turns
start failing — nothing complains at startup.

**Two languages, on different axes.** The interface is English or Spanish, per browser. The
*agents* are addressed in the project's own language, and a new project's is read off the repo
rather than assumed. You can run a Spanish discussion from an English interface.

**The app's own agents ship with it**, in `.claude/agents/`: `frame-writer` reads a repo and
drafts its frame, `agent-writer` writes a profile, `namer` invents a name for one that has none.
Alongside them `.claude/archetypes/` holds the eight role briefs — the pre-thought part — that
`agent-writer` turns into someone specific. They are plain Markdown: to change how one behaves,
edit the file.

**Adding a project** is two steps behind the gear by the project selector: pick the folder, then
confirm the name, language and frame — which is drafted for you by reading the repo, and costs
$0.05–$0.15. Only a codebase root can be chosen; a folder you have never opened Claude Code in
works fine.

---

## Who you can seat

The **people** icon in the masthead. Three groups, and the difference is who may change them:

- **Global** — whoever's usefulness is their craft, not your product: a salesperson, a domain
  specialist, a facilitator. Written from the role alone, offered everywhere.
- **For one project** — whoever means nothing in the abstract: its product manager, the customers
  who would buy it, its architect. Its repository is read while writing them, so the specifics are
  real.
- **Inherited from your repo** — the `.md` files already in `<project>/.claude/agents/`. Yours;
  the app reads them, seats them, and never edits them. If one is titled by role rather than named,
  **Name them** invents a name and keeps it in the app's own data.

**+ New person** asks for a role and the knobs that role varies on — how a salesperson sells,
what field a specialist knows — and writes one. About $0.20. A role can be filled as many times as
you like: three specialists tuned differently is a better table than one.

Everything the app writes lives in its own `data/personas/`, never in your repository.

---

## Running one

Type the question, pick a mode, press Play.

| mode | |
|---|---|
| **Reach the deliverables** | the default. No question: they work until everyone has closed, then write whatever is ticked under *Deliverables*. Untick them all and it converges without spending on documents. |
| **Answer a question** | the same engine, with what you typed as the standing question — re-injected on every turn, so nobody drifts off it. |
| **One round, all at once** | a single parallel pass. Nobody sees the others inside the round, so the first speaker cannot anchor the rest. |

**⌘↵** plays; mid-round it redirects them instead, and what you say outranks the standing
question. **Stop** cuts the turn in flight and keeps what it managed to say.

Three phases — open, cross, close — and it ends on *state*: nothing unanswered, no blocker
standing, everyone has taken a position. The round count is a cap, not a plan. If it runs out
without converging it **writes nothing** and tells you what is still open.

**A chair changes the outcome more than anything else.** The star beside a name makes that
participant the only one who asks. Measured: in an open conversation 82% of turns contained a
question and sessions ran out of rounds; with a chair the others dropped to 0% and left *more*
agreements and blockers per turn.

Each seat has one control — a ring you click up: *not taking part → short, concrete answers →
a full answer → works it through in detail*. It sets how much the model reasons before answering,
and asks for a length. The first level also puts that seat on sonnet — the right answer for a
salesperson saying whether a thing is sellable, and a fraction of the cost.

**Copy** opens the same setup again with an empty transcript; **Restart** empties this one.
Both keep the people, the question and the deliverables.

---

## What comes out

Nothing is written to your repository until you say so. A generated document is a **draft** under
the app's own `data/`; click it to read it rendered, then **Publish to the project**
copies it to `<project>/AISPECS/<conversation>/`, and never over a file that is already there.
**Download** saves the markdown without publishing.

Five types ship: work plan, requirements, commercial proposal, review of what exists, and the
agreements reached. Whoever writes each is picked from the people actually seated — requirements
from a product manager, the proposal from a salesperson, the plan from Claude Code.

---

## What the agents can do

**Read, and nothing else.** Each gets the intersection of what its own file declares and a
read-only list — `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, and `Bash` limited to
inspection. `Edit` and `Write` do not exist in their context; documents are written by the
backend from the markdown they return.

Outside your repository they can read **one** directory, holding one file: the project's
`shared/history.md`, a regenerated summary of every conversation held about it. The raw
transcripts sit outside that grant.

Turns run with `settingSources: []`, so your repo's hooks and permission allowlist are not
inherited. Its `CLAUDE.md` is read and injected deliberately, and only for the profiles that want
it.

---

## Costs

An Opus turn runs roughly $0.10–$0.60 equivalent; a converging session of four rounds plus the
documents can pass $6 and 20 minutes. **The cheapest lever is each seat's level** — reserve the
top one for the seats the question actually turns on. One-offs are small: a project's frame
$0.05–$0.15, a profile about $0.20, naming a repo's unnamed profiles about $0.02 for all of them.

It all goes against your Claude subscription, not an API bill. The figure behind each speaker's
name is the SDK's own estimate — useful for comparing participants, not an invoice.

---

## When something looks wrong

All free, no turn spent:

```bash
npm run doctor                          # who was discovered, from which file, with which tools
npm run protocol [-- es]                # the protocol exactly as an agent receives it
npm run order   -- <conversationId>     # who speaks next, and why
npm run prompt  -- <conversationId> <participant>
```

The last one prints the **exact** prompt that participant would receive. It settles the most common
doubt — *"I told it something and it ignored me, did it even arrive?"* — by looking instead of
inferring.

If a turn fails, check that `claude` still answers and is logged in: the app has no credentials of
its own.

---

## Working on it

`CLAUDE.md` is the one to read before changing anything: it records what each decision cost and
which apparent improvements have already been tried and reverted. `npm run typecheck` covers both
workspaces.

If this checkout also pushes to a public remote, enable the guard once — the app is pointed at
*your* project, so private names find their way into comments and examples:

```bash
git config core.hooksPath .githooks
cp .private-terms.example .private-terms   # then list your own names
```

`npm run privacy` checks the whole tree, untracked files included.

---

## License

MIT — see [LICENSE](LICENSE). Use it, modify it and distribute it however you like; the only thing
it asks is that the copyright notice be kept. It comes with **no warranty**: it runs against your
Claude subscription and writes to your disk, so check what you point it at.
