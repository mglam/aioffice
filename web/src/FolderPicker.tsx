import { useEffect, useState } from 'react';
import { api } from './api';
import { useT } from './i18n';
import type { Browse } from './types';

/**
 * Folder picker.
 *
 * **Where you are standing is what is selected.** Navigating anywhere — into a folder or up out of
 * one — reports that folder as the choice, so the path in the header, the validation line the
 * caller renders and whether you can continue always describe the same directory.
 *
 * They used to be two things: clicking a row selected *and* entered, while `↑` only entered. Enter
 * a repo, go back up, and the selection stayed on the repo while the list showed its parent — so
 * the badge said "8 agents" and Next stayed enabled for a folder you were no longer looking at.
 *
 * Everything readable is listed; nothing is hidden. Greying and the `›` chevron say which rows are
 * worth entering, which is guidance for navigating rather than a rule about what can be chosen —
 * that judgement belongs to the caller, which validates whatever directory you land on.
 */
export function FolderPicker({ value, onPick }: {
  value: string;
  onPick: (path: string) => void;
}) {
  const t = useT();
  const [browse, setBrowse] = useState<Browse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const goTo = (path: string | undefined, select: boolean) => {
    setError(''); setLoading(true);
    void api.browse(path)
      .then((b) => {
        setBrowse(b);
        // Not on the first load: opening the picker should not preselect a directory nobody
        // asked for, and the caller would immediately validate it and complain.
        if (select) onPick(b.path);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  // Starts inside the current value when there is one, so configuring opens where the repo lives.
  useEffect(() => { goTo(value || undefined, false); /* on mount only */ }, []);   // eslint-disable-line

  if (error) return <p className="path-check bad">{error}</p>;
  if (!browse) return null;

  return (
    <div className="browser">
      <div className="browser-head">
        <button type="button" className="browser-up" disabled={!browse.parent}
                title={t.projects.browseUp} aria-label={t.projects.browseUp}
                onClick={() => goTo(browse.parent ?? undefined, true)}>↑</button>
        <span className="browser-path" title={browse.path}>{browse.path}</span>
        {value === browse.path && <span className="browser-here">{t.projects.browseHere}</span>}
      </div>

      <div className="browser-list">
        {loading && <p className="browser-empty">{t.setup.checking}</p>}
        {!loading && browse.entries.length === 0 && (
          <p className="browser-empty">{t.projects.browseEmpty}</p>
        )}
        {!loading && browse.entries.map((e) => (
          <button type="button" key={e.path}
                  className={`browser-row${e.selectable ? '' : ' dim'}`}
                  title={e.selectable ? e.path
                    : e.leadsTo ? t.projects.browseLeadsTo : t.projects.browseNoProject}
                  onClick={() => goTo(e.path, true)}>
            <span className="browser-name">{e.name}</span>
            {e.hasAgents && <span className="browser-badge">{t.projects.browseHasAgents}</span>}
            {e.hasClaudeMd && !e.hasAgents && <span className="browser-badge">CLAUDE.md</span>}
            {e.leadsTo && <span className="browser-lead" title={t.projects.browseAlsoBelow}>›</span>}
          </button>
        ))}
      </div>

      <p className="field-note">{t.projects.browseNote}</p>
    </div>
  );
}
