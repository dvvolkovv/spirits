// @vitest-environment jsdom
//
// Ответы поддержки — простой текст, и адрес раздела из ответа не нажимался:
// человек переписывал его руками. Проверяем по экрану: есть ли ссылка, куда
// ведёт и как открывается — свой кабинет в той же вкладке, чужой сайт в
// новой, без доступа к нашей.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { byLink, click, flush, mount, visibleText, type Mounted } from '../../test/dom';
import type { SupportMessage, SupportTicket } from './useSupport';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
// SupportView берёт toIntlLocale из utils/formatters, а тот — настоящий конфиг
// i18next (initReactI18next), которого в заглушке react-i18next нет. Так же
// сделано в SpendingSummary.test.tsx и LoginConsentBlock.test.tsx.
vi.mock('../../i18n', () => ({ default: { language: 'ru' } }));

const state = vi.hoisted(() => ({ messages: [] as SupportMessage[] }));

vi.mock('./useSupport', () => ({
  useSupport: () => {
    const ticket: SupportTicket = {
      id: 't-1',
      status: 'ai_handling',
      urgency: null,
      topic: null,
      createdAt: '2026-10-27T10:00:00.000Z',
      lastMessageAt: null,
      messages: state.messages,
    };
    return {
      tickets: [ticket],
      latestTicket: ticket,
      isLatestActive: true,
      composingNew: false,
      startNewTicket: () => {},
      loading: false,
      sending: false,
      waitingForAi: false,
      sendMessage: async () => {},
    };
  },
}));

import SupportView from './SupportView';

// Экран-свидетель: показывает, куда увела ссылка.
const Where = () => {
  const l = useLocation();
  return <div data-where>{`${l.pathname}${l.search}`}</div>;
};

let view: Mounted | null = null;

beforeAll(() => {
  // jsdom не прокручивает, а лента поддержки докручивает себя вниз после рисования.
  Element.prototype.scrollTo = () => {};
  window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0);
});

afterEach(() => {
  view?.unmount();
  view = null;
});

/** Лента из одного ответа ассистента — или из нескольких сообщений. */
async function open(content: string | SupportMessage[]): Promise<HTMLElement> {
  state.messages =
    typeof content === 'string'
      ? [{ id: 'm-1', senderType: 'ai', content, createdAt: '2026-10-27T10:00:00.000Z' }]
      : content;
  view = mount(
    <MemoryRouter initialEntries={['/support']}>
      <SupportView />
      <Where />
    </MemoryRouter>,
  );
  await flush();
  return view.container;
}

const where = (c: HTMLElement) => c.querySelector('[data-where]')?.textContent;

describe('ссылки в ответах поддержки', () => {
  it('адрес раздела — ссылка, и открывается в кабинете, в той же вкладке', async () => {
    const c = await open('Карточка Zoom тут: https://my.linkeon.io/profile?open=zoom.');
    const a = byLink(c, /my\.linkeon\.io\/profile\?open=zoom$/);
    expect(a).not.toBeNull();
    expect(a!.getAttribute('target')).toBeNull();
    // Точка в конце предложения — не часть адреса, но на экране осталась.
    expect(visibleText(c)).toContain('https://my.linkeon.io/profile?open=zoom.');
    click(a!);
    await flush();
    expect(where(c)).toBe('/profile?open=zoom');
  });

  it('чужой сайт — новая вкладка без доступа к нашей', async () => {
    const c = await open('Источник: https://example.org/docs/page');
    const a = byLink(c, /example\.org/);
    expect(a?.getAttribute('href')).toBe('https://example.org/docs/page');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('не http(s) — остаётся текстом', async () => {
    const c = await open('Не нажимай javascript:alert(1) и data:text/html,x');
    expect(c.querySelectorAll('a')).toHaveLength(0);
    expect(visibleText(c)).toContain('javascript:alert(1)');
  });

  it('текст без адресов — как был', async () => {
    const c = await open('Обычный ответ без ссылок.');
    expect(c.querySelectorAll('a')).toHaveLength(0);
    expect(visibleText(c)).toContain('Обычный ответ без ссылок.');
  });

  // Находка ревью (M3): у своей ссылки href вёл на боевой адрес из ответа.
  // Средняя кнопка и ctrl/cmd-клик открывали по нему новую вкладку — со
  // стенда уводили на прод, а ctrl/cmd-клик перехватывался и вёл в той же.
  it('своя ссылка — путь этого же кабинета: ctrl/cmd-клик отдаётся браузеру', async () => {
    const c = await open('Карточка Zoom тут: https://my.linkeon.io/profile?open=zoom');
    const a = byLink(c, /open=zoom$/)!;
    expect(a.getAttribute('href')).toBe('/profile?open=zoom');
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      let prevented: boolean | null = null;
      // После обработчиков React: видно, перехватил ли клик роутер. Затем —
      // отмена, чтобы jsdom не пытался открыть адрес сам.
      const seen = (e: Event) => {
        prevented = e.defaultPrevented;
        e.preventDefault();
      };
      document.addEventListener('click', seen);
      act(() => {
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...mod }));
      });
      document.removeEventListener('click', seen);
      expect(prevented, JSON.stringify(mod)).toBe(false);
    }
    await flush();
    expect(where(c)).toBe('/support');
  });

  // Находка ревью (M4): Метрика (trackLinks в index.html) пишет внешние
  // переходы полным адресом, а адреса в переписке с поддержкой личные — в
  // пузыре самого человека бывает ссылка на встречу с паролем. Класс
  // ym-disable-tracklink по документации Метрики снимает с ссылки признак
  // внешней (yandex.ru/support/metrica/ru/code/html-markup).
  it('ни одну ссылку поддержки Метрика не пишет как внешний переход — и в пузыре человека тоже', async () => {
    const c = await open([
      { id: 'm-1', senderType: 'user', content: 'Встреча: https://zoom.example/j/1?pwd=x1', createdAt: '2026-10-27T10:00:00.000Z' },
      {
        id: 'm-2',
        senderType: 'ai',
        content: 'Карточка: https://my.linkeon.io/profile?open=zoom, источник: https://example.org/docs',
        createdAt: '2026-10-27T10:01:00.000Z',
      },
    ]);
    const links = Array.from(c.querySelectorAll('a'));
    expect(links.map((a) => a.textContent)).toEqual([
      'https://zoom.example/j/1?pwd=x1',
      'https://my.linkeon.io/profile?open=zoom',
      'https://example.org/docs',
    ]);
    for (const a of links) expect(a.classList.contains('ym-disable-tracklink'), a.textContent ?? '').toBe(true);
  });
});
