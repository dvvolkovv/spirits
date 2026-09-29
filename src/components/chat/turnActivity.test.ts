import { describe, it, expect } from 'vitest';
import ru from '../../i18n/locales/ru.json';
import {
  ACTIVITY_KINDS, startActivity, addStep, markTextStarted, finishActivity, normalizeKind, durationParts,
} from './turnActivity';

describe('шаги хода', () => {
  it('новый шаг закрывает предыдущий', () => {
    let a = startActivity(0);
    a = addStep(a, 'web_search', 'офис');
    a = addStep(a, 'web_fetch', 'avito.ru');
    expect(a.steps.map((s) => [s.kind, s.done])).toEqual([['web_search', true], ['web_fetch', false]]);
  });

  it('повтор того же шага — счётчик, а не новая строка', () => {
    let a = startActivity(0);
    for (let i = 0; i < 6; i++) a = addStep(a, 'compute');
    expect(a.steps).toEqual([{ kind: 'compute', detail: undefined, count: 6, done: false }]);
  });

  it('тот же вид с другим уточнением — отдельная строка', () => {
    const a = addStep(addStep(startActivity(0), 'web_search', 'а'), 'web_search', 'б');
    expect(a.steps).toHaveLength(2);
  });

  it('пошёл текст — текущий шаг сделан; без шагов состояние то же самое', () => {
    const empty = startActivity(0);
    expect(markTextStarted(empty)).toBe(empty);
    expect(markTextStarted(addStep(empty, 'web_search')).steps[0].done).toBe(true);
  });

  it('текст идёт дальше — объект не пересоздаётся (нет лишних перерисовок)', () => {
    const a = markTextStarted(addStep(startActivity(0), 'web_search'));
    expect(markTextStarted(a)).toBe(a);
  });

  it('конец хода: итог с длительностью, все шаги сделаны', () => {
    const a = addStep(addStep(startActivity(1000), 'web_search'), 'write_file', 'Отчёт.pdf');
    expect(finishActivity(a, 43_000)).toEqual({
      steps: [
        { kind: 'web_search', detail: undefined, count: 1, done: true },
        { kind: 'write_file', detail: 'Отчёт.pdf', count: 1, done: true },
      ],
      durationMs: 42_000,
    });
  });

  it('ход без шагов итога не оставляет', () => {
    expect(finishActivity(startActivity(0), 8000)).toBeUndefined();
  });

  it('незнакомый код от более нового бэка — other', () => {
    expect(normalizeKind('teleport')).toBe('other');
    expect(addStep(startActivity(0), 'teleport').steps[0].kind).toBe('other');
  });

  it('у каждого вида шага есть подпись в ru.json', () => {
    const kinds = (ru as any).chat.activity.kind;
    for (const k of ACTIVITY_KINDS) expect(typeof kinds[k]).toBe('string');
    expect(typeof kinds.read_file_plain).toBe('string');
  });

  it('длительность — минуты и секунды', () => {
    expect(durationParts(42_400)).toEqual({ m: 0, s: 42 });
    expect(durationParts(185_000)).toEqual({ m: 3, s: 5 });
  });
});
