// @vitest-environment jsdom
//
// Все пути входа кончаются голым /chat. Человек, нажавший на linkeon.io
// «Сделать сайт или бота», после входа должен оказаться во вкладке продуктов,
// а явные адреса (/chat?assistant=…, другие разделы) перехватывать нельзя.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { byButton, click, flush, mount, visibleText, type Mounted } from '../test/dom';
import PendingDestinationRedirect from './PendingDestinationRedirect';
import { rememberPendingDestination } from '../utils/pendingDestination';

// Экран-свидетель: показывает, где человек оказался.
const Where = () => {
  const l = useLocation();
  return <div>at:{l.pathname}{l.search}</div>;
};

let view: Mounted | null = null;

async function open(url: string): Promise<string> {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <PendingDestinationRedirect />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  await flush();
  return visibleText(view.container);
}

// Свидетель с кнопкой, повторяющей уход на голый /chat после входа, когда оболочка
// уже стоит на другом адресе (так приходит Taler ID: / → RootRedirect → /chat).
const WhereWithChat = () => {
  const l = useLocation();
  const type = useNavigationType();
  const nav = useNavigate();
  return (
    <div>
      <span data-at>{`${l.pathname}${l.search}`}</span>
      <span data-type>{type}</span>
      <button onClick={() => nav('/chat', { replace: true })}>в чат</button>
    </div>
  );
};

async function openWithChat(url: string): Promise<Mounted> {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <PendingDestinationRedirect />
      <Routes>
        <Route path="*" element={<WhereWithChat />} />
      </Routes>
    </MemoryRouter>,
  );
  await flush();
  return view;
}

const at = (v: Mounted): string | null => v.container.querySelector('[data-at]')?.textContent ?? null;
const navType = (v: Mounted): string | null => v.container.querySelector('[data-type]')?.textContent ?? null;

beforeEach(() => localStorage.clear());

afterEach(() => {
  view?.unmount();
  view = null;
});

describe('после входа — в раздел, куда человек шёл', () => {
  it('голый /chat и запомненная Студия → вкладка продуктов, запись стёрта', async () => {
    rememberPendingDestination('/studio', '?tab=products');
    expect(await open('/chat')).toBe('at:/studio?tab=products');
    expect(localStorage.getItem('pending_destination')).toBeNull();
  });

  it('ничего не запомнено — остаётся в чате', async () => {
    expect(await open('/chat')).toBe('at:/chat');
  });

  it('/chat с явным адресом не перехватывается', async () => {
    rememberPendingDestination('/studio', '?tab=products');
    expect(await open('/chat?assistant=14')).toBe('at:/chat?assistant=14');
  });

  it('другой раздел не перехватывается', async () => {
    rememberPendingDestination('/studio', '?tab=products');
    expect(await open('/profile')).toBe('at:/profile');
  });
});

describe('оболочка вошедшего живёт дольше одного мгновения', () => {
  it('оболочка сначала на странице кнопки, потом голый /chat — вкладка продуктов, адрес заменён', async () => {
    rememberPendingDestination('/studio', '?tab=products');
    const v = await openWithChat('/studio?tab=products&utm_content=sites');
    // До перехода в чат адрес не трогаем: pathname не /chat, запись не наша забота.
    expect(at(v)).toBe('/studio?tab=products&utm_content=sites');

    const btn = byButton(v.container, /в чат/);
    expect(btn).not.toBeNull();
    click(btn!);
    await flush();

    expect(at(v)).toBe('/studio?tab=products');
    expect(navType(v)).toBe('REPLACE');
  });

  it('после перехода в раздел следующий голый /chat остаётся чатом', async () => {
    rememberPendingDestination('/studio', '?tab=products');
    const v = await openWithChat('/chat');
    expect(at(v)).toBe('/studio?tab=products');

    const btn = byButton(v.container, /в чат/);
    expect(btn).not.toBeNull();
    click(btn!);
    await flush();

    // Запись уже забрана первым переходом — повторный голый /chat её не находит.
    expect(at(v)).toBe('/chat');
  });
});
