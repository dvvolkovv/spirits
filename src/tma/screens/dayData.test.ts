import { describe, it, expect, vi } from 'vitest';
import { parseFocus, parseEvents, parseTasks, loadDay } from './dayData';

describe('parseFocus', () => {
  it('energyLine, если hasEnergy — реальная форма /webhook/app-widget/content', () => {
    expect(parseFocus({ hasEnergy: true, energyLine: 'Сегодня — день начинаний.' }))
      .toBe('Сегодня — день начинаний.');
  });

  it("'off', если hasEnergy=false — у большинства энерго-рутина не включена", () => {
    expect(parseFocus({ hasEnergy: false, energyLine: null })).toBe('off');
  });

  it("'off' на пустом/неожиданном ответе, без исключений", () => {
    expect(parseFocus(null)).toBe('off');
    expect(parseFocus({})).toBe('off');
  });
});

describe('parseEvents', () => {
  it("не подключён → 'off' (экран покажет приглашение подключить)", () => {
    expect(parseEvents({ connected: false })).toBe('off');
  });

  it("подключён → 'unavailable' — POST calendar/events это createEvent, списка читать нечем", () => {
    expect(parseEvents({ connected: true, provider: 'yandex' })).toBe('unavailable');
  });

  it("на пустом ответе трактуется как не подключён, не как вечная загрузка", () => {
    expect(parseEvents(null)).toBe('off');
  });
});

describe('parseTasks', () => {
  it('оставляет только active — /webhook/user/tasks отдаёт все статусы', () => {
    const raw = [
      { id: '1', title: 'Написать отчёт', status: 'active' },
      { id: '2', title: 'Старое', status: 'archived' },
      { id: '3', title: 'Сделано', status: 'done' },
      { id: '4', title: 'Ещё активное', status: 'active' },
    ];
    expect(parseTasks(raw)).toEqual([
      { id: '1', title: 'Написать отчёт', status: 'active' },
      { id: '4', title: 'Ещё активное', status: 'active' },
    ]);
  });

  it("'off', если ответ не массив", () => {
    expect(parseTasks(null)).toBe('off');
    expect(parseTasks({ tasks: [] })).toBe('off');
  });
});

describe('loadDay — независимая деградация', () => {
  it('падение фокуса не гасит события и задачи', async () => {
    const deps = {
      getWidgetContent: vi.fn(async () => { throw new Error('500'); }),
      getCalendarStatus: vi.fn(async () => ({ connected: false })),
      getUserTasks: vi.fn(async () => [{ id: '1', title: 'X', status: 'active' }]),
    };
    const r = await loadDay(deps);
    expect(r.focus).toBe('off');
    expect(r.events).toBe('off');
    expect(r.tasks).toEqual([{ id: '1', title: 'X', status: 'active' }]);
  });

  it('падение календаря не гасит фокус и задачи', async () => {
    const deps = {
      getWidgetContent: vi.fn(async () => ({ hasEnergy: true, energyLine: 'Фокус' })),
      getCalendarStatus: vi.fn(async () => { throw new Error('500'); }),
      getUserTasks: vi.fn(async () => []),
    };
    const r = await loadDay(deps);
    expect(r.focus).toBe('Фокус');
    expect(r.events).toBe('off');
    expect(r.tasks).toEqual([]);
  });

  it('падение задач не гасит фокус и календарь', async () => {
    const deps = {
      getWidgetContent: vi.fn(async () => ({ hasEnergy: false })),
      getCalendarStatus: vi.fn(async () => ({ connected: true })),
      getUserTasks: vi.fn(async () => { throw new Error('500'); }),
    };
    const r = await loadDay(deps);
    expect(r.focus).toBe('off');
    expect(r.events).toBe('unavailable');
    expect(r.tasks).toBe('off');
  });

  it('неподключённый календарь даёт приглашение, а не пустой список и не вечную загрузку', async () => {
    const deps = {
      getWidgetContent: vi.fn(async () => ({ hasEnergy: false })),
      getCalendarStatus: vi.fn(async () => ({ connected: false })),
      getUserTasks: vi.fn(async () => []),
    };
    const r = await loadDay(deps);
    expect(r.events).toBe('off');
    expect(r.events).not.toBeNull();
    expect(Array.isArray(r.events)).toBe(false);
  });
});
