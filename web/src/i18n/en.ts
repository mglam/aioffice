import type { ArtifactType, Phase } from '../types';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * English UI strings, and the shape every other locale must satisfy.
 *
 * This is the UI's own language, independent of the language the agents are addressed in
 * (that one is per project, and lives in `server/src/prompts/`). A Spanish roundtable can
 * be driven from an English interface and vice versa.
 */
export const en = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    close: 'Close',
    edit: 'Edit',
    delete: 'Delete',
    deleting: 'Deleting…',
    opening: 'Opening…',
    copy: 'Copy',
    name: 'Name',
    loading: 'loading…',
  },

  app: {
    project: 'Project',
    noProjects: 'no projects',
    manageProjects: 'Manage projects',
    people: 'People',
    language: 'Language',
    turnsAndCost: (turns: number, cost: string) =>
      `${turns} ${plural(turns, 'turn', 'turns')} · $${cost}`,
  },

  nav: {
    conversationsEyebrow: 'Conversations',
    needsProject: 'Add a project first',
    newConversation: '+ New conversation',
  },

  center: {
    pickConversation: 'Pick a conversation',
    noConversations: 'No conversations yet',
    pickConversationBody: 'Or open a new one on another topic, with the same people.',
    noConversationsBody:
      'Open one: a topic, a question to answer, and the people you want weighing in.',
  },

  transcript: {
    moderator: 'Moderator',
    phase: { open: 'opening', cross: 'crossing', close: 'closing' } as Record<Phase, string>,
    allOfTheirs: 'all of theirs',
    closed: 'closed',
    hasFloor: 'has the floor',
    thinking: 'working — nothing written yet',
    newTurns: (n: number) => `${n} new ${plural(n, 'turn', 'turns')}`,
    toEnd: 'Go to end',
    emptyTitle: (title: string) => `Nothing said yet in "${title}"`,
    emptyBody:
      'Pick a mode, type what you want answered, and press Play. Who speaks is whoever is ticked '
      + 'on the right.',
  },

  chair: {
    modeLabel: 'How it runs',
    modeAnswer: 'Answer a question',
    modeSweep: 'One round, all at once',
    modeDeliver: 'Reach the deliverables',
    play: 'Play',
    playTitle: 'Run it. Anything in the box goes in as your message first.',
    playBlocked: 'Tick at least one seat on the right — two, unless it is a single round. The '
      + 'question modes need a question: type one in the box.',
    placeholder:
      'The question to answer. Play sends it — or ⌘↵ / Ctrl↵. Leave it empty to carry on with the '
      + 'one already standing; mid-round, whatever you type redirects them.',
    stop: 'Stop',
    stopping: 'Stopping…',
    hintStopping:
      'Stopping. The current turn is cut and whatever it managed to say stays in the transcript.',
    hintWriting: (what: string) => `The roundtable closed. Writing ${what}…`,
    hintPhase: (phase: string, round: number, rounds: number) =>
      `${phase} — round ${round} of ${rounds}.`,
    hintAuto:
      'The roundtable is talking on its own. You can stop it: what was said stays in the transcript.',
    hintIdle:
      'Who speaks is whoever is ticked on the right — one of them is a single turn. ⌘↵ plays.',
    hintDeliver:
      'No question: they work until they close, then write whatever is ticked under Deliverables. '
      + 'Untick them all and it writes nothing.',
    hintNoQuestion:
      'This conversation has no question, so it can only chat. Define it on the right.',
    writeFailed: (what: string, message: string) => `Could not write "${what}": ${message}`,
  },

  open: {
    didNotClose: (blockers: number, notClosed: string[]) =>
      `The roundtable did not close: ${blockers} ${plural(blockers, 'blocker', 'blockers')} standing`
      + (notClosed.length ? ` and ${notClosed.join(', ')} have not closed` : '')
      + '. I wrote nothing.',
    carryOn: 'Carry on with the roundtable',
    writeAnyway: 'Write anyway',
    writeAnywayTitle: 'The documents will open by declaring what was left open.',
  },

  convActions: {
    copy: 'Copy',
    copyTitle:
      'Opens the same conversation again — same people at the same levels, same question, same '
      + 'deliverables, nothing said yet. This one is kept. Change the question in the bar and '
      + 'press Play.',
    reset: 'Restart',
    resetTitle:
      'Empties this conversation and keeps its setup. Anything already published to your repo is '
      + 'left alone.',
    resetWarn: (turns: number) =>
      `Empty this conversation? Its ${turns} `
      + `${turns === 1 ? 'turn' : 'turns'} and any drafts go, and cannot be recovered. The people, `
      + 'the question and the deliverables stay. Documents already published to your repo are not '
      + 'touched.',
  },

  context: {
    eyebrow: 'Context',
    noBrief: 'no context — click to write it',
    editBrief: 'Edit context',
    briefPlaceholder: 'What to know before weighing in on this topic.',
  },

  seatPicker: {
    title: 'Seat someone',
    lede:
      'They receive everything said so far on their first turn, so a conversation already under '
      + 'way is a fine place to bring someone in.',
    global: 'global',
    forProject: 'this project',
    fromRepo: 'from the repo',
    builtin: 'built in',
    chars: (n: number) => `${(n / 1000).toFixed(1)}k prompt`,
    submit: (n: number) => (n === 1 ? 'Seat 1' : `Seat ${n}`),
  },

  seats: {
    eyebrow: 'Participants',
    add: '+ seat',
    addTitle: 'Seat someone else in this conversation. They receive the transcript so far on '
      + 'their first turn.',
    everyone: 'Everyone available is already seated.',
    chairSet: (who: string) => `Let ${who} run this conversation`,
    chairClear: 'Runs this conversation. Click to leave it open.',
    chairNeedsIn: 'Not taking part, so they cannot run it. Bring them in first.',
    levelChairFloor:
      'Whoever runs the conversation has to take part, so this one cannot be turned off — move '
      + 'the star first. Click for: short, concrete answers.',
    gone: 'no longer in .claude/agents/',
    level: {
      off: 'not taking part',
      low: 'takes part with short, concrete answers',
      medium: 'gives a full answer',
      high: 'works the answer through in detail',
    } as Record<string, string>,
    levelLabel: (who: string, now: string) => `${who}: ${now}`,
    levelTitle: (now: string, next: string) => `${now}. Click for: ${next}.`,
    speaking: 'speaking now',
    noAgents:
      'This project has nobody of its own yet — only claude-code. Add someone from People, in '
      + 'the header.',
  },

  deliverables: {
    eyebrow: 'Deliverables',
    openDoc: 'Open the document',
    published: 'published',
    draft: 'draft',
    notClosed: 'not closed',
    types: {
      plan: { title: 'Work plan', note: 'scope, phases, verification' },
      requirements: { title: 'Requirements', note: 'problem, constraints, criteria' },
      proposal: { title: 'Commercial proposal', note: 'what ships, what is not promised' },
      review: { title: 'Review of what exists', note: 'what is solid, what is missing, in what order' },
      decisions: { title: 'Agreements', note: 'decided, open, disagreements' },
    } as Record<ArtifactType, { title: string; note: string }>,
  },

  /**
   * The eight archetypes that ship with the app. Their `.md` files carry a description too, but
   * that one is the brief for the writer — this is the label a person reads in a picker, so it
   * belongs in the locale like any other interface text. Unknown ids fall back to the file's.
   */
  archetypes: {
    'pm': { label: 'Product manager', note: 'What to build, in what order, and what not to build' },
    'sales': { label: 'Sales', note: 'What can be shown, what can be promised, what must not be' },
    'customer-business': { label: "Customer — decision maker", note: 'Buys the outcome, not the feature' },
    'customer-technical': { label: "Customer — engineer", note: 'Has to run it, and spots the promise that will not survive' },
    'software-architect': { label: 'Software architect', note: 'Where each thing lives, and why' },
    'domain-specialist': { label: 'Domain specialist', note: 'The technology or industry the product is about' },
    'developer': { label: 'Developer', note: 'What it takes to actually build it, in this codebase' },
    'facilitator': { label: 'Facilitator', note: 'Notices when the discussion has wandered, and says so' },
  } as Record<string, { label: string; note: string }>,

  conversations: {
    rename: 'Rename this conversation',
    pickToDelete: 'Delete a conversation…',
    pickCancel: 'Never mind',
    pickNote: 'Pick the one to delete.',
    deleteTitle: (title: string) => `Delete "${title}"`,
    deleteWarn: (title: string, turns: number) =>
      `Delete "${title}"? Its transcript of ${turns} `
      + `${turns === 1 ? 'turn' : 'turns'} and any drafts go with it. Documents already `
      + 'published to the project are left alone.',
  },

  setup: {
    titleNew: 'Add a project',
    titleEdit: (name: string) => `Set up ${name}`,
    steps: 'Setup steps',
    stepFolder: 'Folder',
    stepIdentity: 'Identity',
    back: 'Back',
    next: 'Next',
    checking: 'checking…',
    refresh: 'AI',
    refreshTitle: 'Re-read the repo and refresh the name, language and frame (~$0.10)',
    refreshBusy: 'Reading the repo…',
    readingRepo: 'Locked while it reads: what it returns replaces these fields.',
    pending: 'Unsaved changes.',
    changed: 'changed',
    discardChanges: 'Discard changes',
    saveChanges: 'Save changes',
    notAProject:
      'This does not look like a codebase root — no CLAUDE.md, README, git repo or manifest. '
      + 'Pick a project folder, or look inside this one.',
    noClaudeMd: 'No CLAUDE.md, so the frame is drafted from the README instead.',
    createAndGo: 'Create the project',
    created: (name: string) =>
      `"${name}" exists now. Add the people who will sit at its roundtables from the People `
      + 'button in the header; the gear beside the project selector reopens this.',
    done: 'Done',
    nameNote: 'Defaults to the folder name. Only for you to recognize it by.',
    spent: (usd: string) => `Spent so far: $${usd}`,
    read: 'Read',
    hide: 'Hide',
    regenerate: 'Regenerate',
    discard: 'Delete',
  },

  people: {
    title: 'People',
    lede:
      'Everyone here can sit at any project\'s table. A persona is a professional, not a project '
      + 'artifact: what the product is arrives when they are seated, so the same specialist can '
      + 'judge one thing today and another next month. They are written in English, and they '
      + 'answer in whatever language the project they are seated at uses.',
    add: '+ New person',
    /** The form's own heading, where the `+` of the button would read wrong. */
    addTitle: 'New person',
    role: 'Role',
    editTitle: (id: string) => `Edit ${id}`,
    editTitleShort: 'Change what they were written with, and write them again',
    anyOption: 'let Claude decide',
    anyText: 'leave empty and Claude decides',
    addNote: 'The knobs are what make two people in the same role different. About $0.20.',
    editNote:
      'Same role, and the knobs they were written with. Generating replaces their text — the '
      + 'transcripts they already appear in are untouched. About $0.20.',
    generate: 'Generate',
    writing: 'writing…',
    writingNote: 'Writing the persona. It takes a minute; you can keep working.',
    scope: 'Who they work for',
    scopeGlobal: 'Any project',
    scopeProject: (name: string) => `Only ${name}`,
    scopedNote:
      'Offered only at that project, and its repository gets read while writing them — so an '
      + 'inside role learns what the thing does and the words its team uses for its own '
      + 'concepts, and any role gets its blanks settled from something real instead of guessed. '
      + 'Never a feature list or an internal identifier: those age. Adds a few cents and half a '
      + 'minute.',
    globals: 'Global',
    globalsNote:
      'The people whose usefulness is their craft rather than your product: a salesperson '
      + '(selling is selling), a domain specialist, a facilitator. What they know travels — an '
      + 'IP specialist is worth seating at every project that touches a network.',
    forProject: (name: string) => `Written for ${name}`,
    forProjectNote:
      'The people who only mean anything against a particular product: its product manager, the '
      + 'customers who would buy it and the engineer who would have to run it, its architect and '
      + 'developers. A product manager in general is nobody, and a potential buyer is always a '
      + 'buyer of something.',
    inherited: 'Inherited from the repository',
    noneInherited: 'This repo has no .claude/agents/ of its own.',
    nameThem: 'Name them',
    nameThemTitle:
      'Some of these are titled by role, and a table cannot address "the product manager". '
      + 'Invents a name for whoever has none (~$0.02), keeps it here — never in your repo — and '
      + 'tells them on every turn. Anyone already named is left alone.',
    naming: 'Naming them…',
    named: 'named here',
    inheritedNote:
      'The .md files in the project\'s own .claude/agents/. Yours, and your Claude Code sees them '
      + 'in that folder too — so the app reads them off disk, seats them like anyone else, and '
      + 'never writes, edits or deletes them. An id here wins over one of the app\'s own.',
    none: 'Nobody yet. Add the first one.',
    deleteWarn: (id: string) =>
      `Delete "${id}"? Roundtables that seated them keep their transcript, but they cannot speak `
      + 'again unless you write someone new.',
  },

  /**
   * Knob labels and option values, which come from the archetype files and are written in
   * English. Anything missing falls back to the raw string, so this table is empty here.
   */
  knobs: {} as Record<string, string>,

  doc: {
    publishedAt: (where: string) => `published at ${where}`,
    draftNote: 'draft — not in the project yet',
    writtenWithBlockers: (n: number) =>
      ` · written with ${n} ${plural(n, 'blocker', 'blockers')} standing`,
    download: 'Download',
    downloadTitle: 'Save the markdown as it stands. A draft never touches your repo until you '
      + 'publish it.',
    discard: 'Discard',
    discardPublished: 'Deletes the draft. The copy published to the project stays.',
    discardDraft: 'Deletes the draft. Nothing was written to the project.',
    publish: 'Publish to the project',
    publishing: 'Publishing…',
    alreadyPublished: 'Published',
    alreadyPublishedTitle: 'Already in the project',
    publishTitle: (path: string) => `Copy to ${path}/AISPECS/`,
  },

  newConversation: {
    title: 'New conversation',
    lede: (project: string) => `About ${project}.`,
    who: 'Who sits',
    noParticipants: 'This project has nobody to seat yet. Add someone from People, in the header.',
    whoNote:
      'Only these speak in this conversation, and it defaults to whoever was in the last one. '
      + 'You can seat more later, from the conversation itself.',
    base: ' · base',
    topic: 'Topic',
    topicPlaceholder: 'Scope of the first release',
    question: 'The question to answer',
    questionPlaceholder: 'Which mechanisms are in cut 1 and what is left out?',
    questionNote:
      'A conversation converges on a question, not on a topic. With no question it can only chat.',
    context: 'Context',
    contextPlaceholder:
      'What already exists, what was tried, what constraints there are. Each participant reads '
      + 'this on their first turn.',
    deliverables: 'What has to come out of this',
    how: 'How it runs',
    openMode: 'Open',
    openModeTitle: 'Anyone asks anyone.',
    chairedMode: 'Chaired by…',
    chairedModeTitle: 'One asks, the others answer.',
    chairSelectLabel: 'Who chairs this conversation',
    chairedNote: (who: string) =>
      `${who} is the only one who asks; the others answer and hand the turn back. Converges `
      + 'much better.',
    openNote: 'Anyone can ask anyone. More natural, but harder to bring to a close.',
    submit: 'Open the conversation',
  },

  projects: {
    title: 'Projects',
    lede: 'A project is a repo plus a frame: what the product being built is. Participants come '
      + 'from its .claude/agents/.',
    none: 'None yet. Add the first one to get started.',
    active: 'open',
    agents: (n: number) => `${n} ${plural(n, 'agent', 'agents')}`,
    noAgents: 'no agents yet',
    withFrame: 'with frame',
    noFrame: 'NO FRAME',
    add: '+ New project',
    repoPath: 'Repo path',
    repoPathPlaceholder: 'Pick a folder below, or paste an absolute path',
    pathAgents: (n: number) => `✓ ${n} ${plural(n, 'agent', 'agents')} in .claude/agents/`,
    pathNoAgents: '✓ a project, with no agents yet — step 3 can generate them',
    browseUp: 'Up one folder',
    browseHere: 'selected',
    browseEmpty: 'No subfolders here.',
    browseHasAgents: 'agents',
    browseNote: 'Whichever folder you are in is the one selected — the path above is the choice. '
      + 'Greyed rows do not look like a project, but you can still walk into them; › means there '
      + 'is one further down.',
    browseAlsoBelow: 'There is also a project further down',
    browseLeadsTo: 'Not a project itself, but there is one below — open it',
    browseNoProject: 'Not a project, and none found below. You can still look inside.',
    frame: 'The product frame',
    frameNote:
      'Goes to EVERY participant. Without it they discuss the domain instead of the product: '
      + 'their personas are domain personas and your question is not enough to orient them.',
    framePlaceholder:
      'What the product is and who it is for, how it is built broadly, and what gets decided '
      + 'at these roundtables.',
    agentLanguage: 'Language of the agents',
    agentLanguageNote:
      'The language the protocol and the deliverable instructions are written in. Match the '
      + 'language of the personas in .claude/agents/ — a Spanish persona under an English '
      + 'protocol gets a mixed-language prompt. Independent of the interface language.',
    setUp: 'Set up',
    deleteTitle: (name: string) => `Delete "${name}"`,
    deleteLede: 'This will take, from the app:',
    doomConversations: (n: number) =>
      `${n} ${plural(n, 'conversation', 'conversations')} with the full transcript`,
    doomArtifacts: (n: number) => `${n} draft ${plural(n, 'document', 'documents')}`,
    doomWarn: 'This cannot be undone. There is no archive and no trash.',
    doomKept: (folder: string) =>
      `What is NOT touched: the documents you already published to ${folder}/AISPECS/. Those `
      + 'stay, and you delete them yourself.',
    doomType: (name: string) => `Type ${name} to confirm`,
    doomConfirm: 'Delete everything',
  },
};
