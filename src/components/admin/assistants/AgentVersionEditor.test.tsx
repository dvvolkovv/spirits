// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actAsync, byButton, byLabel, click, clickAsync, doubleClick, flush, mount, type, visibleText } from '../../../test/dom';
import type { Mounted } from '../../../test/dom';
import type { AgentVersion } from '../../../services/agentVersionsApi';

const { state, versions, createDraft, publish, testVersion } = vi.hoisted(() => ({
  state: vi.fn(),
  versions: vi.fn(),
  createDraft: vi.fn(),
  publish: vi.fn(),
  testVersion: vi.fn(),
}));

vi.mock('../../../services/agentVersionsApi', () => ({
  agentVersionsApi: { state, versions, createDraft, publish, test: testVersion },
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

const renderEditor = async (onDirtyChange?: (dirty: boolean) => void) => {
  mounted = mount(
    <AgentVersionEditor
      agentId={7}
      initialDescription="Описание из списка"
      initialPrompt="Промпт из списка"
      onDirtyChange={onDirtyChange}
    />,
  );
  await flush();
  await flush();
};

const descriptionField = () => byLabel(mounted!.container, /Описание ассистента/);
const promptField = () => byLabel(mounted!.container, /Системный промпт/);
const testInput = () => mounted!.container.querySelector<HTMLTextAreaElement>(
  '[data-testid="agent-test-input"]',
);

beforeEach(() => {
  state.mockReset();
  versions.mockReset();
  createDraft.mockReset();
  publish.mockReset();
  testVersion.mockReset();
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

    expect(descriptionField()!.value).toBe('Ответ сервера');
    expect(promptField()!.value).toBe('Ответ сервера');
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
    createDraft.mockResolvedValue({
      ...draft,
      description: 'Новое описание без сокращений',
      system_prompt: 'Новый промпт\nВторая строка',
    });
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

  it('remote draft C после конфликта публикации не заменяет local A и остаётся заблокированным', async () => {
    const remotePublished: AgentVersion = {
      ...published,
      id: 'version-remote',
      system_prompt: 'Опубликовано другим администратором',
    };
    const remoteDraft: AgentVersion = {
      ...draft,
      id: 'version-c',
      description: 'Описание C',
      system_prompt: 'Промпт C',
      base_version_id: 'version-remote',
    };
    publish.mockRejectedValue({ status: 409 });
    state
      .mockResolvedValueOnce({ published, draft })
      .mockResolvedValueOnce({ published: remotePublished, draft: remoteDraft });
    versions.mockResolvedValue([remoteDraft, remotePublished]);
    await renderEditor();
    click(byButton(mounted!.container, /Показать diff/)!);
    await clickAsync(byButton(mounted!.container, /^Опубликовать$/)!);
    await flush();
    await flush();

    expect(promptField()?.value).toBe('Черновой промпт');
    expect(visibleText(mounted!.container)).toContain('Версия изменилась другим администратором');
    expect(testInput()).toBeNull();

    click(byButton(mounted!.container, /Показать diff/)!);
    expect(byButton(mounted!.container, /^Опубликовать$/)!.disabled).toBe(true);
    expect(testInput()).toBeNull();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(testVersion).not.toHaveBeenCalled();
  });

  it('remote draft C при refresh после публикации не затирает local A и требует rebase', async () => {
    const publishedResult: AgentVersion = {
      ...draft,
      status: 'published',
      published_at: '2026-01-03T10:00:00.000Z',
      published_by: 'admin@linkeon.io',
    };
    const remoteDraft: AgentVersion = {
      ...draft,
      id: 'version-c',
      description: 'Описание C',
      system_prompt: 'Промпт C',
    };
    publish.mockResolvedValue(publishedResult);
    state
      .mockResolvedValueOnce({ published, draft })
      .mockResolvedValueOnce({ published: publishedResult, draft: remoteDraft });
    versions.mockResolvedValue([remoteDraft, publishedResult]);
    await renderEditor();
    click(byButton(mounted!.container, /Показать diff/)!);
    await clickAsync(byButton(mounted!.container, /^Опубликовать$/)!);
    await flush();
    await flush();

    expect(promptField()?.value).toBe('Черновой промпт');
    expect(promptField()?.readOnly).toBe(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    click(byButton(mounted!.container, /^Черновик$/)!);

    expect(confirm).toHaveBeenCalledOnce();
    expect(promptField()?.value).toBe('Черновой промпт');
    expect(byButton(mounted!.container, /^Опубликовано$/)?.getAttribute('aria-pressed')).toBe('true');
    expect(testInput()).toBeNull();
    expect(testVersion).not.toHaveBeenCalled();
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

  it('принимает server-trimmed текст после сохранения и оставляет test/publish согласованными', async () => {
    const saved: AgentVersion = {
      ...draft,
      id: 'version-normalized',
      description: 'Нормализованное описание',
      system_prompt: 'Нормализованный промпт',
    };
    createDraft.mockResolvedValue(saved);
    await renderEditor();
    type(descriptionField()!, '  Нормализованное описание  ');
    type(promptField()!, '  Нормализованный промпт\n');

    await clickAsync(byButton(mounted!.container, /Сохранить черновик/)!);
    await flush();

    expect(descriptionField()?.value).toBe('Нормализованное описание');
    expect(promptField()?.value).toBe('Нормализованный промпт');
    click(byButton(mounted!.container, /Показать diff/)!);
    expect(byButton(mounted!.container, /^Опубликовать$/)!.disabled).toBe(false);
    expect(testInput()).not.toBeNull();
  });

  it('тестирует сохранённый черновик и показывает ответ со стоимостью в токенах', async () => {
    const reply = deferred<{ text: string; session_id: string; tokens: number }>();
    testVersion.mockReturnValue(reply.promise);
    await renderEditor();

    expect(testInput()).not.toBeNull();
    type(testInput()!, '  Проверь сохранённый промпт  ');
    const sendButton = byButton(mounted!.container, /^Отправить$/)!;
    click(sendButton);

    expect(sendButton.disabled).toBe(true);
    expect(visibleText(mounted!.container)).toContain('Отправка');
    expect(visibleText(mounted!.container)).toContain('Проверь сохранённый промпт');
    await actAsync(() => reply.resolve({
      text: 'Ответ тестируемой версии',
      session_id: 'session-1',
      tokens: 123,
    }));
    await flush();

    expect(testVersion).toHaveBeenCalledWith(7, {
      version_id: 'version-2',
      message: 'Проверь сохранённый промпт',
      session_id: undefined,
    });
    expect(visibleText(mounted!.container)).toContain('Ответ тестируемой версии');
    expect(visibleText(mounted!.container)).toContain('123');
    expect(testInput()?.value).toBe('');
  });

  it('передаёт session_id из ответа во второй тестовый запрос', async () => {
    testVersion
      .mockResolvedValueOnce({ text: 'Первый ответ', session_id: 'session-1', tokens: 10 })
      .mockResolvedValueOnce({ text: 'Второй ответ', session_id: 'session-1', tokens: 20 });
    await renderEditor();

    type(testInput()!, 'Первый вопрос');
    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);
    type(testInput()!, 'Второй вопрос');
    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);

    expect(testVersion).toHaveBeenNthCalledWith(2, 7, {
      version_id: 'version-2',
      message: 'Второй вопрос',
      session_id: 'session-1',
    });
    expect(visibleText(mounted!.container)).toContain('Первый ответ');
    expect(visibleText(mounted!.container)).toContain('Второй ответ');
  });

  it('начинает новый тест без старых сообщений и session_id', async () => {
    testVersion
      .mockResolvedValueOnce({ text: 'Старый ответ', session_id: 'session-1', tokens: 10 })
      .mockResolvedValueOnce({ text: 'Новый ответ', session_id: 'session-2', tokens: 20 });
    await renderEditor();
    type(testInput()!, 'Старый вопрос');
    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);
    expect(visibleText(mounted!.container)).toContain('Старый ответ');

    click(byButton(mounted!.container, /^Новый тест$/)!);
    expect(visibleText(mounted!.container)).not.toContain('Старый вопрос');
    expect(visibleText(mounted!.container)).not.toContain('Старый ответ');

    type(testInput()!, 'Новый вопрос');
    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);
    expect(testVersion).toHaveBeenNthCalledWith(2, 7, {
      version_id: 'version-2',
      message: 'Новый вопрос',
      session_id: undefined,
    });
  });

  it('при ошибке теста сохраняет ввод, сообщения и чистое состояние редактора', async () => {
    const onDirtyChange = vi.fn();
    testVersion
      .mockResolvedValueOnce({ text: 'Сохранённый ответ', session_id: 'session-1', tokens: 10 })
      .mockRejectedValueOnce(new Error('Тестовый контур недоступен'));
    await renderEditor(onDirtyChange);
    type(testInput()!, 'Первый вопрос');
    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);

    type(testInput()!, 'Незавершённый вопрос');
    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);
    await flush();

    expect(testInput()?.value).toBe('Незавершённый вопрос');
    expect(visibleText(mounted!.container)).toContain('Первый вопрос');
    expect(visibleText(mounted!.container)).toContain('Сохранённый ответ');
    expect(visibleText(mounted!.container)).toContain('Незавершённый вопрос');
    expect(visibleText(mounted!.container)).toContain('Тестовый контур недоступен');
    expect(descriptionField()?.value).toBe('Черновое описание');
    expect(promptField()?.value).toBe('Черновой промпт');
    expect(byButton(mounted!.container, /Сохранить черновик/)?.disabled).toBe(true);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('не отправляет два платных теста при двойном клике в одном тике', async () => {
    const reply = deferred<{ text: string; session_id: string; tokens: number }>();
    testVersion.mockReturnValue(reply.promise);
    await renderEditor();
    type(testInput()!, 'Один вопрос');

    doubleClick(byButton(mounted!.container, /^Отправить$/)!);

    expect(testVersion).toHaveBeenCalledTimes(1);
    expect(mounted!.container.querySelectorAll('[aria-live], [role="status"], [role="log"]')).toHaveLength(1);
    await actAsync(() => reply.resolve({ text: 'Один ответ', session_id: 'session-1', tokens: 10 }));
    await flush();
    expect(visibleText(mounted!.container).match(/Один вопрос/g)).toHaveLength(1);
  });

  it('повторяет неудачный запрос без дублирования сообщения пользователя', async () => {
    const transcriptText = () => mounted!.container.querySelector('[role="log"]')?.textContent ?? '';
    testVersion
      .mockRejectedValueOnce(new Error('Временная ошибка'))
      .mockResolvedValueOnce({ text: 'Ответ после повтора', session_id: 'session-1', tokens: 10 });
    await renderEditor();
    type(testInput()!, 'Повторяемый вопрос');
    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);
    await flush();

    expect(testInput()?.value).toBe('Повторяемый вопрос');
    expect(transcriptText().match(/Повторяемый вопрос/g)).toHaveLength(1);

    await clickAsync(byButton(mounted!.container, /^Отправить$/)!);
    await flush();

    expect(testVersion).toHaveBeenCalledTimes(2);
    expect(testVersion).toHaveBeenNthCalledWith(2, 7, {
      version_id: 'version-2',
      message: 'Повторяемый вопрос',
      session_id: undefined,
    });
    expect(transcriptText().match(/Повторяемый вопрос/g)).toHaveLength(1);
    expect(visibleText(mounted!.container)).toContain('Ответ после повтора');
    expect(testInput()?.value).toBe('');
  });

  it('не показывает тест для несохранённых локальных правок', async () => {
    await renderEditor();
    expect(testInput()).not.toBeNull();

    type(promptField()!, 'Ещё не сохранённый промпт');

    expect(testInput()).toBeNull();
    expect(promptField()?.value).toBe('Ещё не сохранённый промпт');
    expect(testVersion).not.toHaveBeenCalled();
  });
});
