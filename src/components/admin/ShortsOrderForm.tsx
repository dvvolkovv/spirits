import React, { useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { AgentOption } from './shortsApi';
import {
  ANGLES, ANGLE_TITLES, MAX_ORDER_CHARS, MIN_ORDER_CHARS, RUBRICS, RUBRIC_TITLES, ShortAngle, ShortRubric, orderChars,
} from './shortStatus';

interface Props {
  agents: AgentOption[];
  busy: boolean;
  /**
   * true — заказ записан, поле можно чистить.
   * false — отказ или «такой ролик уже заказан»: текст остаётся (дубль дорогой —
   * бэк проверяет его SELECT-then-INSERT без уникального индекса).
   */
  onOrder: (payload: Record<string, unknown>) => Promise<boolean>;
  onRefill: () => void;
}

const toRubric = (v: string): ShortRubric => (RUBRICS.includes(v as ShortRubric) ? (v as ShortRubric) : 'assistant');
const toAngle = (v: string): ShortAngle | '' => (ANGLES.includes(v as ShortAngle) ? (v as ShortAngle) : '');

const FIELD = 'border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500';

/**
 * Заказ ролика — как «Своя тема» у постов: тема одной строкой или история
 * реального кейса, рубрика, подача (по умолчанию — ритм недели) и ассистент
 * (по умолчанию — любой). Ложится идеей; запустить сразу — «Запустить сейчас»
 * в её строке.
 */
const ShortsOrderForm: React.FC<Props> = ({ agents, busy, onOrder, onRefill }) => {
  const [topic, setTopic] = useState('');
  // История — своё поле: однострочный input вырезает переносы, и при смене
  // рубрики абзацы истории склеились бы молча (как у реального кейса блога).
  const [story, setStory] = useState('');
  const [rubric, setRubric] = useState<ShortRubric>('assistant');
  const [angle, setAngle] = useState<ShortAngle | ''>('');
  const [assistantId, setAssistantId] = useState('');
  const isCase = rubric === 'case';
  const text = isCase ? story : topic;
  const n = orderChars(text);
  const ok = n >= MIN_ORDER_CHARS && n <= MAX_ORDER_CHARS;
  const tooLong = n > MAX_ORDER_CHARS;
  /**
   * Замок от двойного нажатия. `busy` у родителя гасит кнопку только с
   * перерисовкой — нажатие, успевшее раньше неё (двойной клик в один тик),
   * его не видит. Дубль-заказ не бесплатен: бэк проверяет его
   * SELECT-then-INSERT без уникального индекса.
   */
  const inFlight = useRef(false);

  const submit = async () => {
    if (!ok || busy || inFlight.current) return;
    inFlight.current = true;
    try {
      const sent = text;
      const payload: Record<string, unknown> = { action: 'order', topic: sent.trim(), rubric };
      if (angle) payload.angle = angle;
      if (assistantId) payload.assistantId = Number(assistantId);
      // Пока шёл запрос, поле редактируемо: стираем, только если текст не меняли.
      const clear = (cur: string) => (cur === sent ? '' : cur);
      if (await onOrder(payload)) (isCase ? setStory : setTopic)(clear);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div data-testid="shorts-order" className="mb-4 bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="text-sm font-medium text-gray-700">Заказать ролик</div>
      {isCase ? (
        <div>
          <textarea
            data-testid="shorts-order-story"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={5}
            placeholder="История: кто, что случилось, что сделал ассистент, чем кончилось — без имён, организаций и сумм"
            aria-label="История реального кейса"
            aria-invalid={tooLong}
            className="ym-disable-keys w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
          />
          <div
            data-testid="shorts-order-count"
            className={clsx('text-xs text-right', tooLong ? 'text-red-600' : 'text-gray-500')}
          >
            {n} / {MAX_ORDER_CHARS}
          </div>
        </div>
      ) : (
        <input
          data-testid="shorts-order-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Тема ролика одной строкой"
          aria-label="Тема ролика"
          aria-invalid={tooLong}
          className={clsx('ym-disable-keys', FIELD, 'w-full')}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <select
          data-testid="shorts-order-rubric"
          value={rubric}
          aria-label="Рубрика"
          onChange={(e) => {
            const next = toRubric(e.target.value);
            // Переносим тему в историю, а не копируем: копия осталась бы и в
            // однострочном поле и могла бы уйти вторым, уже выдуманным заказом
            // (тот же приём и по той же причине — у рубрики блога, см. AdminBlogView).
            // Назад не переносим: однострочное поле срезало бы переносы строк.
            if (next === 'case' && !story.trim() && topic.trim()) {
              setStory(topic);
              setTopic('');
            }
            setRubric(next);
          }}
          className={clsx(FIELD, 'bg-white')}
        >
          {RUBRICS.map((r) => (
            <option key={r} value={r}>{RUBRIC_TITLES[r]}</option>
          ))}
        </select>
        <select
          data-testid="shorts-order-angle"
          value={angle}
          aria-label="Подача"
          onChange={(e) => setAngle(toAngle(e.target.value))}
          className={clsx(FIELD, 'bg-white')}
        >
          <option value="">По ритму недели</option>
          {ANGLES.map((a) => (
            <option key={a} value={a}>{ANGLE_TITLES[a]}</option>
          ))}
        </select>
        <select
          data-testid="shorts-order-assistant"
          value={assistantId}
          aria-label="Ассистент"
          onChange={(e) => setAssistantId(e.target.value)}
          className={clsx(FIELD, 'bg-white')}
        >
          <option value="">Любой ассистент</option>
          {agents.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.displayName}</option>
          ))}
        </select>
        <button
          type="button"
          data-testid="shorts-order-submit"
          onClick={submit}
          disabled={busy || !ok}
          className="px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 disabled:opacity-50"
        >
          Заказать
        </button>
        <button
          type="button"
          data-testid="shorts-refill"
          onClick={onRefill}
          disabled={busy}
          title="Каталог тем на неделю сейчас, не дожидаясь воскресенья"
          className="ml-auto px-3 py-2 bg-white text-gray-600 text-sm rounded-md border border-gray-200 hover:border-forest-300 disabled:opacity-50"
        >
          Пополнить темы недели
        </button>
      </div>
      {n > 0 && n < MIN_ORDER_CHARS && (
        <div className="text-xs text-gray-500">{isCase ? 'История' : 'Тема'} — от {MIN_ORDER_CHARS} знаков.</div>
      )}
      {!isCase && tooLong && (
        <div className="text-xs text-red-600">Тема — не длиннее {MAX_ORDER_CHARS} знаков.</div>
      )}
    </div>
  );
};

export default ShortsOrderForm;
