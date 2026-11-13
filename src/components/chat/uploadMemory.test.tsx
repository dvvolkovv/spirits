// src/components/chat/uploadMemory.test.tsx
// @vitest-environment jsdom
//
// Память загрузок чата (Task 4, фронт):
// 1. маленький текстовый файл больше НЕ уходит инлайном (file.text() + fenced
//    промпт) — все файлы идут мультипартом, чтобы оригиналы попадали в реестр;
// 2. приватная ссылка /webhook/chat-uploads/:id скачивается через apiClient
//    (fetch с Bearer), а не window.open — тот не может послать Authorization;
// 3. строка 📎 [имя](/webhook/chat-uploads/<uuid>) в сообщении пользователя
//    рисуется кликабельной ссылкой, а не сырым markdown-текстом;
// 4. событие стрима upload_persist_failed — НЕфатальное предупреждение мимо
//    общего catch с chat.file_error_fallback;
// 5. пустые ответы ассистента из истории (след persist-on-empty на бэке) не
//    доезжают до ленты.
//
// Поведенческие тесты меряют вынесенные чистые куски (chatUploads.tsx) на
// стенде src/test/dom.tsx; связку с ChatInterface сторожат wiring-проверки
// исходника — тот же приём, что в filesWiring/cabinetLinksWiring (компонент
// на 3600 строк не монтируется ни в одном тесте репозитория).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mount, click } from '../../test/dom';

vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

import { apiClient } from '../../services/apiClient';
import toast from 'react-hot-toast';
import { isChatUploadLink, openChatUpload, renderUserMessageContent } from './chatUploads';

const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');
const HREF = '/webhook/chat-uploads/11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom не реализует object URL —openChatUpload опирается на них.
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock-url');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
});

