// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, click, visibleText, type Mounted } from '../../test/dom';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
// formatNumber и formatDate берут язык у экземпляра i18next.
vi.mock('../../i18n', () => ({ default: { language: 'ru' } }));

import { SpendingMonths } from './SpendingMonths';

const months = [
  { month: '2026-10', total: 6193, categories: [{ key: 'replies', tokens: 6193, count: 12 }] },
  {
    month: '2026-06',
    total: 360050,
    categories: [
      { key: 'replies', tokens: 250050, count: 63 },
      { key: 'images', tokens: 110000, count: 11 },
    ],
  },
];

/** Разряды в ru — неразрывные пробелы; сравниваем по обычным. */
const text = (m: Mounted) => visibleText(m.container).replace(/\s/g, ' ');

let m: Mounted | null = null;
afterEach(() => {
  m?.unmount();
  m = null;
});

describe('SpendingMonths', () => {
  it('новый месяц раскрыт, прошлые свёрнуты; итог виден у каждого', () => {
    m = mount(<SpendingMonths months={months} />);
    const t = text(m);
    expect(t).toContain('Октябрь 2026');
    expect(t).toContain('Июнь 2026');
    expect(t).toContain('6 193');
    expect(t).toContain('360 050');
    expect(t).toContain('Ответы ассистентов');
    expect(t).not.toContain('Картинки');
  });

  it('нажатие раскрывает и сворачивает месяц', () => {
    m = mount(<SpendingMonths months={months} />);
    const june = m.container.querySelector('[data-testid="spending-month-2026-06"] button');
    if (!june) throw new Error('нет кнопки июня');
    click(june);
    expect(text(m)).toContain('Картинки');
    expect(text(m)).toContain('110 000');
    expect(june.getAttribute('aria-expanded')).toBe('true');
    click(june);
    expect(text(m)).not.toContain('Картинки');
  });

  it('незнакомая категория подписана «Прочее»', () => {
    m = mount(<SpendingMonths months={[{ month: '2026-10', total: 5, categories: [{ key: 'music', tokens: 5, count: 1 }] }]} />);
    expect(text(m)).toContain('Прочее');
  });
});
