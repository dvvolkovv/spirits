import { describe, it, expect } from 'vitest';
import { applyConsultationMessage, type Consultation } from './useVoiceCall';

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
