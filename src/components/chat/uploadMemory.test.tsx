// src/components/chat/uploadMemory.test.tsx
// @vitest-environment jsdom
//
// Память загрузок чата (Task 4, фронт):
// 1. маленький текстовый файл больше НЕ уходит инлайном (file.text() + fenced
//    промпт) — все файлы идут мультипартом, чтобы оригиналы попадали в реестр;
// 2. приватная ссылка /webhook/chat-uploads/:id скачивается через apiClient
//    (fetch с Bearer) и отдаётся программным <a download>, а НЕ window.open:
//    после await'ов пользовательский жест протухает, и мобильные (iOS Safari,
//    Capacitor WebView) блокируют окно молча — open возвращает null и не
//    бросает; download заодно сохраняет имя файла; повторные клики дедупятся;
// 3. строка 📎 [имя](/webhook/chat-uploads/<uuid>) в сообщении пользователя
//    рисуется кликабельной ссылкой (имя — с расэкранированием markdown),
//    доступной и с клавиатуры, а не сырым markdown-текстом;
// 4. событие стрима upload_persist_failed — НЕфатальное предупреждение мимо
//    общего catch с chat.file_error_fallback;
// 5. пустые ответы ассистента не доезжают до ленты — ни из истории (фильтр
//    dropEmptyAssistantMessages), ни из живого стрима (I2);
// 6. гейт догрузки истории — ответ сервера (data.hasMore), а не размер
//    отфильтрованной страницы (I6).
//
// Поведенческие тесты меряют вынесенные чистые куски (chatUploads.tsx) на
// стенде src/test/dom.tsx; связку с ChatInterface сторожат wiring-проверки
// исходника — тот же приём, что в filesWiring/cabinetLinksWiring (компонент
// на 3600 строк не монтируется ни в одном тесте репозитория).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mount, click, doubleClick } from '../../test/dom';

vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

import { apiClient } from '../../services/apiClient';
import toast from 'react-hot-toast';
import { isChatUploadLink, openChatUpload, renderUserMessageContent } from './chatUploads';

const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');
const HREF = '/webhook/chat-uploads/11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom не реализует object URL — openChatUpload опирается на них.
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock-url');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
});

/**
 * Перехват программных a.click(): реальный клик по anchor с href в jsdom
 * изображает навигацию (jsdomError-шум), а здесь важно, КАКОЙ элемент кликнут
 * и был ли он в документе в момент клика.
 */
function spyAnchorClicks(): {
  clicked: { el: HTMLAnchorElement; connectedAtClick: boolean }[];
  restore: () => void;
} {
  const clicked: { el: HTMLAnchorElement; connectedAtClick: boolean }[] = [];
  const spy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ el: this, connectedAtClick: this.isConnected });
    });
  return { clicked, restore: () => spy.mockRestore() };
}

