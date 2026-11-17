// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ActionPlanPanel from './ActionPlanPanel';
import { ActionPlanRequestError, actionPlansApi, type ActionPlan } from '../../../services/actionPlansApi';
import { actAsync, byButton, click, clickAsync, flush, mount, type, visibleText } from '../../../test/dom';

// Класс ошибки — настоящий: панель отличает «мало разговора» через instanceof.
// apiClient — заглушка: настоящий тянет authService, а тот — src/i18n, который
// инициализирует i18next языком браузера (en) раньше русской инициализации ниже.
vi.mock('../../../services/apiClient', () => ({ apiClient: {} }));
vi.mock('../../../services/actionPlansApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/actionPlansApi')>()),
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
    // Только ассистент: точка отсчёта «Чистого листа» — на сервере.
    expect(actionPlansApi.get).toHaveBeenCalledWith(12);
    expect(vi.mocked(actionPlansApi.get).mock.calls[0]).toHaveLength(1);
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
    expect(actionPlansApi.generate).toHaveBeenCalledWith(12);
    expect(vi.mocked(actionPlansApi.generate).mock.calls[0]).toHaveLength(1);
    expect((view.container.querySelector('#action-plan-title') as HTMLInputElement).value).toBe('Подготовка к переезду');
    view.unmount();
  });

  it('explains "not enough conversation" instead of asking to retry', async () => {
    vi.mocked(actionPlansApi.get).mockResolvedValue(null);
    vi.mocked(actionPlansApi.generate).mockRejectedValue(
      new ActionPlanRequestError(400, 'not enough conversation for an action plan'),
    );
    const { view } = await openPanel();
    await clickAsync(byButton(view.container, /Сформировать план/)!);
    const text = visibleText(view.container);
    expect(text).toContain('Для плана пока мало разговора');
    expect(text).not.toContain('Не удалось загрузить или сохранить план');
    // Повтор загрузки не поможет — кнопки «Повторить» нет.
    expect(byButton(view.container, /Повторить/)).toBeNull();
    // Кнопка формирования остаётся: написал пару сообщений — жмёт снова.
    expect(byButton(view.container, /Сформировать план/)).not.toBeNull();
    view.unmount();
  });

  it('keeps the old plan and explains "not enough conversation" on regenerate', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(actionPlansApi.generate).mockRejectedValue(
      new ActionPlanRequestError(400, 'not enough conversation for an action plan'),
    );
    const { view } = await openPanel();
    await clickAsync(byButton(view.container, /Сформировать заново/)!);
    expect((view.container.querySelector('#action-plan-title') as HTMLInputElement).value).toBe('Подготовка к переезду');
    expect(visibleText(view.container)).toContain('Для плана пока мало разговора');
    view.unmount();
  });

  it('clears "not enough conversation" after a successful retry', async () => {
    vi.mocked(actionPlansApi.get).mockResolvedValue(null);
    vi.mocked(actionPlansApi.generate)
      .mockRejectedValueOnce(new ActionPlanRequestError(400, 'not enough conversation for an action plan'))
      .mockResolvedValueOnce(plan);
    const { view } = await openPanel();
    await clickAsync(byButton(view.container, /Сформировать план/)!);
    expect(visibleText(view.container)).toContain('Для плана пока мало разговора');
    // Написал ассистенту пару сообщений — жмёт снова, план получился.
    await clickAsync(byButton(view.container, /Сформировать план/)!);
    expect(visibleText(view.container)).not.toContain('Для плана пока мало разговора');
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    expect((view.container.querySelector('#action-plan-title') as HTMLInputElement).value).toBe('Подготовка к переезду');
    view.unmount();
  });

  it.each([
    ['another 400 from the server', () => new ActionPlanRequestError(400, 'assistantId is required')],
    ['a server failure', () => new ActionPlanRequestError(502, 'assistant returned an invalid action plan')],
    ['a network failure', () => new Error('network')],
  ])('shows the generic error for %s', async (_name, makeError) => {
    vi.mocked(actionPlansApi.get).mockResolvedValue(null);
    vi.mocked(actionPlansApi.generate).mockRejectedValue(makeError());
    const { view } = await openPanel();
    await clickAsync(byButton(view.container, /Сформировать план/)!);
    const text = visibleText(view.container);
    expect(text).toContain('Не удалось загрузить или сохранить план');
    expect(text).not.toContain('Для плана пока мало разговора');
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
