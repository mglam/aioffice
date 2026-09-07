/**
 * Re-read something with a model and refresh what is on screen.
 *
 * Deliberately **not** disabled-looking while it works. The first version greyed itself out mid-run,
 * which is exactly when you want to find it — you lose the one element telling you something is
 * happening. Here it stays lit, spins, and reports `aria-busy`; it just does not accept a second
 * click.
 *
 * The cost lives in the tooltip rather than the label. It is the same number every time and
 * spelling it out turns a small control into a paragraph.
 */
export function AiRefresh({ busy, onClick, title, label }: {
  busy: boolean;
  onClick: () => void;
  /** What it will re-read, and what it costs. Shown on hover. */
  title: string;
  /** Short word beside the icon. Omit for icon-only. */
  label?: string;
}) {
  return (
    <button type="button" className={`ai-refresh${busy ? ' busy' : ''}`}
            onClick={() => { if (!busy) onClick(); }}
            aria-busy={busy} aria-disabled={busy} title={title}>
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="ai-refresh-ico">
        <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12.4 1.4v3.2H9.2" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label && <span>{label}</span>}
    </button>
  );
}
