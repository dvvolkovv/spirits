import { describe, it, expect } from 'vitest';
import { attachmentTurnText, selectNewPolledMessages, stripAttachmentLines } from './historyMerge';

const T0 = new Date('2026-08-16T10:00:00.000Z');
const T1 = new Date('2026-08-16T10:00:30.000Z');
// Бэк сохраняет пару в БД уже после того, как стрим дочитан на клиенте, —
// поэтому у копии из истории время ВСЕГДА позже локального сообщения.
const T2 = '2026-08-16T10:00:30.400Z';
const T3 = '2026-08-16T10:00:30.500Z';

describe('selectNewPolledMessages', () => {
  it('не тащит копию хода с файлами: у локального пузыря и у записи в БД разное написание вложений', () => {
    const local = [
      { id: 'loc-1', type: 'user', content: '📎 a.pdf\n📎 b.pdf\n\nСделай саммари', timestamp: T0 },
      { id: 'loc-2', type: 'assistant', content: 'Готово, вот саммари', timestamp: T1 },
    ];
    const polled = [
      { id: '9001', type: 'user', content: '📎 a.pdf, b.pdf\nСделай саммари', timestamp: T2 },
      { id: '9002', type: 'assistant', content: 'Готово, вот саммари', timestamp: T3 },
    ];

    expect(selectNewPolledMessages(local, polled)).toEqual([]);
  });

  it('не тащит копию обычного хода — тексты совпадают точно', () => {
    const local = [
      { id: 'loc-1', type: 'user', content: 'Привет', timestamp: T0 },
      { id: 'loc-2', type: 'assistant', content: 'Привет!', timestamp: T1 },
    ];
    const polled = [
      { id: '9001', type: 'user', content: 'Привет', timestamp: T2 },
      { id: '9002', type: 'assistant', content: 'Привет!', timestamp: T3 },
    ];

    expect(selectNewPolledMessages(local, polled)).toEqual([]);
  });

  it('отдаёт то, что дописали снаружи — ответ, дошедший в БД, пока вкладка ждала', () => {
    const local = [{ id: 'loc-1', type: 'user', content: 'Как дела?', timestamp: T0 }];
    const polled = [{ id: '9002', type: 'assistant', content: 'Всё хорошо', timestamp: T2 }];

    expect(selectNewPolledMessages(local, polled)).toEqual(polled);
  });

  it('роль различается: чужой ответ с текстом моего вопроса не считается дублем', () => {
    const local = [{ id: 'loc-1', type: 'user', content: 'Сделай саммари', timestamp: T0 }];
    const polled = [{ id: '9002', type: 'assistant', content: 'Сделай саммари', timestamp: T2 }];

    expect(selectNewPolledMessages(local, polled)).toEqual(polled);
  });

  it('старее последнего локального — уже показано, не дублируем', () => {
    const local = [{ id: 'loc-2', type: 'assistant', content: 'Готово', timestamp: T1 }];
    const polled = [{ id: '9000', type: 'user', content: 'Что-то давнее', timestamp: '2026-08-16T09:00:00.000Z' }];

    expect(selectNewPolledMessages(local, polled)).toEqual([]);
  });

  it('совпадение по id — не дублируем даже при свежем времени', () => {
    const local = [{ id: '9002', type: 'assistant', content: 'Готово', timestamp: T1 }];
    const polled = [{ id: '9002', type: 'assistant', content: 'Готово, дополнено', timestamp: T2 }];

    expect(selectNewPolledMessages(local, polled)).toEqual([]);
  });

  it('пустая лента — начальная загрузка ещё не пришла, поллинг не вмешивается', () => {
    const polled = [{ id: '9002', type: 'assistant', content: 'Готово', timestamp: T2 }];

    expect(selectNewPolledMessages([], polled)).toEqual([]);
  });

  it('битое время из БД отбрасываем, а не тащим NaN в ленту', () => {
    const local = [{ id: 'loc-1', type: 'user', content: 'Привет', timestamp: T0 }];
    const polled = [{ id: '9002', type: 'assistant', content: 'Готово', timestamp: 'не-дата' }];

    expect(selectNewPolledMessages(local, polled)).toEqual([]);
  });
});

describe('stripAttachmentLines', () => {
  it('оба написания вложений сводятся к одному заданию', () => {
    expect(stripAttachmentLines('📎 a.pdf\n📎 b.pdf\n\nСделай саммари')).toBe('Сделай саммари');
    expect(stripAttachmentLines('📎 a.pdf, b.pdf\nСделай саммари')).toBe('Сделай саммари');
  });

  it('текст без вложений не трогаем', () => {
    expect(stripAttachmentLines('Сделай саммари')).toBe('Сделай саммари');
  });

  it('скрепка внутри строки — часть текста, а не заголовок вложения', () => {
    expect(stripAttachmentLines('Приложил 📎 файл')).toBe('Приложил 📎 файл');
  });
});

describe('attachmentTurnText', () => {
  it('совпадает с тем, что бэк кладёт в историю (chat.controller.ts, uploadAndChat)', () => {
    expect(attachmentTurnText(['a.pdf', 'b.pdf'], 'Сделай саммари')).toBe('📎 a.pdf, b.pdf\nСделай саммари');
  });

  it('один файл — тот же формат', () => {
    expect(attachmentTurnText(['a.pdf'], 'Сделай саммари')).toBe('📎 a.pdf\nСделай саммари');
  });
});
