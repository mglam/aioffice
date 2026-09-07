import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AiRefresh } from './AiRefresh';
import { FolderPicker } from './FolderPicker';
import { useLocale, useT } from './i18n';
import type { Locale, PathCheck, Project } from './types';

const AGENT_LOCALES: Array<{ id: Locale; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

type Identity = { name: string; locale: Locale; frame: string };

/**
 * Setting up a project: the folder, and its identity. That is all a project *is*.
 *
 * The same component creates and configures. What differs is only which steps are reachable: a
 * step opens once its prerequisites hold, so a new project walks 1 → 2 in order while an existing
 * one has every prerequisite satisfied already and opens either.
 *
 * **People are not configured here.** They were, briefly, as a third step — but you configure
 * them standing in a project, which is exactly where the People screen is opened from, so the
 * step was a second door onto one room. One place, reached from the masthead.
 *
 * Opening it never spends money. A model runs only behind a click, and the one automatic draft —
 * the frame for a project that has none — happens because there is nothing there to overwrite.
 */
export function ProjectSetup({ project, open, onClose, onSaved }: {
  /** null = creating. */
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const t = useT();
  const [uiLocale] = useLocale();
  const ref = useRef<HTMLDialogElement>(null);

  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState<Project | null>(project);

  const [path, setPath] = useState(project?.path ?? '');
  // Tied to the path it answers for. Without that pairing the previous folder's verdict stays on
  // screen through the debounce — and a slow reply can land after a newer one and overwrite it.
  const [checked, setChecked] = useState<{ path: string; result: PathCheck } | null>(null);
  const [name, setName] = useState(project?.name ?? '');
  const [locale, setLocale] = useState<Locale>(project?.locale ?? uiLocale);
  const [frame, setFrame] = useState(project?.frame ?? '');
  /**
   * What is on disk right now. null while creating, because there is nothing to differ from yet —
   * which is also why change marks only appear for a project that already exists.
   */
  const [baseline, setBaseline] = useState<Identity | null>(
    project ? { name: project.name, locale: project.locale ?? uiLocale, frame: project.frame ?? '' } : null,
  );

  /**
   * The project was created in this sitting. Worth saying out loud: step 2 really does register
   * it, and without a word about that the button reads like a promise about the end of the flow.
   */
  const [justCreated, setJustCreated] = useState(false);

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const framed = useRef(false);

  useEffect(() => {
    if (!open) { ref.current?.close(); return; }
    ref.current?.showModal();
    setSaved(project);
    setPath(project?.path ?? '');
    // Empty for a new project, so the proposal can fill it. The folder name is the placeholder
    // and the fallback on save, never a value that blocks the proposed one.
    setName(project?.name ?? '');
    setLocale(project?.locale ?? uiLocale);
    setFrame(project?.frame ?? '');
    setBaseline(project
      ? { name: project.name, locale: project.locale ?? uiLocale, frame: project.frame ?? '' }
      : null);
    setChecked(null);
    setJustCreated(false);
    setError(''); setBusy('');
    framed.current = false;
    // Editing lands on identity, which is what people come here for; creating starts at the folder.
    setStep(project ? 2 : 1);
  }, [open, project, uiLocale]);

  // The path is validated against the disk as you type: it is the most common mistake.
  useEffect(() => {
    const p = path.trim();
    if (!p) { setChecked(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      void api.validatePath(p)
        .then((result) => { if (live) setChecked({ path: p, result }); })
        .catch(() => { if (live) setChecked(null); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [path]);

  /** Only ever the verdict for the path currently in the field. */
  const check = checked && checked.path === path.trim() ? checked.result : null;
  const checking = !!path.trim() && !check;

  /** Reading the repo. The fields are the model's output, so they are not yours to type in yet. */
  const readingRepo = busy === 'frame';
  const changed = (k: keyof Identity) => !!baseline && baseline[k] !== ({ name, locale, frame })[k];
  const anyChanged = changed('name') || changed('locale') || changed('frame');

  const revert = () => {
    if (!baseline) return;
    setName(baseline.name); setLocale(baseline.locale); setFrame(baseline.frame);
  };

  // Prerequisites. One rule, and it is what makes this component serve both modes.
  // Looking like a codebase root is the bar. A missing CLAUDE.md is a warning, not a block: the
  // frame writer falls back to the README, and `claude-code` is seatable regardless.
  const usable = !!check?.ok && check.isProject;
  const canIdentify = !!saved || usable;

  const stepOpen = (n: number) => n === 1 || canIdentify;

  const proposeFrame = () => {
    setBusy('frame'); setError('');
    // No locale for a project that does not exist yet: the agent reads the repo's own docs and
    // reports which language to use, which beats assuming the browser's. An existing project has
    // a language somebody chose, so that one is sent and respected.
    return api.proposeFrame(path || saved?.path || '', saved ? locale : undefined)
      .then((r) => {
        setFrame(r.frame);
        // Both only fill what is empty or unset: re-proposing must not rename a project or
        // silently switch the language of one already configured.
        if (r.name) setName((current) => current.trim() ? current : r.name);
        if (!saved && r.locale) setLocale(r.locale);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(''));
  };

  // A project with no frame gets one drafted on arrival: there is nothing to overwrite. One that
  // has a frame shows it untouched, behind a re-propose button.
  useEffect(() => {
    if (step !== 2 || framed.current || frame.trim() || !(path.trim() || saved)) return;
    framed.current = true;
    void proposeFrame();
  }, [step]);   // eslint-disable-line

  const saveIdentity = () => {
    setBusy('save'); setError('');
    const body = { name: name.trim() || path.split('/').filter(Boolean).pop() || '', path, frame, locale };
    const call = saved
      ? api.patchProject(saved.id, body).then((r) => r.project)
      : api.createProject(body).then((r) => r.project);
    return call
      .then((p) => {
        if (!saved) setJustCreated(true);
        setSaved(p); onSaved(p);
        // The proposal is now what is on disk, so nothing is pending any more.
        setBaseline({ name: p.name, locale: p.locale ?? locale, frame: p.frame ?? '' });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(''));
  };

  const STEPS = [t.setup.stepFolder, t.setup.stepIdentity];

  /**
   * One refresh control, top right, and what it re-reads depends on the step you are on. It is the
   * same affordance either way — go back to the source and update what is on screen — so it is the
   * same button in the same place, and only the tooltip changes. Having a second copy of it inline
   * next to a section heading made one control look like two different features.
   */
  const refresh = step === 2 ? {
    busy: readingRepo,
    run: proposeFrame,
    title: readingRepo ? t.setup.refreshBusy : t.setup.refreshTitle,
  } : null;

  return (
    <dialog ref={ref} onCancel={onClose} onClose={onClose} className="wide">
      <div className="dialog-body">
        <div className="dialog-head">
          <h2>{saved ? t.setup.titleEdit(saved.name) : t.setup.titleNew}</h2>
          {/* Straight through, no confirmation: nothing is written until the step is confirmed,
              and «Discard changes» puts back what was there. */}
          {refresh && (
            <AiRefresh busy={refresh.busy} label={t.setup.refresh} title={refresh.title}
                       onClick={() => void refresh.run()} />
          )}
        </div>

        <nav className="steps" aria-label={t.setup.steps}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            return (
              <button key={n} type="button" className="step" aria-current={step === n}
                      disabled={!stepOpen(n)} onClick={() => setStep(n)}>
                <span className="step-n">{n}</span>{label}
              </button>
            );
          })}
        </nav>

        {justCreated && (
          <p className="created-note">{t.setup.created(saved?.name ?? '')}</p>
        )}

        {step === 1 && (
          <div className="field">
            <label htmlFor="ps-path">{t.projects.repoPath}</label>
            <input id="ps-path" value={path} spellCheck={false}
                   placeholder={t.projects.repoPathPlaceholder}
                   onChange={(e) => setPath(e.target.value)} />
            {checking && <p className="path-check checking">{t.setup.checking}</p>}
            {check && (
              <p className={`path-check${check.ok ? '' : ' bad'}`}>
                {!check.ok ? check.error
                  : !check.isProject ? t.setup.notAProject
                  : check.hasAgents ? t.projects.pathAgents(check.agentCount)
                  : t.projects.pathNoAgents}
              </p>
            )}
            {check?.isProject && !check.hasClaudeMd && (
              <p className="path-check checking">{t.setup.noClaudeMd}</p>
            )}
            <FolderPicker value={path} onPick={setPath} />
          </div>
        )}

        {step === 2 && (
          <>
            {/* While it reads, the fields hold nothing of yours and are about to be replaced.
                Editing them then would silently lose what you typed. */}
            {readingRepo && <p className="reading-note">{t.setup.readingRepo}</p>}

            {anyChanged && !readingRepo && (
              <p className="pending-note">
                {t.setup.pending}
                <button className="btn btn-sm btn-ghost" onClick={revert}>
                  {t.setup.discardChanges}
                </button>
              </p>
            )}

            <div className="field">
              <label htmlFor="ps-name">
                {t.common.name}
                {changed('name') && <span className="changed">{t.setup.changed}</span>}
              </label>
              <input id="ps-name" value={name} autoFocus disabled={readingRepo}
                     placeholder={path.split('/').filter(Boolean).pop() ?? ''}
                     onChange={(e) => setName(e.target.value)} />
              <p className="field-note">{t.setup.nameNote}</p>
            </div>

            <div className="field">
              <label htmlFor="ps-locale">
                {t.projects.agentLanguage}
                {changed('locale') && <span className="changed">{t.setup.changed}</span>}
              </label>
              <p className="field-note">{t.projects.agentLanguageNote}</p>
              <select id="ps-locale" value={locale} disabled={readingRepo}
                      onChange={(e) => setLocale(e.target.value as Locale)}>
                {AGENT_LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="ps-frame">
                {t.projects.frame}
                {changed('frame') && <span className="changed">{t.setup.changed}</span>}
              </label>
              <p className="field-note">{t.projects.frameNote}</p>
              {/* 6 rows: the budget is 300-400 characters, which wraps to ~4 lines here. */}
              <textarea id="ps-frame" value={frame} className="frame-box" rows={6}
                        disabled={readingRepo}
                        placeholder={t.projects.framePlaceholder}
                        onChange={(e) => setFrame(e.target.value)} />
            </div>
          </>
        )}

        {error && <p className="error-note">{error}</p>}
      </div>

      <div className="dialog-foot">
        {/* Back sits on the left, away from the primary action, and only appears when the previous
            step is actually reachable — on a new project step 1 has nowhere to go back to. */}
        {step > 1 && stepOpen(step - 1) && (
          <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
            {t.setup.back}
          </button>
        )}
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onClose}>{t.common.close}</button>
        {step === 1 && (
          <button className="btn btn-primary" disabled={!usable} onClick={() => setStep(2)}>
            {t.setup.next}
          </button>
        )}
        {step === 2 && (
          <>
            {saved && anyChanged && !readingRepo && (
              <button className="btn btn-ghost" onClick={revert}>{t.setup.discardChanges}</button>
            )}
            {/* The primary action is never dead: with nothing to save it closes. */}
            <button className="btn btn-primary"
                    onClick={() => (saved && !anyChanged ? onClose() : void saveIdentity())}
                    disabled={busy === 'save' || readingRepo || (!saved && !usable)}>
              {busy === 'save' ? t.common.saving
                : saved ? (anyChanged ? t.setup.saveChanges : t.setup.done)
                : t.setup.createAndGo}
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
