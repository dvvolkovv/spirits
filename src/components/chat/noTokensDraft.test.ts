import { describe, it, expect } from 'vitest';
import { isNoTokensEnd, restoreIntoInput, collapseNoTokensStop, applyNoTokensOutcome } from './noTokensDraft';

describe('isNoTokensEnd', () => {
  it('true на событии end с reason no_tokens', () => {
    expect(isNoTokensEnd({ type: 'end', reason: 'no_tokens' })).toBe(true);
  });

  it('false на end без reason', () => {
    expect(isNoTokensEnd({ type: 'end' })).toBe(false);
  });

  it('false на end с другим reason (например preempted)', () => {
    expect(isNoTokensEnd({ type: 'end', reason: 'preempted' })).toBe(false);
  });

  it('false на другом типе события, даже если reason совпал', () => {
    expect(isNoTokensEnd({ type: 'item', reason: 'no_tokens' })).toBe(false);
  });

  it('false на null/undefined — разбор потока зовёт на каждой строке', () => {
    expect(isNoTokensEnd(null)).toBe(false);
    expect(isNoTokensEnd(undefined)).toBe(false);
  });
});

describe('restoreIntoInput', () => {
  it('пустое поле — просто отклонённый текст', () => {
    expect(restoreIntoInput('', 'привет')).toBe('привет');
  });

  it('поле из одних пробелов — тоже считается пустым', () => {
    expect(restoreIntoInput('   ', 'привет')).toBe('привет');
  });

  it('непустое поле — дописывает через пустую строку (как подстановка очереди)', () => {
    expect(restoreIntoInput('уже набрано', 'привет')).toBe('уже набрано\n\nпривет');
  });

  it('пустой rejected — поле не трогает', () => {
    expect(restoreIntoInput('уже набрано', '')).toBe('уже набрано');
  });

  it('rejected из одних пробелов — тоже не трогает поле', () => {
    expect(restoreIntoInput('уже набрано', '   ')).toBe('уже набрано');
  });

  it('оба пустые — результат пустая строка', () => {
    expect(restoreIntoInput('', '')).toBe('');
  });
});

// Минимальная форма сообщения ленты — ровно то, что нужно чистым функциям.
interface Msg {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  noTokensStop?: boolean;
}

const user = (id: string, content: string): Msg => ({ id, type: 'user', content });
const bot = (id: string, content: string, noTokensStop = false): Msg => ({
  id,
  type: 'assistant',
  content,
  ...(noTokensStop ? { noTokensStop: true } : {}),
});

describe('collapseNoTokensStop', () => {
  it('убирает пузырь по id и дописывает новое сообщение в конец', () => {
    const messages = [user('u1', 'привет'), bot('a1', 'было раньше')];
    const stop = bot('a2', 'на нуле, пополни баланс', true);
    expect(collapseNoTokensStop(messages, 'u1', stop)).toEqual([bot('a1', 'было раньше'), stop]);
  });

  it('id не встречается — ничего не убирает, просто дописывает (синтетический ход без пузыря, C1)', () => {
    const messages = [bot('a1', 'было раньше')];
    const stop = bot('a2', 'на нуле', true);
    expect(collapseNoTokensStop(messages, '', stop)).toEqual([bot('a1', 'было раньше'), stop]);
  });

  it('m1: предыдущее сообщение — ТАКАЯ ЖЕ остановка (noTokensStop) — заменяется, а не дублируется', () => {
    const prevStop = bot('a1', 'на нуле, пополни баланс', true);
    const messages = [user('u0', 'первое отклонённое'), prevStop];
    const newRejected = user('u1', 'второе отклонённое');
    const newStop = bot('a2', 'на нуле, пополни баланс', true);
    const result = collapseNoTokensStop([...messages, newRejected], 'u1', newStop);
    // prevStop заменена, не продублирована; второй пузырь тоже убран.
    expect(result).toEqual([user('u0', 'первое отклонённое'), newStop]);
  });

  it('предыдущее сообщение — ОБЫЧНЫЙ (успешный) ответ — не трогается, остаётся в ленте', () => {
    const successReply = bot('a1', 'обычный успешный ответ');
    const messages = [user('u0', 'первое'), successReply, user('u1', 'отклонённое')];
    const stop = bot('a2', 'на нуле', true);
    expect(collapseNoTokensStop(messages, 'u1', stop)).toEqual([user('u0', 'первое'), successReply, stop]);
  });

  it('пустая лента — просто дописывает', () => {
    const stop = bot('a1', 'на нуле', true);
    expect(collapseNoTokensStop([], 'u1', stop)).toEqual([stop]);
  });
});

describe('applyNoTokensOutcome — склейка отклонённого текста с очередью (повторное ревью 03.11)', () => {
  // C2 (повторное ревью 03.11, CRITICAL): функция больше не принимает
  // currentInput. Раньше ChatInterface звал её как
  // applyNoTokensOutcome({ rejectedText: userMessage, currentInput: input, ... })
  // внутри sendMessageToAI — а там userMessage и input — ОДНО и то же значение
  // (input из замыкания рендера, из которого ушла отправка, ещё не обнулён:
  // handleSendInner делает setInput('') ПОСЛЕ, а не до чтения). currentInput
  // внутри неизбежно совпадал с rejectedText, и restoreIntoInput склеивал текст
  // САМ С СОБОЙ («привет» → «привет\n\nпривет»). Слияние с ТЕКУЩИМ (а не
  // пойманным в замыкание) полем ввода теперь делает вызывающий сам —
  // setInput(prev => restoreIntoInput(prev, outcome.input)) с функциональным
  // апдейтом, который видит актуальное значение на момент применения.
  it('без очереди — отклонённый текст целиком, он же черновик', () => {
    const outcome = applyNoTokensOutcome({ rejectedText: 'моё сообщение', queuedText: '' });
    expect(outcome.input).toBe('моё сообщение');
    expect(outcome.draftText).toBe('моё сообщение');
  });

  it('m2: очередь, скопившаяся за время хода, возвращается ЦЕЛИКОМ вместе с отклонённым', () => {
    const outcome = applyNoTokensOutcome({
      rejectedText: 'первое отклонённое',
      queuedText: 'второе из очереди\n\nтретье из очереди',
    });
    expect(outcome.input).toBe('первое отклонённое\n\nвторое из очереди\n\nтретье из очереди');
    // m2: черновик — из ВСЕГО поля (а не только из отклонённого куска) —
    // при перезагрузке должно вернуться всё, а не часть.
    expect(outcome.draftText).toBe(outcome.input);
  });

  it('очередь пустая (только пробелы) — не добавляет лишних переносов строк', () => {
    const outcome = applyNoTokensOutcome({ rejectedText: 'отклонённое', queuedText: '   ' });
    expect(outcome.input).toBe('отклонённое');
  });

  it('draftText всегда равен input — вызывающий сам решает, помещается ли он в хранилище (m5)', () => {
    const longText = 'я'.repeat(3000);
    const outcome = applyNoTokensOutcome({ rejectedText: longText, queuedText: '' });
    expect(outcome.draftText).toBe(outcome.input);
    expect(outcome.draftText.length).toBeGreaterThan(2000);
  });
});
