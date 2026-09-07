import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useT } from './i18n';
import type { Project, ProjectStats } from './types';

/**
 * The project list: open one, set one up, delete one.
 *
 * Setting up and configuring both live in `ProjectSetup`, so this component holds no form.
 * Deleting stays here on purpose — it cascades and it is double-confirmed, which does not belong
 * next to configuration.
 */
export function Projects({ open, onClose, onChanged, onSetup, activeId }: {
  open: boolean;
  onClose: () => void;
  onChanged: (projects: Project[], deletedId?: string) => void;
  /** null = create a new one. */
  onSetup: (project: Project | null) => void;
  activeId: string | null;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [doomed, setDoomed] = useState<{ p: Project; stats: ProjectStats } | null>(null);
  const [typed, setTyped] = useState('');

  const refresh = async () => {
    const r = await api.projects();
    setProjects(r.projects);
    return r.projects;
  };

  useEffect(() => {
    if (!open) { ref.current?.close(); return; }
    ref.current?.showModal();
    setDoomed(null); setError('');
    void refresh();
  }, [open]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError('');
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  };

  const askDelete = (p: Project) => act('stats', async () => {
    setTyped('');
    setDoomed({ p, stats: await api.projectStats(p.id) });
  });

  const confirmDelete = () => act('delete', async () => {
    if (!doomed) return;
    await api.deleteProject(doomed.p.id);
    const left = await refresh();
    onChanged(left, doomed.p.id);
    setDoomed(null);
  });

  // ── Second confirmation: the one that says it is not recoverable ──────────
  if (doomed) {
    const { p, stats } = doomed;
    return (
      <dialog ref={ref} onCancel={() => setDoomed(null)}>
        <div className="dialog-body">
          <h2>{t.projects.deleteTitle(p.name)}</h2>
          <p className="lede">{t.projects.deleteLede}</p>
          <ul className="doom-list">
            <li>{t.projects.doomConversations(stats.conversations)}</li>
            <li>{t.projects.doomArtifacts(stats.artifacts)}</li>
          </ul>
          <p className="doom-warn"><b>{t.projects.doomWarn}</b></p>
          <p className="lede">{t.projects.doomKept(p.path.split('/').pop() ?? '')}</p>
          <div className="field">
            <label htmlFor="doom">{t.projects.doomType(p.name)}</label>
            <input id="doom" value={typed} autoFocus autoComplete="off"
                   onChange={(e) => setTyped(e.target.value)} />
          </div>
          {error && <p className="error-note">{error}</p>}
        </div>
        <div className="dialog-foot">
          <button className="btn btn-ghost" onClick={() => setDoomed(null)}>
            {t.common.cancel}
          </button>
          <button className="btn btn-sm btn-danger" onClick={confirmDelete}
                  disabled={typed !== p.name || busy === 'delete'}>
            {busy === 'delete' ? t.common.deleting : t.projects.doomConfirm}
          </button>
        </div>
      </dialog>
    );
  }

  return (
    <dialog ref={ref} onCancel={onClose} onClose={onClose}>
      <div className="dialog-body">
        <h2>{t.projects.title}</h2>
        <p className="lede">{t.projects.lede}</p>

        {projects.length === 0 && (
          <p className="board-empty" style={{ padding: '0 0 12px' }}>{t.projects.none}</p>
        )}

        {projects.map((p) => (
          <div className="proj-row" key={p.id}>
            <div className="proj-main">
              <span className="proj-name">
                {p.name}
                {p.id === activeId && <span className="proj-active">{t.projects.active}</span>}
              </span>
              <span className="proj-path">{p.path}</span>
              <span className="proj-meta">
                {p.agentCount ? t.projects.agents(p.agentCount) : t.projects.noAgents}
                {' · '}
                {p.frame ? t.projects.withFrame : t.projects.noFrame}
                {' · '}
                {(p.locale ?? 'en').toUpperCase()}
              </span>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => onSetup(p)}>
              {t.projects.setUp}
            </button>
            <button className="btn btn-sm btn-danger" onClick={() => askDelete(p)}
                    disabled={busy === 'stats'}>
              {t.common.delete}
            </button>
          </div>
        ))}

        {error && <p className="error-note">{error}</p>}
      </div>

      <div className="dialog-foot">
        <button className="btn btn-ghost" onClick={onClose}>{t.common.close}</button>
        <button className="btn btn-primary" onClick={() => onSetup(null)}>
          {t.projects.add}
        </button>
      </div>
    </dialog>
  );
}
