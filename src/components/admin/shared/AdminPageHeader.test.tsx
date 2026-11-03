// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { byButton, click, mount } from '../../../test/dom';
import { AdminPageHeader } from './AdminPageHeader';
import { shortAdminIdentity } from './identity';
import ru from '../../../i18n/locales/ru.json';

it('показывает единый заголовок и вызывает обновление', () => {
  const onRefresh = vi.fn();
  const view = mount(
    <AdminPageHeader icon={<span>★</span>} title="Платежи" description="Без тестовых аккаунтов" onRefresh={onRefresh} />,
  );

  expect(view.container.textContent).toContain('Платежи');
  expect(view.container.textContent).toContain('Без тестовых аккаунтов');
  expect(byButton(view.container, /Обновить/)!.className).toContain('min-h-11');
  click(byButton(view.container, /Обновить/)!);
  expect(onRefresh).toHaveBeenCalledOnce();
  view.unmount();
});

it('сокращает UUID, но не меняет телефоны и обычные идентификаторы', () => {
  expect(shortAdminIdentity('547d1770-390c-4e7e-89db-7bd38bbec72a')).toBe('ID 547d1770…');
  expect(shortAdminIdentity('79030169187')).toBe('79030169187');
  expect(shortAdminIdentity('smm_producer')).toBe('smm_producer');
});

it('использует русское название раздела удержания', () => {
  expect(ru.admin.tabs.retention).toBe('Удержание');
});
