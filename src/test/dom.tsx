/**
 * Крошечный стенд для тестов, которые меряют ВИДИМОЕ, а не вызовы.
 *
 * Зачем свой, а не @testing-library/react: библиотеки в зависимостях нет, а
 * заводить её ради трёх запросов к DOM — это правка package.json и
 * pnpm-lock.yaml в ветке, где параллельно работают другие сессии. Нужное
 * отсюда умещается в сотню строк поверх react-dom/client.
 *
 * Правило пользования: утверждать про `container.textContent` и про
 * `disabled`, то есть про то, что человек видит на экране. Проверка вида
 * «обработчик не вызвался» зеленеет и тогда, когда кнопка просто сломана, —
 * именно на этом в этой работе уже ловились целые батареи.
 */
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import ru from '../i18n/locales/ru.json';

// React 18 требует этот флаг, иначе act() ругается в консоль на каждый вызов
// и часть предупреждений тонет в шуме.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  rerender: (ui: ReactElement) => void;
  unmount: () => void;
}

export function mount(ui: ReactElement): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(ui);
  });
  return {
    container,
    rerender: (next: ReactElement) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/**
 * Клик со всплытием — именно так его видит React (делегирование на корень
 * контейнера). `el.click()` без bubbles до обработчика React не доходит.
 */
export function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/**
 * Клик, после которого нужно дождаться асинхронного обработчика (запрос к
 * api и последующий setState). Без await внутри act обновление состояния
 * приходит уже после утверждения теста.
 */
export async function clickAsync(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Один оборот микрозадач: столько нужно уже разрешённому промису из
    // заглушки api, чтобы его .then успел отработать внутри act.
    await Promise.resolve();
  });
}

/**
 * Два нажатия ДО того, как React успел перерисовать кнопку.
 *
 * Два подряд идущих click() — не то же самое: каждый из них закрывает свой
 * act(), React успевает применить `disabled`, и второе нажатие гасит уже
 * разметка. Проверено мутацией: со снятым замком по ссылке такой тест
 * оставался зелёным. Здесь оба события приходят внутри одного act — ровно
 * так, как их видит обработчик, вызванный дважды в одном тике (двойной клик
 * по неотзывчивой странице, Enter вместе с кликом).
 */
export function doubleClick(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/**
 * Выполняет действие и даёт React прокрутить вызванные им обновления.
 * Нужно там, где состояние меняет не клик, а разрешение висевшего промиса.
 */
export async function actAsync(fn: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await fn();
    await Promise.resolve();
  });
}

/** Дать React доработать эффекты, запущенные монтированием. */
export const flush = (): Promise<void> => actAsync(() => {});

/**
 * Ввод в контролируемое поле.
 *
 * Простое `input.value = v` React не замечает: он подменяет сеттер value на
 * прототипе, чтобы отличать свои записи от чужих, и событие 'input' с
 * неизменившимся (с его точки зрения) значением игнорирует. Отсюда вызов
 * родного сеттера — приём стандартный, он же внутри @testing-library.
 */
export function type(el: Element, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Поле по тексту его подписи — как его ищет человек глазами. */
export function byLabel(container: HTMLElement, text: RegExp): HTMLInputElement | null {
  const label = Array.from(container.querySelectorAll('label')).find((l) =>
    text.test(l.textContent ?? ''),
  );
  if (!label) return null;
  const id = label.getAttribute('for');
  if (!id) return null;
  // Сравнение по .id, а не селектор '#…': экранирование идентификатора в
  // селекторе — лишняя зависимость от CSS.escape в jsdom.
  return (
    Array.from(container.querySelectorAll('input, textarea')).find(
      (el) => el.id === id,
    ) as HTMLInputElement | undefined
  ) ?? null;
}

/** Кнопка по её надписи. */
export function byButton(container: HTMLElement, text: RegExp): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll('button')).find((b) =>
      text.test(b.textContent ?? ''),
    ) ?? null
  );
}

/** Весь видимый текст — для утверждений «пользователь это увидел». */
export function visibleText(container: HTMLElement): string {
  return container.textContent ?? '';
}

type Dict = { [k: string]: string | Dict };

/**
 * Перевод из НАСТОЯЩЕГО ru.json.
 *
 * Мок вида `t: (k) => k` вернул бы ключ и зеленел бы на ключе, которого в
 * локали нет вовсе, — а в браузере на этом месте у пользователя оказался бы
 * сырой `products.new.errors.slugInvalid`. Здесь отсутствующий ключ виден:
 * тест ищет русский текст и не находит его.
 */
export function tRu(key: string, opts?: Record<string, unknown>): string {
  let node: string | Dict | undefined = ru as unknown as Dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return key;
    node = node[part];
  }
  if (typeof node !== 'string') return key;
  return node.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    opts && name in opts ? String(opts[name]) : whole,
  );
}