describe('приватная ссылка скачивается через apiClient с JWT, а не window.open', () => {
  it('узнаётся по префиксу', () => {
    expect(isChatUploadLink(HREF)).toBe(true);
    expect(isChatUploadLink('/profile?open=zoom')).toBe(false);
    expect(isChatUploadLink('https://my.linkeon.io/webhook/chat-uploads/x')).toBe(false);
  });

  it('файл забирается через apiClient.get и открывается blob-адресом, не сырым href', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['file-bytes']),
    });

    await openChatUpload(HREF, 'Не удалось скачать файл');

    // apiClient — fetch-обёртка репозитория: responseType у него нет,
    // JWT добавляет сам request(), тело читаем через response.blob().
    expect(apiClient.get).toHaveBeenCalledWith(HREF);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalledWith(HREF, expect.anything(), expect.anything());
    expect(openSpy.mock.calls[0][0]).toBe('blob:mock-url');
    openSpy.mockRestore();
  });

  it('отказ сервера — тост с внятным текстом, window.open не зовётся', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 });

    await openChatUpload(HREF, 'Не удалось скачать файл');

    expect(toast.error).toHaveBeenCalledWith('Не удалось скачать файл');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('сетевое исключение — тот же тост, ничего не открывается', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    await openChatUpload(HREF, 'Не удалось скачать файл');

    expect(toast.error).toHaveBeenCalledWith('Не удалось скачать файл');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe('строка 📎 в сообщении пользователя рисуется ссылкой', () => {
  it('имя — кликабельная ссылка, клик отдаёт адрес обработчику; сырой markdown не виден', () => {
    const onLink = vi.fn();
    const { container, unmount } = mount(
      <p>{renderUserMessageContent(`📎 [отчёт.pdf](${HREF})\nСделай саммари`, onLink)}</p>,
    );

    expect(container.textContent).toContain('📎');
    expect(container.textContent).toContain('отчёт.pdf');
    expect(container.textContent).toContain('Сделай саммари');
    expect(container.textContent).not.toContain('](');
    expect(container.textContent).not.toContain('[отчёт');

    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    click(a!);
    expect(onLink).toHaveBeenCalledWith(HREF);
    unmount();
  });

  it('несколько вложений в одной строке — каждое своя ссылка', () => {
    const onLink = vi.fn();
    const content = '📎 [a.pdf](/webhook/chat-uploads/uuid-1), [b.pdf](/webhook/chat-uploads/uuid-2)';
    const { container, unmount } = mount(<p>{renderUserMessageContent(content, onLink)}</p>);

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
    click(links[1]);
    expect(onLink).toHaveBeenCalledWith('/webhook/chat-uploads/uuid-2');
    expect(container.textContent).toContain('a.pdf');
    expect(container.textContent).toContain('b.pdf');
    unmount();
  });

  it('текст без вложений возвращается как есть — ни маркдауна, ни элементов', () => {
    const onLink = vi.fn();
    const plain = 'привет\nкак дела';
    expect(renderUserMessageContent(plain, onLink)).toBe(plain);

    const { container, unmount } = mount(<p>{renderUserMessageContent(plain, onLink)}</p>);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe(plain);
    unmount();
  });

  it('прежнее написание истории (📎 имя без ссылки) остаётся текстом', () => {
    const onLink = vi.fn();
    const { container, unmount } = mount(
      <p>{renderUserMessageContent('📎 a.pdf, b.pdf\nСделай саммари', onLink)}</p>,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('📎 a.pdf, b.pdf');
    unmount();
  });
});

describe('связка ChatInterface: единый multipart вместо инлайна', () => {
  const from = SRC.indexOf('const handleFileTaskSubmit = async');
  const body = SRC.slice(from, SRC.indexOf('const handleSelectAssistant', from));

  it('инлайн-ветка file.text() с fenced-промптом убрана', () => {
    expect(from).toBeGreaterThan(-1);
    expect(body).not.toContain('file.text()');
    expect(body).not.toContain('isTextFile');
    expect(body).not.toContain('Содержимое:');
    expect(body).not.toContain('sendMessageToAI(');
  });

  it('оптимистичный пузырь по-прежнему пишется attachmentTurnText', () => {
    expect(body).toContain('attachmentTurnText(');
  });

  it('все файлы идут одним multipart-эндпоинтом', () => {
    expect(body).toContain("apiClient.post('/webhook/agent/upload-and-chat', formData)");
  });
});

describe('связка ChatInterface: приватная ссылка до общего пути навигации', () => {
  const from = SRC.indexOf('const handleLinkNavigation = useCallback');
  const body = SRC.slice(from, SRC.indexOf('}, [navigate', from));

  it('ветка chat-uploads стоит ДО chatLinkPath и зовёт openChatUpload', () => {
    expect(from).toBeGreaterThan(-1);
    expect(body).toContain('isChatUploadLink(url)');
    expect(body).toContain('openChatUpload(url');
    expect(body.indexOf('isChatUploadLink')).toBeLessThan(body.indexOf('chatLinkPath(url)'));
  });
});

describe('связка ChatInterface: upload_persist_failed — предупреждение, не провал хода', () => {
  it('ветка события живёт в цепочке multipart-парсера и показывает t(chat.upload_persist_failed)', () => {
    const at = SRC.indexOf('const event = JSON.parse(line);');
    expect(at).toBeGreaterThan(-1);
    const parser = SRC.slice(at, SRC.indexOf('if (noTokens) break;', at));
    expect(parser).toContain("event.type === 'upload_persist_failed'");
    expect(parser).toContain("t('chat.upload_persist_failed')");
  });

  it('общий catch multipart-пути остаётся с file_error_fallback', () => {
    expect(SRC).toContain("t('chat.file_error_fallback')");
  });

  it('пузырь пользователя рисует 📎-строки через renderUserMessageContent', () => {
    expect(SRC).toContain('renderUserMessageContent(message.content, handleLinkNavigation)');
  });
});

describe('связка ChatInterface: пустые ответы ассистента не доезжают до ленты', () => {
  it('dropEmptyAssistantMessages применён на всех выборках истории', () => {
    const uses = SRC.split('dropEmptyAssistantMessages(').length - 1;
    // начальная загрузка, поллинг (pullHistoryOnce), догрузка старых
    expect(uses).toBeGreaterThanOrEqual(3);
  });
});

describe('локали: ключи предупреждения и ошибки скачивания', () => {
  const codes = ['ru', 'en', 'es', 'de', 'fr', 'zh', 'pt'] as const;

  for (const code of codes) {
    it(`chat.upload_persist_failed и chat.upload_download_error есть в ${code}.json`, () => {
      const loc = JSON.parse(
        readFileSync(join(__dirname, `../../i18n/locales/${code}.json`), 'utf8'),
      );
      expect(typeof loc.chat?.upload_persist_failed, code).toBe('string');
      expect(loc.chat.upload_persist_failed.length, code).toBeGreaterThan(0);
      expect(typeof loc.chat?.upload_download_error, code).toBe('string');
      expect(loc.chat.upload_download_error.length, code).toBeGreaterThan(0);
    });
  }

  it('ru — тексты по спеке бэкенда', () => {
    const ru = JSON.parse(readFileSync(join(__dirname, '../../i18n/locales/ru.json'), 'utf8'));
    expect(ru.chat.upload_persist_failed).toBe('Файл не сохранён для будущих разговоров');
  });

  it('en — текст по спеке', () => {
    const en = JSON.parse(readFileSync(join(__dirname, '../../i18n/locales/en.json'), 'utf8'));
    expect(en.chat.upload_persist_failed).toBe('File was not saved for future conversations');
  });
});
