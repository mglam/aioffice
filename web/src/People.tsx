import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AiRefresh } from './AiRefresh';
import { Markdown } from './markdown';
import { useT } from './i18n';
import type { Archetype, ParticipantDef, PersonaRef, Project } from './types';

/** How much of an inherited agent's own description a row shows before cutting it. */
const BLURB = 120;

/**
 * What the form is holding. `editing` is the id being rewritten, absent when adding — one form
 * serves both, because picking a role and setting its knobs is the same act either way.
 */
type Draft = {
  role: string;
  tuning: Record<string, string>;
  /** Written for the project you are standing in, rather than globally. */
  scoped: boolean;
  editing?: string;
};

/** One generated person, kept around so a slow write does not block reading a finished one. */
type Written = { id: string; role: string; markdown: string; costUsd: number };

/**
 * The people you can seat, and the one form that writes them.
 *
 * The pool is **global**: a person is written once and offered to every project. That is the whole
 * design — a specialist's expertise does not belong to a product, and one that was written *for* a
 * product can only ratify it. The project's context reaches them when they are seated: its frame
 * on every turn, its `CLAUDE.md` for the technical profiles, and the repository itself, which they
 * can read.
 *
 * Which means **a role can be filled several times over, on purpose.** Three specialists tuned
 * differently is a better table than one, so adding never replaces: you pick a role, set its
 * knobs, and get another person.
 *
 * **Adding and editing are the same form.** Editing one only arrives with the role fixed and the
 * knobs it was written with already filled in — there is nothing else to decide, so there is
 * nothing else to build. It renders inline rather than in a dialog of its own: a second
 * `<dialog>` in the top layer is the bug recorded in CLAUDE.md, and this component is already
 * inside one.
 */