describe('приватная ссылка скачивается через apiClient с JWT', () => {
  it('узнаётся по префиксу', () => {
    expect(isChatUploadLink(HREF)).toBe(true);
    expect(isChatUploadLink('/profile?open=zoom')).toBe(false);
    expect(isChatUploadLink('https://my.linkeon.io/webhook/chat-uploads/x')).toBe(false);
  });

  it('файл забирается через apiClient.get и скачивается программным <a download>, не window.open; revoke через 60 с', async () => {
    vi.useFakeTimers();
    try {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      const { clicked, restore } = spyAnchorClicks();
      // apiClient — fetch-обёртка репозитория: responseType у него нет,
      // JWT добавляет сам request(), тело читаем через response.blob().
      (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => new Blob(['file-bytes']),
      });

      await openChatUpload(HREF, 'Не удалось скачать файл', 'отчёт [финал].pdf');

      expect(apiClient.get).toHaveBeenCalledWith(HREF);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      // I1: window.open после двух await молча блокируется на мобильных —
      // путь открытия только anchor-download.
      expect(openSpy).not.toHaveBeenCalled();
      expect(clicked.length).toBe(1);
      const a = clicked[0];
      expect(a.el.getAttribute('href')).toBe('blob:mock-url');
      expect(a.el.getAttribute('download')).toBe('отчёт [финал].pdf');
      // Клик из документа: detached-элемент часть браузеров игнорирует.
      expect(a.connectedAtClick).toBe(true);
      // Сразу после клика blob ещё жив — загрузчик должен успеть его прочитать.
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(59_999);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      restore();
      openSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('имя не передано — берётся из Content-Disposition (filename*, затем filename=)', async () => {
    const { clicked, restore } = spyAnchorClicks();
    const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

    // Ответ same-origin — заголовок читаем свободно.
    get.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x']),
      headers: {
        get: (k: string) =>
          k === 'content-disposition'
            ? "attachment; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82.pdf"
            : null,
      },
    });
    await openChatUpload('/webhook/chat-uploads/cd-1', 'Не удалось скачать файл');
    expect(clicked[0].el.getAttribute('download')).toBe('отчёт.pdf');

    get.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x']),
      headers: {
        get: (k: string) =>
          k === 'content-disposition' ? 'attachment; filename="report final.pdf"' : null,
      },
    });
    await openChatUpload('/webhook/chat-uploads/cd-2', 'Не удалось скачать файл');
    expect(clicked[1].el.getAttribute('download')).toBe('report final.pdf');

    // Ни имени, ни заголовка — скачивание без download (имя выберет браузер).
    get.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['x']) });
    await openChatUpload('/webhook/chat-uploads/cd-3', 'Не удалось скачать файл');
    expect(clicked[2].el.hasAttribute('download')).toBe(false);
    restore();
  });

  it('отказ сервера — тост; ни object URL, ни anchor, ни window.open', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { clicked, restore } = spyAnchorClicks();
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 });

    await openChatUpload(HREF, 'Не удалось скачать файл');

    expect(toast.error).toHaveBeenCalledWith('Не удалось скачать файл');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(clicked.length).toBe(0);
    expect(openSpy).not.toHaveBeenCalled();
    restore();
    openSpy.mockRestore();
  });

  it('сетевое исключение — тот же тост, ничего не создаётся', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { clicked, restore } = spyAnchorClicks();
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    await openChatUpload(HREF, 'Не удалось скачать файл');

    expect(toast.error).toHaveBeenCalledWith('Не удалось скачать файл');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(clicked.length).toBe(0);
    expect(openSpy).not.toHaveBeenCalled();
    // Освобождать нечего: catch-путь revoke сторожит только уже созданный URL.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    restore();
    openSpy.mockRestore();
  });

  it('срыв ПОСЛЕ createObjectURL (a.click() бросает) — catch освобождает blob и показывает тост', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click failed');
    });
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['file-bytes']),
    });

    await openChatUpload(HREF, 'Не удалось скачать файл', 'a.pdf');

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(toast.error).toHaveBeenCalledWith('Не удалось скачать файл');
    clickSpy.mockRestore();
  });
});

