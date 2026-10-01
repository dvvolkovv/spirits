// @vitest-environment jsdom
//
// `/` всегда ведёт на `/chat`, но должен перенести ТОЛЬКО выбор ассистента
// (?assistant=). Остальные параметры адреса переносить нельзя: одноразовые
// коды входа Taler ID (talerid_login, talerid_link) App.tsx гасит через
// window.history.replaceState мимо роутера. Перенос устаревшего search отдал
// бы их обратно в адрес /chat, и код погас бы второй раз («Ссылка входа
// устарела») при обновлении страницы или смене языка.
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { flush, mount, visibleText, type Mounted } from '../test/dom';
import RootRedirect from './RootRedirect';

// Экран-свидетель на месте /chat: показывает ровно то, что получил через адрес.
const SearchProbe = () => <div>search:{useLocation().search}</div>;

let view: Mounted | null = null;

async function openRoot(url: string): Promise<string> {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/chat" element={<SearchProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  await flush();
  return visibleText(view.container);
}

afterEach(() => {
  view?.unmount();
  view = null;
});

describe('RootRedirect', () => {
  it('переносит только ?assistant=, одноразовый код входа Taler ID отбрасывает', async () => {
    const text = await openRoot('/?assistant=14&talerid_login=X&ref=abc');
    expect(text).toBe('search:?assistant=14');
  });

  it('без ассистента в ссылке — search пустой (код входа не возвращается в адрес)', async () => {
    const text = await openRoot('/?talerid_login=X');
    expect(text).toBe('search:');
  });
});
