// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const { getJson } = vi.hoisted(() => ({ getJson: vi.fn() }));
vi.mock('../api', () => ({ getJson }));
vi.mock('../telegram', () => ({ openLink: vi.fn() }));
vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../i18n', () => ({ default: { language: 'ru' } }));

import { mount, flush, visibleText, tRu, type Mounted } from '../../test/dom';
import { WalletScreen } from './WalletScreen';

let m: Mounted | null = null;
beforeEach(() => {
  getJson.mockReset();
});
afterEach(() => {
  m?.unmount();
  m = null;
});

const render = async () => {
  m = mount(<WalletScreen />);
  await flush();
  await flush();
  return m;
};

describe('WalletScreen', () => {
  it('сводка расхода — заголовок виден и стоит раньше истории пополнений', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.includes('/tokens/spending')) {
        return { months: [{ month: '2026-10', total: 6193, categories: [{ key: 'replies', tokens: 6193, count: 12 }] }] };
      }
      if (url === '/webhook/user/tokens/') return { tokens: 100 };
      if (url === '/webhook/tokens/history') return { items: [] };
      throw new Error('неожиданный url ' + url);
    });
    const r = await render();
    expect(visibleText(r.container)).toContain(tRu('payment.spending.title'));

    const headings = Array.from(r.container.querySelectorAll('h2')).map((h) => h.textContent);
    const spendingIdx = headings.indexOf(tRu('payment.spending.title'));
    const historyIdx = headings.indexOf(tRu('tma.wallet.history'));
    expect(spendingIdx).toBeGreaterThanOrEqual(0);
    expect(historyIdx).toBeGreaterThanOrEqual(0);
    expect(spendingIdx).toBeLessThan(historyIdx);
  });

  it('сводка расхода упала — секции нет, баланс всё равно виден', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.includes('/tokens/spending')) throw new Error('500');
      if (url === '/webhook/user/tokens/') return { tokens: 100 };
      if (url === '/webhook/tokens/history') return { items: [] };
      throw new Error('неожиданный url ' + url);
    });
    const r = await render();
    expect(visibleText(r.container)).not.toContain(tRu('payment.spending.title'));
    expect(visibleText(r.container)).toContain('100');
  });

  it('трат нет — секции нет', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.includes('/tokens/spending')) return { months: [] };
      if (url === '/webhook/user/tokens/') return { tokens: 100 };
      if (url === '/webhook/tokens/history') return { items: [] };
      throw new Error('неожиданный url ' + url);
    });
    const r = await render();
    expect(visibleText(r.container)).not.toContain(tRu('payment.spending.title'));
  });
});
