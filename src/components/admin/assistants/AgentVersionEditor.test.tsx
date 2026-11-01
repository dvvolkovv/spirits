// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actAsync, byButton, byLabel, click, clickAsync, flush, mount, type, visibleText } from '../../../test/dom';
import type { Mounted } from '../../../test/dom';
import type { AgentVersion } from '../../../services/agentVersionsApi';

const { state, versions, createDraft, publish } = vi.hoisted(() => ({
  state: vi.fn(),
  versions: vi.fn(),
  createDraft: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('../../../services/agentVersionsApi', () => ({
  agentVersionsApi: { state, versions, createDraft, publish },
}));

import AgentVersionEditor from './AgentVersionEditor';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const published: AgentVersion = {
  id: 'version-1',
  agent_id: 7,
  version: 1,
  description: 'Опубликованное описание',
  system_prompt: 'Первая строка\nСтарая строка',
  status: 'published',
  base_version_id: null,
  created_by: 'admin@linkeon.io',
  created_at: '2026-01-01T10:00:00.000Z',
  published_at: '2026-01-01T11:00:00.000Z',
  published_by: 'admin@linkeon.io',
};

const draft: AgentVersion = {
  ...published,
  id: 'version-2',
  version: 2,
  description: 'Черновое описание',
  system_prompt: 'Черновой промпт',
  status: 'draft',
  base_version_id: 'version-1',
  created_at: '2026-01-02T10:00:00.000Z',
  published_at: null,
  published_by: null,
};

let mounted: Mounted | undefined;

const renderEditor = async () => {
  mounted = mount(
    <AgentVersionEditor
      agentId={7}
      initialDescription="Описание из списка"
      initialPrompt="Промпт из списка"
    />,
  );
  await flush();
  await flush();
};

const descriptionField = () => byLabel(mounted!.container, /Описание ассистента/);
const promptField = () => byLabel(mounted!.container, /Системный промпт/);

beforeEach(() => {
  state.mockReset();
  versions.mockReset();
  createDraft.mockReset();
  publish.mockReset();
  state.mockResolvedValue({ published, draft });
  versions.mockResolvedValue([draft, published]);
  createDraft.mockResolvedValue(draft);
  publish.mockResolvedValue(published);
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.restoreAllMocks();
});

describe('AgentVersionEditor', () => {
  it('блокирует поля до завершения начальной загрузки', async () => {
    const load = deferred<{ published: AgentVersion | null; draft: AgentVersion | null }>();
    state.mockReturnValue(load.promise);
    mounted = mount(
      <AgentVersionEditor agentId={7} initialDescription="Исходное" initialPrompt="Исходный" />,
    );

    expect(descriptionField()!.disabled).toBe(true);
    expect(promptField()!.disabled).toBe(true);
    await actAsync(() => load.resolve({ published, draft }));
    await flush();
    expect(descriptionField()!.disabled).toBe(false);
    expect(promptField()!.value).toBe('Черновой промпт');
  });

  it('блокирует новые правки на время сохранения и применяет ответ только к отправленному тексту', async () => {
    const saving = deferred<AgentVersion>();
    createDraft.mockReturnValue(saving.promise);
    await renderEditor();
    type(descriptionField()!, 'Отправленное описание');
    type(promptField()!, 'Отправленный промпт');

    click(byButton(mounted!.container, /Сохранить черновик/)!);
    expect(descriptionField()!.disabled).toBe(true);
    expect(promptField()!.disabled).toBe(true);
    await actAsync(() => saving.resolve({
      ...draft,
      id: 'version-3',
      description: 'Ответ сервера',
      system_prompt: 'Ответ сервера',
    }));
    await flush();

    expect(descriptionField()!.value).toBe('Отправленное описание');
    expect(promptField()!.value).toBe('Отправленный промпт');
    expect(descriptionField()!.disabled).toBe(false);
  });

  it('блокирует правки при публикации и публикует ровно просмотренный diff', async () => {
    const publishing = deferred<AgentVersion>();
    const publishedResult: AgentVersion = {
      ...draft,
      status: 'published',
      published_at: '2026-01-03T10:00:00.000Z',
      published_by: 'admin@linkeon.io',
    };
    publish.mockReturnValue(publishing.promise);
    state
      .mockResolvedValueOnce({ published, draft })
      .mockResolvedValueOnce({ published: publishedResult, draft: null });
    await renderEditor();
    click(byButton(mounted!.container, /Показать diff/)!);
    expect(mounted!.container.querySelector('.added')?.textContent).toContain('Черновой промпт');

    click(byButton(mounted!.container, /^Опубликовать$/)!);
    expect(descriptionField()!.disabled).toBe(true);
    expect(promptField()!.disabled).toBe(true);
    expect(publish).toHaveBeenCalledWith(7, 'version-2', 'version-1');
    await actAsync(() => publishing.resolve(publishedResult));
    await flush();

    expect(promptField()!.value).toBe('Черновой промпт');
    expect(promptField()!.readOnly).toBe(true);
  });

  it('сохраняет точный черновик с текущей базой и не публикует его', async () => {
    await renderEditor();
    expect(descriptionField()?.value).toBe('Черновое описание');
    expect(promptField()?.value).toBe('Черновой промпт');

    type(descriptionField()!, 'Новое описание без сокращений');
    type(promptField()!, 'Новый промпт\nВторая строка');
    await clickAsync(byButton(mounted!.container, /Сохранить черновик/)!);
    await flush();

    expect(createDraft).toHaveBeenCalledWith(7, {
      description: 'Новое описание без сокращений',
      system_prompt: 'Новый промпт\nВторая строка',
      base_version_id: 'version-2',
    });
    expect(publish).not.toHaveBeenCalled();
    expect(descriptionField()?.value).toBe('Новое описание без сокращений');
    expect(promptField()?.value).toBe('Новый промпт\nВторая строка');
    expect(visibleText(mounted!.container)).toContain('Черновик сохранён');
  });

  it('при повторном сохранении использует id черновика из предыдущего ответа', async () => {
    createDraft
      .mockResolvedValueOnce({ ...draft, id: 'version-3', base_version_id: 'version-2' })
      .mockResolvedValueOnce({ ...draft, id: 'version-4', base_version_id: 'version-3' });
    await renderEditor();

    type(descriptionField()!, 'Первое сохранение');
    await clickAsync(byButton(mounted!.container, /Сохранить черновик/)!);
    await flush();
    type(descriptionField()!, 'Второе сохранение');
    await clickAsync(byButton(mounted!.container, /Сохранить черновик/)!);
    await flush();

    expect(createDraft.mock.calls.map((call) => call[1].base_version_id)).toEqual([
      'version-2',
      'version-3',
    ]);
  });

  it('отмена подтверждения при смене режима сохраняет текст и черновой режим', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderEditor();
    type(promptField()!, 'Несохранённая правка');

    click(byButton(mounted!.container, /^Опубликовано$/)!);

    expect(confirm).toHaveBeenCalledOnce();
    expect(promptField()?.value).toBe('Несохранённая правка');
    expect(byButton(mounted!.container, /^Черновик$/)?.getAttribute('aria-pressed')).toBe('true');
    expect(visibleText(mounted!.container)).not.toContain('Только чтение');
  });

  it('блокирует публикацию до сохранения и просмотра diff, затем передаёт ожидаемую published-версию', async () => {
    const publishedResult: AgentVersion = {
      ...draft,
      id: 'version-2',
      description: 'Проверенное описание',
      system_prompt: 'Проверенный промпт',
      status: 'published',
      published_at: '2026-01-03T10:00:00.000Z',
      published_by: 'admin@linkeon.io',
    };
    createDraft.mockResolvedValue({
      ...draft,
      description: 'Проверенное описание',
      system_prompt: 'Проверенный промпт',
    });
    publish.mockResolvedValue(publishedResult);
    state.mockResolvedValueOnce({ published, draft });
    state.mockResolvedValueOnce({ published: publishedResult, draft: null });

    await renderEditor();
    type(descriptionField()!, 'Проверенное описание');
    type(promptField()!, 'Проверенный промпт');
    expect(byButton(mounted!.container, /^Опубликовать$/)!.disabled).toBe(true);
    expect(visibleText(mounted!.container)).toContain('Сначала сохраните черновик и посмотрите diff');

    await clickAsync(byButton(mounted!.container, /Сохранить черновик/)!);
    await flush();
    expect(byButton(mounted!.container, /^Опубликовать$/)!.disabled).toBe(true);
    expect(visibleText(mounted!.container)).toContain('Сначала сохраните черновик и посмотрите diff');
    expect(publish).not.toHaveBeenCalled();

    click(byButton(mounted!.container, /Показать diff/)!);
    expect(mounted!.container.querySelector('.removed')?.textContent).toContain('−');
    expect(mounted!.container.querySelector('.added')?.textContent).toContain('+');
    expect(byButton(mounted!.container, /^Опубликовать$/)!.disabled).toBe(false);
    await clickAsync(byButton(mounted!.container, /^Опубликовать$/)!);
    await flush();

    expect(publish).toHaveBeenCalledWith(7, 'version-2', 'version-1');
    expect(versions).toHaveBeenCalledWith(7, 50);
    expect(visibleText(mounted!.container)).toContain('Только чтение');
    expect(promptField()?.value).toBe('Проверенный промпт');
  });

  it('после успешной публикации ошибку refresh показывает отдельно и даёт повторить', async () => {
    const publishedResult: AgentVersion = {
      ...draft,
      status: 'published',
      published_at: '2026-01-03T10:00:00.000Z',
      published_by: 'admin@linkeon.io',
    };
    publish.mockResolvedValue(publishedResult);
    state
      .mockResolvedValueOnce({ published, draft })
      .mockRejectedValueOnce(new Error('Сеть недоступна'));
    await renderEditor();
    click(byButton(mounted!.container, /Показать diff/)!);
    await clickAsync(byButton(mounted!.container, /^Опубликовать$/)!);
    await flush();
    await flush();

    expect(visibleText(mounted!.container)).toContain('Опубликовано, но не удалось обновить состояние');
    expect(visibleText(mounted!.container)).not.toContain('Не удалось опубликовать версию');
    expect(promptField()?.value).toBe('Черновой промпт');
    expect(promptField()?.readOnly).toBe(true);

    state.mockResolvedValue({ published: publishedResult, draft: null });
    await clickAsync(byButton(mounted!.container, /Повторить обновление/)!);
    await flush();
    expect(visibleText(mounted!.container)).not.toContain('Опубликовано, но не удалось обновить состояние');
    expect(state).toHaveBeenCalledTimes(3);
  });

  it('ошибка refresh после конфликта видна, имеет retry и не затирает текст', async () => {
    createDraft.mockRejectedValue({ status: 409 });
    state
      .mockResolvedValueOnce({ published, draft })
      .mockRejectedValueOnce(new Error('Сеть недоступна'));
    await renderEditor();
    type(promptField()!, 'Локальный несохранённый промпт');
    await clickAsync(byButton(mounted!.container, /Сохранить черновик/)!);
    await flush();
    await flush();

    expect(visibleText(mounted!.container)).toContain('Версия изменилась другим администратором');
    expect(visibleText(mounted!.container)).toContain('Не удалось обновить состояние после конфликта');
    expect(promptField()?.value).toBe('Локальный несохранённый промпт');

    state.mockResolvedValue({ published, draft });
    await clickAsync(byButton(mounted!.container, /Повторить обновление/)!);
    await flush();
    expect(visibleText(mounted!.container)).not.toContain('Не удалось обновить состояние после конфликта');
    expect(promptField()?.value).toBe('Локальный несохранённый промпт');
    expect(state).toHaveBeenCalledTimes(3);
  });

  it('конфликт 409 перезагружает состояние для diff, но не затирает локальный текст', async () => {
    const remotePublished: AgentVersion = {
      ...published,
      id: 'version-remote',
      system_prompt: 'Промпт другого администратора',
    };
    const remoteDraft: AgentVersion = {
      ...draft,
      id: 'draft-remote',
      base_version_id: 'version-remote',
      system_prompt: 'Черновик другого администратора',
    };
    createDraft.mockRejectedValue({ status: 409, message: 'Версия устарела' });
    state
      .mockResolvedValueOnce({ published, draft })
      .mockResolvedValueOnce({ published: remotePublished, draft: remoteDraft });
    versions.mockResolvedValue([remoteDraft, remotePublished]);
    await renderEditor();
    type(descriptionField()!, 'Моё конфликтующее описание');
    type(promptField()!, 'Мой конфликтующий промпт');

    await clickAsync(byButton(mounted!.container, /Сохранить черновик/)!);
    await flush();
    await flush();

    expect(state).toHaveBeenCalledTimes(2);
    expect(versions).toHaveBeenCalledWith(7, 50);
    expect(descriptionField()?.value).toBe('Моё конфликтующее описание');
    expect(promptField()?.value).toBe('Мой конфликтующий промпт');
    expect(visibleText(mounted!.container)).toContain('Версия изменилась другим администратором');

    click(byButton(mounted!.container, /Показать diff/)!);
    expect(mounted!.container.querySelector('.removed')?.textContent).toContain('Промпт другого администратора');
    expect(mounted!.container.querySelector('.added')?.textContent).toContain('Мой конфликтующий промпт');
    expect(promptField()?.value).toBe('Мой конфликтующий промпт');
  });

  it('конфликт публикации перезагружает состояние и оставляет текст черновика', async () => {
    const remotePublished: AgentVersion = {
      ...published,
      id: 'version-remote',
      system_prompt: 'Опубликовано другим администратором',
    };
    publish.mockRejectedValue({ status: 409 });
    state
      .mockResolvedValueOnce({ published, draft })
      .mockResolvedValueOnce({ published: remotePublished, draft });
    versions.mockResolvedValue([draft, remotePublished]);
    await renderEditor();
    click(byButton(mounted!.container, /Показать diff/)!);

    await clickAsync(byButton(mounted!.container, /^Опубликовать$/)!);
    await flush();
    await flush();

    expect(state).toHaveBeenCalledTimes(2);
    expect(versions).toHaveBeenCalledWith(7, 50);
    expect(visibleText(mounted!.container)).toContain('Версия изменилась другим администратором');
    expect(promptField()?.value).toBe('Черновой промпт');
    expect(byButton(mounted!.container, /^Черновик$/)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('конфликт создания из истории перезагружает состояние и историю', async () => {
    const old: AgentVersion = { ...published, id: 'version-old', status: 'superseded' };
    const remotePublished: AgentVersion = { ...published, id: 'version-remote' };
    createDraft.mockRejectedValue({ status: 409 });
    state
      .mockResolvedValueOnce({ published, draft: null })
      .mockResolvedValueOnce({ published: remotePublished, draft });
    versions
      .mockResolvedValueOnce([published, old])
      .mockResolvedValueOnce([draft, remotePublished, old]);
    await renderEditor();
    await clickAsync(byButton(mounted!.container, /^История$/)!);
    await flush();

    const oldRow = mounted!.container.querySelector('[data-testid="agent-version-version-old"]')!;
    await clickAsync(byButton(oldRow as HTMLElement, /Создать черновик из версии/)!);
    await flush();
    await flush();

    expect(state).toHaveBeenCalledTimes(2);
    expect(versions).toHaveBeenCalledTimes(2);
    expect(visibleText(mounted!.container)).toContain('Версия изменилась другим администратором');
    expect(byButton(mounted!.container, /^История$/)?.getAttribute('aria-pressed')).toBe('true');
    expect(mounted!.container.querySelector('[data-testid="agent-version-version-remote"]')).not.toBeNull();
  });

  it('создаёт черновик из старой версии с последней версией в качестве базы', async () => {
    const old: AgentVersion = {
      ...published,
      id: 'version-old',
      version: 1,
      description: 'Старое описание',
      system_prompt: 'Старый промпт',
      status: 'superseded',
      created_by: 'editor@linkeon.io',
      published_at: null,
      published_by: null,
    };
    const latest: AgentVersion = {
      ...published,
      id: 'version-latest',
      version: 3,
      description: 'Актуальное описание',
      system_prompt: 'Актуальный промпт',
    };
    const fromOld: AgentVersion = {
      ...old,
      id: 'version-4',
      version: 4,
      status: 'draft',
      base_version_id: 'version-latest',
    };
    state.mockResolvedValue({ published: latest, draft: null });
    versions.mockResolvedValue([latest, old]);
    createDraft.mockResolvedValue(fromOld);

    await renderEditor();
    await clickAsync(byButton(mounted!.container, /^История$/)!);
    await flush();

    const oldRow = mounted!.container.querySelector('[data-testid="agent-version-version-old"]')!;
    expect(oldRow.textContent).toContain('1');
    expect(oldRow.textContent).toContain('Заменена');
    expect(oldRow.textContent).toContain('editor@linkeon.io');
    expect(oldRow.textContent).not.toContain('Старый промпт');

    const expandButton = byButton(oldRow as HTMLElement, /Показать промпт/)!;
    const promptContainerId = expandButton.getAttribute('aria-controls');
    expect(promptContainerId).toBeTruthy();
    click(expandButton);
    const historicalPrompt = oldRow.querySelector('textarea')!;
    expect(historicalPrompt.id).toBe(promptContainerId);
    expect(historicalPrompt.readOnly).toBe(true);
    expect(historicalPrompt.value).toBe('Старый промпт');
    click(byButton(oldRow as HTMLElement, /Скрыть промпт/)!);
    expect(oldRow.querySelector('textarea')).toBeNull();
    click(byButton(oldRow as HTMLElement, /Показать промпт/)!);
    expect(oldRow.querySelector('textarea')!.id).toBe(promptContainerId);

    await clickAsync(byButton(oldRow as HTMLElement, /Создать черновик из версии/)!);
    await flush();

    expect(createDraft).toHaveBeenCalledWith(7, {
      description: 'Старое описание',
      system_prompt: 'Старый промпт',
      base_version_id: 'version-latest',
    });
    expect(descriptionField()?.value).toBe('Старое описание');
    expect(promptField()?.value).toBe('Старый промпт');
    expect(byButton(mounted!.container, /^Черновик$/)?.getAttribute('aria-pressed')).toBe('true');
  });
});
