import { describe, it, expect } from 'vitest';
import {
  applyConsultationMessage, applyDocumentMessage, isDocumentMessage, type Consultation,
} from './useVoiceCall';

const T0 = 1_700_000_000_000;

describe('applyConsultationMessage', () => {
  it('вопрос заводит строку в ожидании', () => {
    const out = applyConsultationMessage(
      [],
      { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Шанкара' },
      T0,
    );
    expect(out).toEqual([
      { jobId: 'j1', specialist: 'Шанкара', status: 'pending', askedAt: T0 },
    ]);
  });

  it('ответ помечает ту же строку, а не заводит вторую', () => {
    const pending = applyConsultationMessage(
      [],
      { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Алексей' },
      T0,
    );
    const out = applyConsultationMessage(
      pending,
      { v: 1, type: 'specialist_answer', jobId: 'j1', specialist: 'Алексей', text: 'коротко' },
      T0 + 12_000,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ jobId: 'j1', status: 'answered', finishedAt: T0 + 12_000 });
  });

  it('строка НЕ исчезает после ответа — ради этого список и переделан', () => {
    const pending = applyConsultationMessage(
      [],
      { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Виталий' },
      T0,
    );
    const out = applyConsultationMessage(
      pending,
      { v: 1, type: 'specialist_answer', jobId: 'j1', specialist: 'Виталий', text: 'ответ' },
      T0 + 15_000,
    );
    // Утром 26.08 ответы стали приходить за 12–15 с, и исчезающая плашка
    // гасла раньше, чем её успевали прочитать.
    expect(out).toHaveLength(1);
  });

  it('таймаут специалиста виден как отдельный статус', () => {
    const pending = applyConsultationMessage(
      [],
      { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Анна' },
      T0,
    );
    const out = applyConsultationMessage(
      pending,
      { v: 1, type: 'specialist_failed', jobId: 'j1', specialist: 'Анна', reason: 'timeout' },
      T0 + 240_000,
    );
    expect(out[0].status).toBe('failed');
  });

  it('несколько специалистов держатся каждый своей строкой', () => {
    let list: Consultation[] = [];
    list = applyConsultationMessage(list, { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Александра' }, T0);
    list = applyConsultationMessage(list, { v: 1, type: 'specialist_pending', jobId: 'j2', specialist: 'Виталий' }, T0);
    list = applyConsultationMessage(list, { v: 1, type: 'specialist_answer', jobId: 'j2', specialist: 'Виталий', text: 'ok' }, T0 + 15_000);

    expect(list.map((c) => [c.specialist, c.status])).toEqual([
      ['Александра', 'pending'],
      ['Виталий', 'answered'],
    ]);
  });

  it('повторная доставка того же pending не удваивает строку', () => {
    const msg = { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Райя' } as const;
    const once = applyConsultationMessage([], msg, T0);
    const twice = applyConsultationMessage(once, msg, T0 + 500);
    expect(twice).toHaveLength(1);
    expect(twice[0].askedAt).toBe(T0);
  });

  it('ответ без потерянного pending всё равно виден', () => {
    // safeSend на бэкенде глотает сбой отправки specialist_pending: job при
    // этом работает и ответ придёт. Без этой ветки консультации не было бы
    // видно вовсе.
    const out = applyConsultationMessage(
      [],
      { v: 1, type: 'specialist_answer', jobId: 'j9', specialist: 'Оля', text: 'ответ' },
      T0,
    );
    expect(out).toEqual([
      { jobId: 'j9', specialist: 'Оля', status: 'answered', askedAt: T0, finishedAt: T0 },
    ]);
  });
});

describe('applyDocumentMessage', () => {
  const DOC = { v: 1 as const, docId: 'd1', title: 'План запуска' };

  it('заказанный документ появляется строкой «готовится»', () => {
    const out = applyDocumentMessage([], { ...DOC, type: 'document_pending' });
    expect(out).toEqual([{ docId: 'd1', title: 'План запуска', status: 'pending' }]);
  });

  it('готовый документ помечает ту же строку, а не заводит вторую', () => {
    const pending = applyDocumentMessage([], { ...DOC, type: 'document_pending' });
    const out = applyDocumentMessage(pending, { ...DOC, type: 'document_ready' });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('ready');
  });

  it('провал видно отдельным статусом', () => {
    const pending = applyDocumentMessage([], { ...DOC, type: 'document_pending' });
    const out = applyDocumentMessage(pending, { ...DOC, type: 'document_failed', reason: 'timeout' });
    expect(out[0].status).toBe('failed');
  });

  it('готовый без потерянного pending всё равно виден', () => {
    const out = applyDocumentMessage([], { ...DOC, type: 'document_ready' });
    expect(out).toEqual([{ docId: 'd1', title: 'План запуска', status: 'ready' }]);
  });

  it('документы и консультации не путаются между собой', () => {
    expect(isDocumentMessage({ ...DOC, type: 'document_pending' })).toBe(true);
    expect(isDocumentMessage({ v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Алексей' })).toBe(false);
  });
});

describe('расход токенов', () => {
  it('ответ приносит списанные токены в строку консультации', () => {
    const pending = applyConsultationMessage(
      [],
      { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Виталий' },
      T0,
    );
    const out = applyConsultationMessage(
      pending,
      { v: 1, type: 'specialist_answer', jobId: 'j1', specialist: 'Виталий', text: 'ответ', tokens: 3200 },
      T0 + 14_000,
    );
    expect(out[0].tokens).toBe(3200);
  });

  it('токены не теряются при повторном сообщении без них', () => {
    // Порядок доставки не гарантирован: строка уже могла получить цифру.
    let list = applyConsultationMessage([], { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Анна' }, T0);
    list = applyConsultationMessage(list, { v: 1, type: 'specialist_answer', jobId: 'j1', specialist: 'Анна', text: 'ok', tokens: 900 }, T0 + 1);
    list = applyConsultationMessage(list, { v: 1, type: 'specialist_answer', jobId: 'j1', specialist: 'Анна', text: 'ok' }, T0 + 2);
    expect(list[0].tokens).toBe(900);
  });

  it('готовый документ приносит свои токены', () => {
    const pending = applyDocumentMessage([], { v: 1, type: 'document_pending', docId: 'd1', title: 'План' });
    const out = applyDocumentMessage(pending, { v: 1, type: 'document_ready', docId: 'd1', title: 'План', tokens: 5400 });
    expect(out[0]).toMatchObject({ status: 'ready', tokens: 5400 });
  });

  it('у неотвеченной консультации токенов нет — списывать не за что', () => {
    const pending = applyConsultationMessage([], { v: 1, type: 'specialist_pending', jobId: 'j1', specialist: 'Оля' }, T0);
    const out = applyConsultationMessage(
      pending,
      { v: 1, type: 'specialist_failed', jobId: 'j1', specialist: 'Оля', reason: 'timeout' },
      T0 + 240_000,
    );
    expect(out[0].tokens).toBeUndefined();
  });
});
