// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, flush, visibleText, tRu, click } from '../../test/dom';
import { PendingProductActions } from './PendingProductActions';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('./ProductActionCard', () => ({
  ProductActionCard: ({ actionId, onResolved }: any) => (
    <div data-card={actionId}>
      card {actionId}
      <button onClick={() => onResolved?.({ id: actionId })}>resolve-{actionId}</button>
    </div>
  ),
}));
vi.mock('../../services/productActionsApi', () => ({
  productActionsApi: { pending: vi.fn(async () => [{ id: 'p1' }, { id: 'p2' }]) },
}));

describe('ожидающие подтверждения в кабинете', () => {
  it('карточка из ссылки — первой, без повтора; заголовок', async () => {
    const { container } = mount(<PendingProductActions focusId="p2" onCloseFocus={() => {}} />);
    await flush();
    expect([...container.querySelectorAll('[data-card]')].map((e) => e.getAttribute('data-card'))).toEqual(['p2', 'p1']);
    expect(visibleText(container)).toContain(tRu('products.action.pendingTitle'));
  });

  // Находка ревью (F1): колбэк пробрасывается в КАЖДУЮ карточку как есть —
  // StudioPage слушает его, чтобы перечитать список продуктов под ними.
  it('onResolved пробрасывается в карточки', async () => {
    const onResolved = vi.fn();
    const { container } = mount(<PendingProductActions focusId={null} onCloseFocus={() => {}} onResolved={onResolved} />);
    await flush();
    click(container.querySelector('button')!);
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith({ id: 'p1' });
  });
});
