import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import type { AskBlock, AskQuestion } from '../../utils/askBlock';
import { buildAskAnswer, emptyPicks, isAskComplete, parseAskAnswer, type AskPick } from './askAnswer';

// Карточка уточняющего вопроса ассистента (блок ```ask, см. utils/askBlock.ts).
// Ответ уходит обычным сообщением пользователя — модель видит его как ответ
// на свой вопрос, а в истории он читается и без карточки.

/**
 * active — последний вопрос, ход не идёт: можно отвечать.
 * answered — после карточки уже есть сообщение пользователя.
 * disabled — идёт ход или карточка не последняя.
 */
export type AskMode = 'active' | 'answered' | 'disabled';

interface AskCardProps {
  questions: AskQuestion[];
  mode: AskMode;
  /** Для answered — следующее сообщение пользователя: по нему подсветка. */
  answerText?: string;
  onSubmit: (text: string) => void;
}

export function AskCard({ questions, mode, answerText, onSubmit }: AskCardProps) {
  const { t } = useTranslation();
  const [picks, setPicks] = useState<AskPick[]>(() => emptyPicks(questions.length));
  const [customOpen, setCustomOpen] = useState<boolean[]>(() => questions.map(() => false));
  // Отправили — карточка гаснет сразу, не дожидаясь ответа в ленте.
  const [sent, setSent] = useState(false);

  const live = mode === 'active' && !sent;
  // Один вопрос с одиночным выбором уходит по нажатию на вариант; «Ответить»
  // нужна только для своего варианта.
  const quick = questions.length === 1 && !questions[0].multi;
  const shown: string[][] = mode === 'answered' && !sent
    ? parseAskAnswer(questions, answerText ?? '')
    : picks.map((p) => p.selected);

  const send = (next: AskPick[]) => {
    if (!live || !isAskComplete(questions, next)) return;
    setSent(true);
    onSubmit(buildAskAnswer(questions, next));
  };

  const toggle = (qi: number, option: string) => {
    if (!live) return;
    const q = questions[qi];
    const next = picks.map((p, i) => {
      if (i !== qi) return p;
      if (!q.multi) return { selected: [option], custom: '' };
      const on = p.selected.includes(option);
      return { ...p, selected: on ? p.selected.filter((o) => o !== option) : [...p.selected, option] };
    });
    if (!q.multi) setCustomOpen((c) => c.map((v, i) => (i === qi ? false : v)));
    setPicks(next);
    if (quick) send(next);
  };

  const setCustom = (qi: number, value: string) =>
    setPicks((prev) => prev.map((p, i) =>
      i === qi ? { selected: questions[qi].multi ? p.selected : [], custom: value } : p));

  const showSubmit = live && (!quick || customOpen[0]);

  return (
    <div className="not-prose my-2 rounded-xl border border-forest-200 bg-forest-50/40 p-3 space-y-3">
      {questions.map((q, qi) => (
        <div key={qi} role="group" aria-label={q.question}>
          <p className="text-sm font-medium text-gray-800 mb-1.5">{q.question}</p>
          {q.multi && live && <p className="text-xs text-gray-400 -mt-1 mb-1.5">{t('chat.ask.multi_hint')}</p>}
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => {
              const on = !!shown[qi]?.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  disabled={!live}
                  aria-pressed={on}
                  onClick={() => toggle(qi, o)}
                  className={clsx(
                    'text-sm rounded-full px-3 py-1.5 border transition-colors text-left',
                    on ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-forest-700 border-forest-300',
                    live ? !on && 'hover:border-forest-400 hover:bg-forest-50' : 'opacity-60 cursor-default',
                  )}
                >
                  {o}
                </button>
              );
            })}
            {live && (
              <button
                type="button"
                aria-pressed={customOpen[qi]}
                onClick={() => setCustomOpen((c) => c.map((v, i) => (i === qi ? !v : v)))}
                className={clsx(
                  'text-sm rounded-full px-3 py-1.5 border border-dashed bg-white transition-colors',
                  customOpen[qi] ? 'border-forest-500 text-forest-700' : 'border-forest-300 text-forest-600 hover:bg-forest-50',
                )}
              >
                {t('chat.ask.custom')}
              </button>
            )}
          </div>
          {live && customOpen[qi] && (
            <input
              type="text"
              value={picks[qi].custom}
              onChange={(e) => setCustom(qi, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(picks); }}
              placeholder={t('chat.ask.custom_placeholder')}
              aria-label={t('chat.ask.custom_placeholder')}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              autoFocus
            />
          )}
        </div>
      ))}
      {showSubmit && (
        <button
          type="button"
          disabled={!isAskComplete(questions, picks)}
          onClick={() => send(picks)}
          className="text-sm font-medium rounded-lg px-4 py-1.5 bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('chat.ask.submit')}
        </button>
      )}
    </div>
  );
}

/** Маркер `__ASK_n__` в ленте: карточка, заглушка или текст вместо битого блока. */
export function AskBlockView({ block, mode, answerText, onSubmit, components }: {
  block: AskBlock;
  mode: AskMode;
  answerText?: string;
  onSubmit: (text: string) => void;
  components: any;
}) {
  const { t } = useTranslation();
  if (block.kind === 'pending') {
    return <p className="text-xs text-gray-400 italic my-2">{t('chat.ask.preparing')}</p>;
  }
  if (block.kind === 'fallback') {
    return block.text
      ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{block.text}</ReactMarkdown>
      : null;
  }
  return <AskCard questions={block.questions} mode={mode} answerText={answerText} onSubmit={onSubmit} />;
}
