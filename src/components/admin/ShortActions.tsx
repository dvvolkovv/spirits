import React, { useState } from 'react';
import { ActionExtra, MAX_NOTE_CHARS, ShortAction, ShortDetail, actionsFor, isTelegramPostUrl, noteChars } from './shortStatus';

interface Props {
  detail: ShortDetail;
  busy: boolean;
  onAction: (kind: ShortAction, extra?: ActionExtra) => void;
}

const BTN = 'px-3 py-1 text-xs rounded disabled:opacity-50';
const PRIMARY = `${BTN} bg-forest-600 text-white hover:bg-forest-700`;
const SECONDARY = `${BTN} bg-gray-100 hover:bg-gray-200`;
const DANGER = `${BTN} bg-rose-50 text-rose-700 hover:bg-rose-100`;
const FIELD = 'flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-forest-500';

/** Кнопки раскрытого ролика — по статусу (actionsFor), с полями замечания и ссылки на пост. */
const ShortActions: React.FC<Props> = ({ detail, busy, onAction }) => {
  const [note, setNote] = useState('');
  const [retryNote, setRetryNote] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const actions = actionsFor(detail);
  if (!actions.length) return null;
  const has = (a: ShortAction) => actions.includes(a);
  const noteLen = noteChars(note);
  // У упавшей публикации повтор только отправляет заново — замечание сценаристу ни к чему.
  const retryWithNote = detail.failedFrom !== 'publishing' && (has('retry') || has('retry_directing') || has('retry_writing'));
  const retryExtra = { note: retryNote };

  return (
    <div data-testid={`short-actions-${detail.id}`} className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {has('approve') && (
          <button type="button" data-testid="short-approve" onClick={() => onAction('approve')} disabled={busy} className={PRIMARY}>
            Одобрить
          </button>
        )}
        {has('publish_now') && (
          <button type="button" data-testid="short-publish-now" onClick={() => onAction('publish_now')} disabled={busy} className={PRIMARY}>
            Опубликовать сейчас
          </button>
        )}
        {has('retry') && (
          <button type="button" data-testid="short-retry" onClick={() => onAction('retry', retryExtra)} disabled={busy} className={PRIMARY}>
            Повторить
          </button>
        )}
        {has('retry_directing') && (
          <button type="button" data-testid="short-retry-directing" onClick={() => onAction('retry_directing', retryExtra)}
            disabled={busy} className={SECONDARY}>
            Новая сцена
          </button>
        )}
        {has('retry_writing') && (
          <button type="button" data-testid="short-retry-writing" onClick={() => onAction('retry_writing', retryExtra)}
            disabled={busy} className={SECONDARY}>
            Новый текст
          </button>
        )}
        {has('redo') && (
          <button type="button" data-testid="short-redo" onClick={() => onAction('redo')} disabled={busy} className={SECONDARY}>
            Переснять
          </button>
        )}
        {has('reject') && (
          <button type="button" data-testid="short-reject" onClick={() => onAction('reject')} disabled={busy} className={DANGER}>
            Отклонить
          </button>
        )}
      </div>

      {has('note') && (
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea data-testid="short-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="Что поправить в ролике — уйдёт сценаристу" aria-label="Замечание к ролику" className={FIELD} />
          <button type="button" data-testid="short-send-note" onClick={() => onAction('note', { text: note })}
            disabled={busy || noteLen === 0 || noteLen > MAX_NOTE_CHARS} className={`${SECONDARY} self-start`}>
            Отправить замечание
          </button>
        </div>
      )}
      {noteLen > MAX_NOTE_CHARS && <div className="text-xs text-rose-600">Замечание длиннее {MAX_NOTE_CHARS} знаков.</div>}

      {retryWithNote && (
        <input data-testid="short-retry-note" value={retryNote} onChange={(e) => setRetryNote(e.target.value)}
          placeholder="Замечание к повтору — необязательно" aria-label="Замечание к повтору" className={`${FIELD} w-full`} />
      )}

      {has('mark_published') && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input data-testid="short-post-url" value={postUrl} onChange={(e) => setPostUrl(e.target.value)}
            placeholder="https://t.me/ainomira/123 — если пост всё-таки вышел" aria-label="Ссылка на вышедший пост" className={FIELD} />
          <button type="button" data-testid="short-mark-published" onClick={() => onAction('mark_published', { url: postUrl })}
            disabled={busy || !isTelegramPostUrl(postUrl)} className={`${SECONDARY} self-start`}>
            Пост вышел
          </button>
        </div>
      )}
    </div>
  );
};

export default ShortActions;
