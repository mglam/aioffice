import { useEffect, useState } from 'react';
import { api } from './api';
import { useT } from './i18n';
import { Markdown } from './markdown';
import type { ArtifactRef } from './types';

/**
 * Documents are read here before anything touches the repo. Publishing is an explicit
 * act: until you press it, the deliverable lives only inside the app.
 */
export function DocViewer({ projectId, convId, artifactId, projectPath, onClose, onChanged }: {
  projectId: string;
  convId: string;
  artifactId: string;
  projectPath: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<ArtifactRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMarkdown(null); setError('');
    void api.artifactContent(projectId, convId, artifactId)
      .then((r) => { setMarkdown(r.markdown); setArtifact(r.artifact); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [projectId, convId, artifactId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (fn: () => Promise<unknown>, close = false) => {
    setBusy(true); setError('');
    try { await fn(); onChanged(); if (close) onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const published = artifact?.publishedPath;
  const where = published?.replace(projectPath, '').replace(/^\//, '');

  /**
   * Saves the markdown as it stands. A draft lives only inside the app until it is published, so
   * this is the one way to get it out without writing into the repo — which is the point of
   * publishing being a separate, deliberate act.
   */
  const download = () => {
    if (markdown === null) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact?.file ?? 'document.md';
    a.click();
    // Revoked on the next tick: released synchronously, the click may not have read it yet.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="doc-overlay" onClick={onClose}>
      <div className="doc" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="doc-head">
          <div>
            <span className="doc-file">{artifact?.file ?? '…'}</span>
            <span className="doc-where">
              {published ? t.doc.publishedAt(where ?? '') : t.doc.draftNote}
              {artifact?.openBlocks ? t.doc.writtenWithBlockers(artifact.openBlocks) : ''}
            </span>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label={t.common.close}>
            {t.common.close}
          </button>
        </header>

        <div className="doc-body">
          {error && <p className="error-note">{error}</p>}
          {markdown === null && !error
            ? <p className="doc-loading">{t.common.opening}</p>
            : <div className="speech">{markdown && <Markdown text={markdown} />}</div>}
        </div>

        <footer className="doc-foot">
          <button className="btn btn-sm" disabled={busy || markdown === null}
                  onClick={() => void navigator.clipboard.writeText(markdown ?? '')}>
            {t.common.copy}
          </button>
          <button className="btn btn-sm" disabled={busy || markdown === null}
                  onClick={download} title={t.doc.downloadTitle}>
            {t.doc.download}
          </button>
          <span className="spacer" />
          <button className="btn btn-sm btn-danger" disabled={busy}
                  onClick={() => act(
                    () => api.discardArtifact(projectId, convId, artifactId), true)}
                  title={published ? t.doc.discardPublished : t.doc.discardDraft}>
            {t.doc.discard}
          </button>
          <button className="btn btn-sm btn-primary" disabled={busy || !!published}
                  onClick={() => act(() => api.publishArtifact(projectId, convId, artifactId))}
                  title={published
                    ? t.doc.alreadyPublishedTitle
                    : t.doc.publishTitle(projectPath)}>
            {published ? t.doc.alreadyPublished : busy ? t.doc.publishing : t.doc.publish}
          </button>
        </footer>
      </div>
    </div>
  );
}