describe('дедуп повторных кликов: одна загрузка на href (I3)', () => {
  it('два параллельных вызова одного href — вторая загрузка не стартует', async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => {
      release = r;
    });
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockReturnValue(gate);
    const { clicked, restore } = spyAnchorClicks();

    const first = openChatUpload(HREF, 'Не удалось скачать файл', 'a.pdf');
    const second = openChatUpload(HREF, 'Не удалось скачать файл', 'a.pdf');
    expect(apiClient.get).toHaveBeenCalledTimes(1);

    release({ ok: true, status: 200, blob: async () => new Blob(['x']) });
    await Promise.all([first, second]);
    expect(clicked.length).toBe(1);
    restore();
  });

  it('после завершения href снова доступен — finally чистит реестр', async () => {
    const { clicked, restore } = spyAnchorClicks();
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x']),
    });

    await openChatUpload(HREF, 'Не удалось скачать файл', 'a.pdf');
    await openChatUpload(HREF, 'Не удалось скачать файл', 'a.pdf');

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(clicked.length).toBe(2);
    restore();
  });

  it('двойной клик по ссылке в пузыре — одна загрузка', async () => {
    const { clicked, restore } = spyAnchorClicks();
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['x']),
    });
    const href = '/webhook/chat-uploads/dedup-dom';
    const pending: Promise<void>[] = [];
    const { container, unmount } = mount(
      <p>
        {renderUserMessageContent(`📎 [a.pdf](${href})`, (h, name) => {
          pending.push(openChatUpload(h, 'Не удалось скачать файл', name));
        })}
      </p>,
    );

    const a = container.querySelector('a')!;
    doubleClick(a);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    await Promise.all(pending);
    expect(clicked.length).toBe(1);
    unmount();
    restore();
  });
});

