// @vitest-environment jsdom
//
// Все пути входа кончаются голым /chat. Человек, нажавший на linkeon.io
// «Сделать сайт или бота», после входа должен оказаться во вкладке продуктов,
// а явные адреса (/chat?assistant=…, другие разделы) перехватывать нельзя.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { flush, mount, visibleText, type Mounted } from '../test/dom';
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
