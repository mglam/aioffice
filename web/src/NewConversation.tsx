import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useT } from './i18n';
import type { ArtifactType, ArtifactTypeInfo, ParticipantDef } from './types';

/**
 * One topic, and everything specific to it: the question, the deliverables, who sits, and
 * whether it is open or chaired.
 *
 * Who sits used to be inherited from a roundtable — a standing group you configured once. That
 * layer is gone, so the picker lives here. What is kept from the convenience is the default:
 * whoever was in the project's most recent conversation, which is nearly always who you want
 * again.
 */
export function NewConversation({
  projectId, projectName, previous, open, onClose, onCreated,
}: {
  projectId: string;
  projectName: string;
  /** Seats from the project's last conversation, used as the default. */
  previous?: string[];
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [artTypes, setArtTypes] = useState<ArtifactTypeInfo[]>([]);
  const [defs, setDefs] = useState<ParticipantDef[]>([]);
  const [seats, setSeats] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [brief, setBrief] = useState('');
  const [deliverables, setDeliverables] = useState<Set<ArtifactType>>(new Set(['decisions']));
  const [orchestrator, setOrchestrator] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) { ref.current?.close(); return; }
    ref.current?.showModal();
    setSeats(new Set(previous ?? []));
    setError('');
    void api.artifactTypes().then((r) => setArtTypes(r.types)).catch(() => {});
    void api.participants(projectId).then((r) => setDefs(r.participants)).catch(() => {});
  }, [open, projectId, previous]);

  const seated = [...seats];
  // A chair who is no longer seated would silently make the conversation open, so the select
  // follows the picker rather than the other way round.
  const chair = seats.has(orchestrator) ? orchestrator : '';

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      const { conversation } = await api.createConversation(projectId, {
        title, question, brief,
        participantIds: seated,
        deliverables: [...deliverables],
        orchestrator: chair || undefined,
      });
      onCreated(conversation.id);
      setTitle(''); setQuestion(''); setBrief(''); setOrchestrator('');
      setDeliverables(new Set(['decisions']));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <dialog ref={ref} onCancel={onClose} onClose={onClose}>
      <div className="dialog-body">
        <h2>{t.newConversation.title}</h2>
        <p className="lede">{t.newConversation.lede(projectName)}</p>

        <div className="field">
          <label htmlFor="nc-title">{t.newConversation.topic}</label>
          <input id="nc-title" value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder={t.newConversation.topicPlaceholder} autoFocus />
        </div>

        <div className="field">
          <label htmlFor="nc-q">{t.newConversation.question}</label>
          <input id="nc-q" value={question} onChange={(e) => setQuestion(e.target.value)}
                 placeholder={t.newConversation.questionPlaceholder} />
          <p className="field-note">{t.newConversation.questionNote}</p>
        </div>

        <div className="field">
          <label>{t.newConversation.who}</label>
          {defs.length === 0 ? (
            <p className="field-note">{t.newConversation.noParticipants}</p>
          ) : (
            <div className="floor-picker">
              {defs.map((d) => (
                <button key={d.id} type="button" className="chip chip-plain"
                        aria-pressed={seats.has(d.id)}
                        title={d.label !== d.id ? d.label : d.description}
                        onClick={() => setSeats((prev) => {
                          const n = new Set(prev);
                          n.has(d.id) ? n.delete(d.id) : n.add(d.id);
                          return n;
                        })}>
                  {d.id}{d.builtin ? t.newConversation.base : ''}
                </button>
              ))}
            </div>
          )}
          <p className="field-note">{t.newConversation.whoNote}</p>
        </div>

        <div className="field">
          <label htmlFor="nc-brief">{t.newConversation.context}</label>
          <textarea id="nc-brief" value={brief} onChange={(e) => setBrief(e.target.value)}
                    placeholder={t.newConversation.contextPlaceholder} />
        </div>

        <div className="field">
          <label>{t.newConversation.deliverables}</label>
          <div className="floor-picker">
            {artTypes.map((a) => {
              const info = t.deliverables.types[a.type];
              return (
                <button key={a.type} type="button" className="chip chip-plain"
                        aria-pressed={deliverables.has(a.type)} title={info.note}
                        onClick={() => setDeliverables((prev) => {
                          const n = new Set(prev);
                          n.has(a.type) ? n.delete(a.type) : n.add(a.type);
                          return n;
                        })}>
                  {info.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>{t.newConversation.how}</label>
          <div className="floor-picker">
            <button type="button" className="chip chip-plain" aria-pressed={!chair}
                    onClick={() => setOrchestrator('')}
                    title={t.newConversation.openModeTitle}>
              {t.newConversation.openMode}
            </button>
            <button type="button" className="chip chip-plain" aria-pressed={!!chair}
                    disabled={seated.length < 2}
                    onClick={() => setOrchestrator(chair || seated[0] || '')}
                    title={t.newConversation.chairedModeTitle}>
              {t.newConversation.chairedMode}
            </button>
            {chair && (
              <select className="orq-select" value={chair}
                      aria-label={t.newConversation.chairSelectLabel}
                      onChange={(e) => setOrchestrator(e.target.value)}>
                {seated.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            )}
          </div>
          <p className="field-note">
            {chair ? t.newConversation.chairedNote(chair) : t.newConversation.openNote}
          </p>
        </div>

        {error && <p className="error-note">{error}</p>}
      </div>

      <div className="dialog-foot">
        <button className="btn btn-ghost" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn btn-primary" onClick={submit}
                disabled={busy || !title.trim() || !seats.size || deliverables.size === 0}>
          {busy ? t.common.opening : t.newConversation.submit}
        </button>
      </div>
    </dialog>
  );
}