describe('строка 📎 в сообщении пользователя рисуется ссылкой', () => {
  it('имя — кликабельная ссылка, клик отдаёт адрес и имя обработчику; сырой markdown не виден', () => {
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
    // Имя пробрасывается вторым аргументом — оно станет download-именем файла.
    expect(onLink).toHaveBeenCalledWith(HREF, 'отчёт.pdf');
    unmount();
  });

  it('несколько вложений в одной строке — каждое своя ссылка', () => {
    const onLink = vi.fn();
    const content = '📎 [a.pdf](/webhook/chat-uploads/uuid-1), [b.pdf](/webhook/chat-uploads/uuid-2)';
    const { container, unmount } = mount(<p>{renderUserMessageContent(content, onLink)}</p>);

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
    click(links[1]);
    expect(onLink).toHaveBeenCalledWith('/webhook/chat-uploads/uuid-2', 'b.pdf');
    expect(container.textContent).toContain('a.pdf');
    expect(container.textContent).toContain('b.pdf');
    unmount();
  });

  // Бэк (spirits_back chat.controller.ts, markdownEscapeName) экранирует в
  // именах файлов `\`, `[`, `]` — в историю попадает `📎 [отчёт \[финал\].pdf](…)`.
  it('экранированные скобки в имени — ссылка узнаётся, имя показывается без бэкслэшей', () => {
    const onLink = vi.fn();
    const content = `📎 [отчёт \\[финал\\].pdf](${HREF})\nСделай саммари`;
    const { container, unmount } = mount(<p>{renderUserMessageContent(content, onLink)}</p>);

    expect(container.textContent).toContain('отчёт [финал].pdf');
    expect(container.textContent).not.toContain('\\');
    expect(container.textContent).toContain('Сделай саммари');

    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    click(a!);
    expect(onLink).toHaveBeenCalledWith(HREF, 'отчёт [финал].pdf');
    unmount();
  });

  it('экранированная «]» и бэкслэш в именах, две ссылки в одной строке', () => {
    const onLink = vi.fn();
    const content =
      '📎 [a\\]b.pdf](/webhook/chat-uploads/uuid-1) и [c\\\\d.pdf](/webhook/chat-uploads/uuid-2)';
    const { container, unmount } = mount(<p>{renderUserMessageContent(content, onLink)}</p>);

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0].textContent).toBe('a]b.pdf');
    expect(links[1].textContent).toBe('c\\d.pdf');
    expect(container.textContent).not.toContain('](');
    click(links[0]);
    expect(onLink).toHaveBeenCalledWith('/webhook/chat-uploads/uuid-1', 'a]b.pdf');
    unmount();
  });

  it('вложение доступно с клавиатуры: role, tabIndex, Enter и Space скачивают (I8)', () => {
    const onLink = vi.fn();
    const { container, unmount } = mount(
      <p>{renderUserMessageContent(`📎 [a.pdf](${HREF})`, onLink)}</p>,
    );
    const a = container.querySelector('a')!;
    // Без href элемент не фокусируем и не роль — чиним атрибутами.
    expect(a.getAttribute('role')).toBe('link');
    expect(a.getAttribute('tabindex')).toBe('0');

    act(() => {
      a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onLink).toHaveBeenCalledWith(HREF, 'a.pdf');

    act(() => {
      a.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onLink).toHaveBeenCalledTimes(2);

    // Прочие клавиши скачивание не запускают.
    act(() => {
      a.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(onLink).toHaveBeenCalledTimes(2);
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

  it('ветка chat-uploads стоит ДО chatLinkPath, зовёт openChatUpload и пробрасывает имя файла', () => {
    expect(from).toBeGreaterThan(-1);
    expect(body).toContain('(url: string, fileName?: string)');
    expect(body).toContain('isChatUploadLink(url)');
    expect(body).toContain("openChatUpload(url, t('chat.upload_download_error'), fileName)");
    expect(body.indexOf('isChatUploadLink')).toBeLessThan(body.indexOf('chatLinkPath(url)'));
  });

  it('колбэк держит свежий t: после смены языка текст тоста не устарел (I5)', () => {
    const end = SRC.indexOf('}, [navigate', from);
    expect(end).toBeGreaterThan(from);
    expect(SRC.slice(end, end + 30).startsWith('}, [navigate, t]);')).toBe(true);
  });
});

describe('связка ChatInterface: upload_persist_failed — предупреждение, не провал хода', () => {
  it('ветка события живёт в цепочке multipart-парсера и показывает t(chat.upload_persist_failed)', () => {
    // Якорь — от handleFileTaskSubmit: в файле два NDJSON-парсера (текстовый
    // путь sendMessageToAI и multipart), первый попавшийся JSON.parse(line)
    // может оказаться не тем (I9).
    const fnAt = SRC.indexOf('const handleFileTaskSubmit = async');
    expect(fnAt).toBeGreaterThan(-1);
    const at = SRC.indexOf('const event = JSON.parse(line);', fnAt);
    expect(at).toBeGreaterThan(fnAt);
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

describe('связка ChatInterface: пустой ответ не доезжает до ленты', () => {
  it('живой стрим: assistantMsg добавляется только при непустом содержимом или noTokens (I2)', () => {
    const from = SRC.indexOf('const handleFileTaskSubmit = async');
    const at = SRC.indexOf('const assistantMsg: Message = {', from);
    expect(at).toBeGreaterThan(from);
    const before = SRC.slice(from, at);
    expect(before).toContain("if (accumulatedContent.trim() !== '' || noTokens) {");
  });

  it('история: dropEmptyAssistantMessages применён на всех выборках', () => {
    const uses = SRC.split('dropEmptyAssistantMessages(').length - 1;
    // начальная загрузка, поллинг (pullHistoryOnce), догрузка старых
    expect(uses).toBeGreaterThanOrEqual(3);
  });
});

describe('связка ChatInterface: гейт догрузки истории — ответ сервера (I6)', () => {
  it('страница, целиком отфильтрованная в ноль, не «заканчивает» историю', () => {
    const from = SRC.indexOf('const loadMoreHistory = async');
    expect(from).toBeGreaterThan(-1);
    const body = SRC.slice(from, SRC.indexOf('const handleChatScroll', from));
    // Прежняя ошибка: setHasMoreHistory(false), когда отфильтрованный массив
    // пуст, даже если сервер сказал hasMore: true.
    expect(body).not.toContain('setHasMoreHistory(false)');
    expect(body.split('setHasMoreHistory(data.hasMore || false)').length - 1).toBe(2);
    // Пустая отфильтрованная страница всё равно сдвигает offset — иначе
    // следующий скролл перечитает её же навсегда.
    expect(body.split('setHistoryOffset(prev => prev + 30)').length - 1).toBe(2);
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
