// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { click, mount } from '../../../test/dom';
import { MobileRecordCard } from './MobileRecordCard';
import { openableRow } from './openableRow';

it('мобильная карточка открывается нативной кнопкой и показывает поля', () => {
  const onOpen = vi.fn();
  const view = mount(
    <MobileRecordCard
      title="Пользователь"
      subtitle="Последняя активность"
      fields={[{ label: 'Баланс', value: '1 000' }]}
      onOpen={onOpen}
      testId="mobile-record"
    />,
  );

  const card = view.container.querySelector('[data-testid="mobile-record"]')!;
  expect(card.tagName).toBe('BUTTON');
  expect(card.className).toContain('min-h-11');
  expect(card.textContent).toContain('Баланс');
  click(card);
  expect(onOpen).toHaveBeenCalledOnce();
  view.unmount();
});

it('строка таблицы открывается Enter и Space и получает доступную роль', () => {
  const onOpen = vi.fn();
  const props = openableRow(onOpen, 'Открыть пользователя');
  expect(props.role).toBe('button');
  expect(props.tabIndex).toBe(0);
  expect(props['aria-label']).toBe('Открыть пользователя');

  const preventDefault = vi.fn();
  props.onKeyDown({ key: 'Enter', preventDefault } as any);
  props.onKeyDown({ key: ' ', preventDefault } as any);
  props.onKeyDown({ key: 'Escape', preventDefault } as any);
  expect(onOpen).toHaveBeenCalledTimes(2);
  expect(preventDefault).toHaveBeenCalledTimes(2);
});
