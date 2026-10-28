// @vitest-environment jsdom
//
// Старые адреса /settings и /referral ведут в «Мой профиль» — с параметрами.
// Прежний <Navigate to="/profile"> терял всё после «?», и ссылка
// /settings?open=zoom (или возврат после привязки входа /settings?linked=1)
// открывала профиль со свёрнутыми настройками.
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { flush, mount, visibleText, type Mounted } from '../test/dom';
import LegacyProfileRedirect from './LegacyProfileRedirect';

// Экран-свидетель: показывает, где человек оказался.
const Where = () => {
  const l = useLocation();
  return <div>at:{`${l.pathname}${l.search}`}</div>;
};

let view: Mounted | null = null;

async function open(url: string): Promise<string> {
  view?.unmount();
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/settings" element={<LegacyProfileRedirect from="settings" />} />
        <Route path="/referral" element={<LegacyProfileRedirect from="referral" />} />
        <Route path="*" element={<Where />} />
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

describe('старые адреса настроек и партнёров', () => {
  it('/settings — профиль с раскрытыми настройками', async () => {
    expect(await open('/settings')).toBe('at:/profile?settings=1');
  });

  it('/settings?open=zoom — сразу карточка Zoom', async () => {
    expect(await open('/settings?open=zoom')).toBe('at:/profile?open=zoom');
  });

  it('возврат после привязки входа не теряет параметр', async () => {
    expect(await open('/settings?linked=1')).toBe('at:/profile?linked=1&settings=1');
  });

  it('/referral — блок «Партнёры», параметры на месте', async () => {
    expect(await open('/referral')).toBe('at:/profile?open=partners');
    expect(await open('/referral?ref=abc')).toBe('at:/profile?ref=abc&open=partners');
  });

  it('App.tsx ведёт оба старых адреса через этот редирект', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('<Route path="/settings" element={<LegacyProfileRedirect from="settings" />} />');
    expect(app).toContain('<Route path="/referral" element={<LegacyProfileRedirect from="referral" />} />');
  });
});