export function PeopleDialog({ open, onClose, projectId, onChanged }: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  onChanged?: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal(); else ref.current?.close();
  }, [open]);


  const [catalogue, setCatalogue] = useState<Archetype[]>([]);
  const [pool, setPool] = useState<PersonaRef[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [inherited, setInherited] = useState<ParticipantDef[]>([]);
  const [naming, setNaming] = useState(false);
  /** Who the namer has already been asked about — an empty value means "has their own". */
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [written, setWritten] = useState<Written[]>([]);
  const [running, setRunning] = useState<string[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [{ personas }, participants] = await Promise.all([
      api.personas(),
      projectId ? api.participants(projectId) : Promise.resolve({ participants: [] }),
    ]);
    setPool(personas);
    // What the repo brought: neither the app's nor built in. The pool arrives through the same
    // endpoint tagged `pooled`, and listing it twice would read as two copies of one person.
    setInherited(participants.participants.filter((d) => !d.builtin && !d.pooled));
    if (projectId) setNames((await api.names(projectId).catch(() => ({ names: {} }))).names);
  }, [projectId]);

  useEffect(() => {
    void api.archetypes().then((r) => setCatalogue(r.archetypes)).catch(() => {});
    void refresh().catch(() => {});
    // Only for its name: which project you are standing in is the caller's business, and there
    // is no picker here because you already chose it to get here.
    if (projectId) {
      void api.projects()
        .then((r) => setProject(r.projects.find((x) => x.id === projectId) ?? null))
        .catch(() => {});
    }
  }, [refresh, projectId]);

  const arch = (id?: string) => catalogue.find((a) => a.id === id);
  const label = (id?: string) => (id ? t.archetypes[id]?.label ?? id : '');
  /** Knob labels and option values come from the archetype files, which are English. */
  const knob = (s: string) => t.knobs[s] ?? s;

  /**
   * Where a role belongs is a property of the role, so the form opens on it instead of making
   * you know: a product manager arrives scoped to the project, a salesperson global. Still a
   * select — the default is the usual answer, not the only one.
   */
  const defaultScope = (role: string) => !!projectId && arch(role)?.scope === 'project';

  const add = () => {
    const role = catalogue[0]?.id ?? '';
    setDraft({ role, tuning: {}, scoped: defaultScope(role) });
  };

  /** Same form, arriving with what this person was made with. */
  const edit = (p: PersonaRef) => setDraft({
    role: p.role ?? '',
    tuning: { ...p.tuning },
    scoped: !!p.project,
    editing: p.id,
  });

  const submit = async (d: Draft) => {
    const key = d.editing ?? 'new';
    setDraft(null);
    setRunning((r) => [...r, key]); setError('');
    try {
      const { persona } = await api.createPersona({
        archetype: d.role, tuning: d.tuning, replacing: d.editing,
        projectId: d.scoped ? projectId : undefined,
      });
      setWritten((w) => [
        { id: persona.id, role: d.role, markdown: persona.markdown, costUsd: persona.costUsd },
        ...w.filter((x) => x.id !== persona.id),
      ]);
      setReading(persona.id);
      setBodies((b) => ({ ...b, [persona.id]: persona.markdown }));
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning((r) => r.filter((x) => x !== key));
    }
  };

  const read = (id: string) => {
    if (reading === id) { setReading(null); return; }
    setReading(id);
    if (bodies[id]) return;
    void api.readPersona(id)
      .then((r) => setBodies((b) => ({ ...b, [id]: r.markdown })))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const drop = (id: string) => {
    if (!confirm(t.people.deleteWarn(id))) return;
    void api.deletePersona(id)
      .then(() => { setWritten((w) => w.filter((x) => x.id !== id)); return refresh(); })
      .then(() => onChanged?.())
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const spent = written.reduce((a, w) => a + w.costUsd, 0);
  const busy = (key: string) => running.includes(key);
  const adding = busy('new');

  /** The knobs of whichever role the form is on. Changing the role changes the questions. */
  const params = arch(draft?.role)?.params ?? [];
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  /**
   * The start of an inherited agent's own `description:`, falling back to its heading when the
   * frontmatter has none. Cut rather than clipped with CSS, so the row stays one line whatever
   * the container width does.
   */
  const blurb = (d: ParticipantDef) => {
    const text = (d.description || (d.label !== d.id ? d.label : '')).trim();
    return text.length > BLURB ? `${text.slice(0, BLURB).trimEnd()}…` : text;
  };

  /** One group of the app's own people. Both editable groups render identically. */
  const group = (heading: string, note: string, people: PersonaRef[]) => (
    <div className="field">
      <label>{heading}</label>
      {people.length === 0 ? (
        <p className="field-note">{t.people.none}</p>
      ) : (
        <div className="role-list">
          {people.map((p) => {
            const fresh = written.find((w) => w.id === p.id);
            const a = arch(p.role);
            return (
              <div className="role-result" key={p.id}>
                {/* The heading a persona gives itself already reads as a full introduction —
                    "Elena Duarte — especialista en protecciones" — so printing the id beside it
                    says the name twice. It is in the tooltip, where the one thing it is good
                    for lives: naming them to `npm run prompt`. */}
                <div className="role-result-head" title={p.id}>
                  <span className="role-name">{p.label}</span>
                  {p.role && <span className="role-fills">{label(p.role)}</span>}
                  {fresh && <span className="role-state">${fresh.costUsd.toFixed(2)}</span>}
                  {busy(p.id) && <span className="role-state">{t.people.writing}</span>}
                  <span className="spacer" />
                  <button className="btn btn-sm btn-ghost" onClick={() => read(p.id)}>
                    {reading === p.id ? t.setup.hide : t.setup.read}
                  </button>
                  <button className="btn btn-sm btn-ghost"
                          disabled={busy(p.id) || !a || draft?.editing === p.id}
                          title={t.people.editTitleShort}
                          onClick={() => edit(p)}>
                    {t.common.edit}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => drop(p.id)}>
                    {t.setup.discard}
                  </button>
                </div>

                {/* What they were made with, which is also what the form opens on. */}
                {(a?.params.length ?? 0) > 0 && (
                  <div className="tuning">
                    {a!.params.map((prm) => (
                      <span className="tune-chip" key={prm.id}>
                        {knob(prm.label)}: {p.tuning[prm.id] ? knob(p.tuning[prm.id]) : '—'}
                      </span>
                    ))}
                  </div>
                )}

                {reading === p.id && (
                  <div className="speech role-body">
                    {bodies[p.id]
                      ? <Markdown text={bodies[p.id]} />
                      : <p className="field-note">{t.common.loading}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="field-note">{note}</p>
    </div>
  );

  return (
    <dialog ref={ref} onCancel={onClose} onClose={onClose} className="wide">
      <div className="dialog-body">
        <div className="dialog-head"><h2>{t.people.title}</h2></div>
        <p className="lede">{t.people.lede}</p>

        {adding && <p className="reading-note">{t.people.writingNote}</p>}
        {spent > 0 && <p className="field-note">{t.setup.spent(spent.toFixed(2))}</p>}

        {/* Three kinds of person can work on something, and the difference is where they come
            from and who may change them. Written out as three lists rather than one with a badge:
            what you can do to a row differs per group, and a list whose actions change row by row
            is a list you have to read twice. */}
        {group(t.people.globals, t.people.globalsNote, pool.filter((p) => !p.project))}

        {projectId && group(
          t.people.forProject(project?.name ?? ''),
          t.people.forProjectNote,
          pool.filter((p) => p.project === projectId),
        )}

        {projectId && (
          <div className="field">
            <label className="label-row">
              {t.people.inherited}
              {/* The one thing the app may do about a file it must not touch: invent a name for
                  whoever has none, keep it in its own data, and tell them on every turn — a table
                  cannot address "the product manager". Hidden once nobody is left unasked. */}
              {inherited.some((d) => !(d.id in names)) && (
                <AiRefresh busy={naming} label={t.people.nameThem}
                           title={naming ? t.people.naming : t.people.nameThemTitle}
                           onClick={() => {
                             setNaming(true); setError('');
                             void api.writeNames(projectId!)
                               .then((r) => { setNames(r.names); return refresh(); })
                               .catch((e) => setError(
                                 e instanceof Error ? e.message : String(e)))
                               .finally(() => setNaming(false));
                           }} />
              )}
            </label>
            {inherited.length === 0 ? (
              <p className="field-note">{t.people.noneInherited}</p>
            ) : (
              <div className="role-list">
                {/* Just the files that are there: the `name:` each one declares and the start of
                    its own `description:`. Both are already written and free to read — there is
                    nothing here to spend a model on. The full text is in the tooltip. */}
                {inherited.map((d) => (
                  <div className="role-row static" key={d.id} title={d.description || d.label}>
                    <span className="role-id">{d.id}</span>
                    <span className="role-desc">{blurb(d)}</span>
                    {d.person && <span className="role-fills">{t.people.named}</span>}
                  </div>
                ))}
              </div>
            )}
            <p className="field-note">{t.people.inheritedNote}</p>
          </div>
        )}

        {/* One form, for adding and for editing. The role decides the questions, so it cannot
            exist before the role is picked — which is why the role is the first field rather than
            a step. It sits at the bottom, next to the button that opens it. */}
        {draft && (
          <div className="persona-form">
            <div className="persona-form-head">
              {draft.editing ? t.people.editTitle(draft.editing) : t.people.addTitle}
            </div>

            <div className="knobs">
              <div className="knob">
                <label htmlFor="pf-role">{t.people.role}</label>
                {/* Fixed when editing: the seat is who they are. Wanting a different role is
                    wanting a different person, which is what the add button is for. */}
                {draft.editing ? (
                  <span className="knob-fixed">{label(draft.role)}</span>
                ) : (
                  <select id="pf-role" value={draft.role}
                          onChange={(e) => set({
                            role: e.target.value,
                            // The knobs belong to the role, and so does where it belongs.
                            tuning: {},
                            scoped: defaultScope(e.target.value),
                          })}>
                    {catalogue.map((a) => (
                      <option key={a.id} value={a.id}>{label(a.id)}</option>
                    ))}
                  </select>
                )}
              </div>

              {!draft.editing && (
                <p className="field-note knob-note">
                  {t.archetypes[draft.role]?.note ?? arch(draft.role)?.description}
                </p>
              )}

              {params.map((prm) => (
                <div className="knob" key={prm.id}>
                  <label htmlFor={`pf-${prm.id}`}>{knob(prm.label)}</label>
                  {prm.kind === 'choice' ? (
                    <select id={`pf-${prm.id}`} value={draft.tuning[prm.id] ?? ''}
                            onChange={(e) => set({
                              tuning: { ...draft.tuning, [prm.id]: e.target.value },
                            })}>
                      {/* Empty is a real answer: the writer picks something coherent. */}
                      <option value="">{t.people.anyOption}</option>
                      {prm.options.map((o) => <option key={o} value={o}>{knob(o)}</option>)}
                    </select>
                  ) : (
                    <input id={`pf-${prm.id}`} value={draft.tuning[prm.id] ?? ''}
                           placeholder={prm.hint ? knob(prm.hint) : t.people.anyText}
                           onChange={(e) => set({
                             tuning: { ...draft.tuning, [prm.id]: e.target.value },
                           })} />
                  )}
                </div>
              ))}

              {/* Global, or for the project you are standing in. Not just a filter: writing
                  someone *for* a project is what licenses reading that repo, which is the only way
                  the knobs nobody answered — which field, which technologies — get a real answer
                  instead of a guess. Nothing read there reaches the persona's text. */}
              {projectId && (
                <div className="knob">
                  <label htmlFor="pf-scope">{t.people.scope}</label>
                  <select id="pf-scope" value={draft.scoped ? 'project' : 'global'}
                          onChange={(e) => set({ scoped: e.target.value === 'project' })}>
                    <option value="global">{t.people.scopeGlobal}</option>
                    <option value="project">{t.people.scopeProject(project?.name ?? '')}</option>
                  </select>
                </div>
              )}

              {draft.scoped && <p className="field-note knob-note">{t.people.scopedNote}</p>}

              <div className="knob-foot">
                <span className="field-note">
                  {draft.editing ? t.people.editNote : t.people.addNote}
                </span>
                <span className="spacer" />
                <button className="btn btn-sm btn-ghost" onClick={() => setDraft(null)}>
                  {t.common.cancel}
                </button>
                <button className="btn btn-sm btn-primary" disabled={!draft.role}
                        onClick={() => void submit(draft)}>
                  {draft.editing ? t.setup.regenerate : t.people.generate}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="error-note">{error}</p>}
      </div>

      {/* Same footer as every other manager, and that means no spacer: `.dialog-foot` is
          `justify-content: flex-end`, so the pair sits together on the right. A spacer here put
          «close» on the far left and made this one dialog look different from the rest. */}
      <div className="dialog-foot">
        <button className="btn btn-ghost" onClick={onClose}>{t.common.close}</button>
        <button className="btn btn-primary" onClick={add}
                disabled={!catalogue.length || !!draft || adding}>
          {t.people.add}
        </button>
      </div>
    </dialog>
  );
}
