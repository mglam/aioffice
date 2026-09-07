import { useEffect, useRef, useState } from 'react';
import { useT } from './i18n';
import type { ParticipantDef } from './types';

/**
 * Seating someone in a conversation that is already going.
 *
 * A dialog rather than the row of ids it replaced: the id alone (`especialista-red`) says almost
 * nothing about who you are seating, and the thing you actually want to read — the first heading
 * of their persona, and where they came from — does not fit on a chip.
 *
 * Multi-select, because seating three people is one decision and three round trips is three
 * chances to change your mind halfway.
 */
export function SeatPicker({ available, open, onClose, onSeat }: {
  /** Everyone discovered for the project who is not already seated here. */
  available: ParticipantDef[];
  open: boolean;
  onClose: () => void;
  onSeat: (ids: string[]) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) { ref.current?.close(); return; }
    ref.current?.showModal();
    setPicked(new Set());
  }, [open]);

  /** Where a participant comes from, which is what says who may change them. */
  const origin = (d: ParticipantDef) =>
    d.builtin ? t.seatPicker.builtin
      : !d.pooled ? t.seatPicker.fromRepo
        : d.project ? t.seatPicker.forProject
          : t.seatPicker.global;

  return (
    <dialog ref={ref} onCancel={onClose} onClose={onClose} className="wide">
      <div className="dialog-body">
        <div className="dialog-head"><h2>{t.seatPicker.title}</h2></div>
        <p className="lede">{t.seatPicker.lede}</p>

        {available.length === 0 ? (
          <p className="field-note">{t.seats.everyone}</p>
        ) : (
          <div className="role-list">
            {available.map((d) => {
              const on = picked.has(d.id);
              return (
                <button key={d.id} type="button" className={`seat-card${on ? ' picked' : ''}`}
                        aria-pressed={on}
                        onClick={() => setPicked((prev) => {
                          const n = new Set(prev);
                          n.has(d.id) ? n.delete(d.id) : n.add(d.id);
                          return n;
                        })}>
                  <span className="seat-card-head">
                    {/* Their own heading first: it is written to read as an introduction. */}
                    <span className="seat-card-name">
                      {d.label !== d.id ? d.label : d.id}
                    </span>
                    <span className="role-fills">{origin(d)}</span>
                    {d.role && <span className="role-fills">{t.archetypes[d.role]?.label ?? d.role}</span>}
                  </span>
                  {d.description && <span className="seat-card-desc">{d.description}</span>}
                  <span className="seat-card-meta">
                    {d.id}
                    {d.model ? ` · ${d.model}` : ''}
                    {d.promptChars ? ` · ${t.seatPicker.chars(d.promptChars)}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="dialog-foot">
        <button className="btn btn-ghost" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn btn-primary" disabled={!picked.size}
                onClick={() => { onSeat([...picked]); onClose(); }}>
          {t.seatPicker.submit(picked.size)}
        </button>
      </div>
    </dialog>
  );
}
