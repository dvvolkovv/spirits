// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actAsync, byButton, clickAsync, flush, mount } from '../../test/dom';
import type { Mounted } from '../../test/dom';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));
vi.mock('./GlobalLlmProviderControl', () => ({ GlobalLlmProviderControl: () => null }));
vi.mock('./assistants/AgentVersionEditor', () => ({ default: () => <div>РЕДАКТОР-АССИСТЕНТА</div> }));

import AdminAssistantsView from './AdminAssistantsView';

let mounted: Mounted | undefined;

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({
    ok: true,
    json: async () => [{ id: 7, name: 'Райя', description: 'Описание', system_prompt: 'Промпт' }],
  });
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.restoreAllMocks();
});

async function renderView(editorDirty = false, onEditorDirtyChange = vi.fn()) {
  mounted = mount(<AdminAssistantsView editorDirty={editorDirty} onEditorDirtyChange={onEditorDirtyChange} />);
  await flush();
  return onEditorDirtyChange;
}

describe('мобильный редактор ассистентов', () => {
  it('открывает редактор вместо списка и возвращается к списку кнопкой Назад', async () => {
    await renderView();
    const list = mounted!.container.querySelector('[data-testid="admin-assistants-list"]')!;
    await clickAsync(byButton(mounted!.container, /^Райя$/));

    expect(list.parentElement?.parentElement?.className).toContain('hidden');
    expect(mounted!.container.textContent).toContain('РЕДАКТОР-АССИСТЕНТА');
    await clickAsync(mounted!.container.querySelector('[data-testid="admin-assistants-back"]')!);

    expect(list.parentElement?.parentElement?.className).not.toContain('hidden');
    expect(mounted!.container.textContent).not.toContain('РЕДАКТОР-АССИСТЕНТА');
  });

  it('не закрывает несохранённый редактор без подтверждения', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDirty = await renderView(true);
    await clickAsync(byButton(mounted!.container, /^Райя$/));
    onDirty.mockClear();

    await actAsync(async () => {
      mounted!.container.querySelector('[data-testid="admin-assistants-back"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(onDirty).not.toHaveBeenCalled();
    expect(mounted!.container.textContent).toContain('РЕДАКТОР-АССИСТЕНТА');
  });
});
