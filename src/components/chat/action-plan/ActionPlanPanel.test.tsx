// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ActionPlanPanel from './ActionPlanPanel';
import { actionPlansApi, type ActionPlan } from '../../../services/actionPlansApi';
import { actAsync, byButton, click, clickAsync, flush, mount, type, visibleText } from '../../../test/dom';

vi.mock('../../../services/actionPlansApi', () => ({
  actionPlansApi: { get: vi.fn(), generate: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const plan: ActionPlan = {
  id: 'plan-1', assistantId: '12', title: 'Подготовка к переезду', summary: 'Действуем по порядку',
  items: [{ id: 'one', text: 'Составить список вещей', done: false }, { id: 'two', text: 'Забронировать транспорт', done: true }],
  createdAt: '2026-10-30T10:00:00Z', updatedAt: '2026-10-30T10:00:00Z',
};

beforeEach(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({ lng: 'ru', fallbackLng: 'ru', resources: { ru: { translation: (await import('../../../i18n/locales/ru.json')).default } }, interpolation: { escapeValue: false } });
  }
  vi.mocked(actionPlansApi.get).mockResolvedValue(plan);
  vi.mocked(actionPlansApi.generate).mockResolvedValue(plan);
  vi.mocked(actionPlansApi.update).mockImplementation(async (_id, input) => ({ ...plan, ...input }));
  vi.mocked(actionPlansApi.remove).mockResolvedValue();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function openPanel(onDiscuss = vi.fn()) {
  const view = mount(<ActionPlanPanel assistantId={12} onClose={vi.fn()} onDiscuss={onDiscuss} />);
  await flush();
  return { view, onDiscuss };
}

describe('ActionPlanPanel', () => {
  it('shows a saved plan and its real progress', async () => {
    const { view } = await openPanel();
    expect((view.container.querySelector('#action-plan-title') as HTMLInputElement).value).toBe('Подготовка к переезду');
    expect(visibleText(view.container)).toContain('Выполнено 1 из 2');
    expect(view.container.querySelector('[aria-valuenow]')).toBeNull();
    expect(view.container.querySelector('[role="checkbox"][aria-checked="true"]')).not.toBeNull();
    view.unmount();
  });

  it('edits a step and saves the checklist', async () => {
    const { view } = await openPanel();
    const input = view.container.querySelector('textarea[aria-label="Шаг 1"]') as HTMLTextAreaElement;
    type(input, 'Разобрать документы');
    await clickAsync(byButton(view.container, /Сохранить/)!);
    expect(actionPlansApi.update).toHaveBeenCalledWith('plan-1', expect.objectContaining({
      items: [expect.objectContaining({ text: 'Разобрать документы' }), expect.any(Object)],
    }));
    view.unmount();
  });

  it('generates a plan on explicit user action', async () => {
    vi.mocked(actionPlansApi.get).mockResolvedValue(null);
    const { view } = await openPanel();
    expect(actionPlansApi.generate).not.toHaveBeenCalled();
    await clickAsync(byButton(view.container, /Сформировать план/)!);
    expect(actionPlansApi.generate).toHaveBeenCalledWith(12, undefined);
    expect((view.container.querySelector('#action-plan-title') as HTMLInputElement).value).toBe('Подготовка к переезду');
    view.unmount();
  });

  it('sends the visible plan back to the assistant', async () => {
    const { view, onDiscuss } = await openPanel();
    click(byButton(view.container, /Обсудить/)!);
    expect(onDiscuss).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-1' }));
    view.unmount();
  });

  it('does not lose edited text on a failed save', async () => {
    vi.mocked(actionPlansApi.update).mockRejectedValue(new Error('network'));
    const { view } = await openPanel();
    type(view.container.querySelector('textarea[aria-label="Шаг 1"]')!, 'Новый текст');
    await actAsync(async () => { byButton(view.container, /Сохранить/)!.click(); });
    expect((view.container.querySelector('textarea[aria-label="Шаг 1"]') as HTMLTextAreaElement).value).toBe('Новый текст');
    expect(visibleText(view.container)).toContain('Не удалось загрузить или сохранить план');
    view.unmount();
  });
});
