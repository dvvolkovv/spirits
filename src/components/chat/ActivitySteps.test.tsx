// src/components/chat/ActivitySteps.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, click, byButton, visibleText } from '../../test/dom';
import { LiveActivity, ActivitySummaryView } from './ActivitySteps';
import { addStep, startActivity } from './turnActivity';

// tRu не знает плюралов — выбираем форму так же, как i18next, по Intl.PluralRules.
vi.mock('react-i18next', async () => {
  const { tRu } = await import('../../test/dom');
  const rules = new Intl.PluralRules('ru');
  const t = (key: string, opts?: Record<string, unknown>) =>
    typeof opts?.count === 'number' ? tRu(`${key}_${rules.select(opts.count)}`, opts) : tRu(key, opts);
  return { useTranslation: () => ({ t }) };
});

describe('шаги работы на экране', () => {
  it('пока шагов нет — «Думает» с таймером вместо трёх точек', () => {
    const { container } = mount(<LiveActivity activity={startActivity(Date.now())} />);
    expect(visibleText(container)).toMatch(/Думает · \d+ с/);
  });

  it('шаги: подпись, уточнение и счётчик повторов', () => {
    let a = addStep(startActivity(Date.now()), 'web_search', 'офис Казань');
    a = addStep(addStep(a, 'compute'), 'compute');
    const { container } = mount(<LiveActivity activity={a} />);
    const text = visibleText(container);
    expect(text).toContain('Ищу в интернете · офис Казань');
    expect(text).toContain('Обрабатываю данные ×2');
    expect(text).not.toContain('Думает');
  });

  it('чтение файла без имени — «Изучаю материалы»', () => {
    const { container } = mount(<LiveActivity activity={addStep(startActivity(Date.now()), 'read_file')} />);
    expect(visibleText(container)).toContain('Изучаю материалы');
  });

  it('итог хода свёрнут в «N шагов · время» и раскрывается по нажатию', () => {
    const summary = {
      steps: [
        { kind: 'web_search' as const, detail: 'офис', count: 1, done: true },
        { kind: 'write_file' as const, detail: 'Отчёт.pdf', count: 1, done: true },
      ],
      durationMs: 42_000,
    };
    const { container } = mount(<ActivitySummaryView summary={summary} />);
    expect(visibleText(container)).toContain('2 шага · 42 с');
    expect(visibleText(container)).not.toContain('Отчёт.pdf');
    click(byButton(container, /2 шага/)!);
    expect(visibleText(container)).toContain('Готовлю файл · Отчёт.pdf');
  });

  it('длинный ход — минуты', () => {
    const summary = { steps: [{ kind: 'compute' as const, count: 1, done: true }], durationMs: 185_000 };
    const { container } = mount(<ActivitySummaryView summary={summary} />);
    expect(visibleText(container)).toContain('1 шаг · 3 мин 5 с');
  });

  it('список шагов объявляется скринридером — aria-live на списке, не на тикающем таймере', () => {
    const a = addStep(startActivity(Date.now()), 'compute');
    const { container } = mount(<LiveActivity activity={a} />);
    const ul = container.querySelector('ul')!;
    expect(ul.getAttribute('aria-live')).toBe('polite');
    // Таймер меняется каждую секунду — если бы aria-live висел на его
    // контейнере, скринридер зачитывал бы «5 с», «6 с», «7 с» без остановки.
    const timer = container.querySelector('.text-\\[11px\\]');
    expect(timer?.getAttribute('aria-live')).toBeNull();
  });
});
