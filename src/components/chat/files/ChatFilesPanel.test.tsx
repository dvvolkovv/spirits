// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import toast from 'react-hot-toast';
import { mount, flush, click, clickAsync, doubleClick, actAsync, byButton, byLink, visibleText, tRu } from '../../../test/dom';
import ChatFilesPanel from './ChatFilesPanel';
import { apiClient } from '../../../services/apiClient';
import { deleteChatUpload, type ChatFileItem } from './chatFiles';
import { openChatUpload } from '../chatUploads';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
// Удаление загрузки — deleteChatUpload из chatFiles.ts (задача C2), его HTTP
// проверяет chatFiles.test.ts. Здесь важен исход для панели.
vi.mock('./chatFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chatFiles')>()),
  deleteChatUpload: vi.fn(),
}));
// Скачивание приватного файла с JWT проверяет uploadMemory.test.tsx; здесь —
// что панель и просмотр идут именно через него, а не через ссылку с href.
vi.mock('../chatUploads', () => ({ openChatUpload: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
const api = vi.mocked(apiClient);

const ok = (items: ChatFileItem[]) => ({ ok: true, json: async () => ({ items }) }) as any;
const settle = async () => { await flush(); await flush(); };
const f = (p: Partial<ChatFileItem>): ChatFileItem => ({
  key: p.key ?? p.name ?? 'k', kind: 'image', url: 'https://pub/a.png', name: 'a.png', ext: 'png',
  createdAt: '2026-10-05T10:00:00.000Z', messageId: 1, stored: true, ...p,
});
// createdAt — не ближе ~14 ч к границе месяца: new Date(...).getMonth()
// читает ЛОКАЛЬНОЕ время, и близкая к границе метка на машине с достаточно
// отрицательным смещением от UTC съезжает в соседний месяц, меняя группировку.
const ITEMS: ChatFileItem[] = [
  f({ key: 'i1', name: 'i1.png', url: 'https://pub/i1.png', createdAt: '2026-10-05T10:00:00.000Z' }),
  f({ key: 'i2', name: 'i2.png', url: 'https://pub/i2.png', createdAt: '2026-10-02T10:00:00.000Z' }),
  f({ key: 'pdf', kind: 'document', ext: 'pdf', name: 'report.pdf', url: 'https://pub/report.pdf', createdAt: '2026-10-04T10:00:00.000Z' }),
  f({ key: 'v1', kind: 'video', ext: 'mp4', name: 'v1.mp4', url: 'https://pub/v1.mp4', thumbUrl: 'https://pub/v1.jpg', createdAt: '2026-09-20T10:00:00.000Z' }),
  f({ key: 'gone-img', name: 'chart.png', stored: false, url: undefined, createdAt: '2026-08-03T10:00:00.000Z' }),
  f({ key: 'gone-doc', kind: 'document', ext: 'docx', name: 'old.docx', stored: false, url: undefined, createdAt: '2026-08-03T10:00:00.000Z' }),
];
const tab = (c: HTMLElement, key: string) =>
  Array.from(c.querySelectorAll('[role="tab"]')).find((b) => (b.textContent ?? '').startsWith(tRu(key))) as HTMLButtonElement;
// cancelable: true — ближе к настоящим событиям клавиатуры (Escape в
// MediaViewer.tsx вызывает preventDefault, который без этого флага тихо
// не отмечает событие обработанным).
const press = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true })); });
const pressShiftTab = () =>
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })); });

describe('ChatFilesPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('просит файлы именно этой переписки — без метки «Чистого листа»', async () => {
    api.get.mockResolvedValue(ok([]));
    mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/files?assistantId=12');
  });

  it('метку «Чистого листа» от старого вызывающего не пересылает: он файлы не прячет', async () => {
    api.get.mockResolvedValue(ok([]));
    // Приведение — имитация вызывающего, который ещё передаёт снятый проп.
    const legacy = { freshTs: '1728000000000' } as object;
    mount(<ChatFilesPanel {...legacy} assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/files?assistantId=12');
  });

  it('до первого ответа API ни одна вкладка не выбрана (вместо «Медиа» поверх скелетона)', async () => {
    let resolve!: (v: any) => void;
    api.get.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await flush();
    expect(container.querySelector('[data-testid="chat-files-skeleton"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"][aria-selected="true"]').length).toBe(0);
    // Как и с aria-selected: до первого ответа ни одна вкладка не выбрана,
    // tabpanel не должен ссылаться на «Медиа» по умолчанию.
    expect(container.querySelector('[role="tabpanel"]')!.hasAttribute('aria-labelledby')).toBe(false);

    resolve(ok(ITEMS));
    await settle();
    expect(container.querySelectorAll('[role="tab"][aria-selected="true"]').length).toBe(1);
  });

  it('вкладки со счётчиками сохранённых, «Медиа» открыта первой, группы по месяцам', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(tab(container, 'chat.files.tab_media').textContent).toBe(`${tRu('chat.files.tab_media')} · 3`);
    expect(tab(container, 'chat.files.tab_files').textContent).toBe(`${tRu('chat.files.tab_files')} · 1`);
    expect(tab(container, 'chat.files.tab_media').getAttribute('aria-selected')).toBe('true');
    const text = visibleText(container);
    expect(text).toContain('Октябрь 2026 г.');
    expect(text).toContain('Сентябрь 2026 г.');
  });

  it('вкладки: id/aria-controls у табов, у контента role=tabpanel и aria-labelledby активного', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const mediaTab = tab(container, 'chat.files.tab_media');
    const filesTab = tab(container, 'chat.files.tab_files');
    const panel = container.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(mediaTab.id).toBeTruthy();
    expect(filesTab.id).toBeTruthy();
    expect(mediaTab.id).not.toBe(filesTab.id);
    expect(mediaTab.getAttribute('aria-controls')).toBe(panel.id);
    expect(filesTab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(mediaTab.id);

    click(filesTab);
    expect(panel.getAttribute('aria-labelledby')).toBe(filesTab.id);
  });

  it('у плитки в accessible-имени есть имя файла', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const tiles = container.querySelectorAll(`button[aria-label^="${tRu('chat.files.image')}"]`);
    expect(tiles[1].getAttribute('aria-label')).toBe(`${tRu('chat.files.image')}: i2.png`);
    const videoTile = container.querySelector(`button[aria-label^="${tRu('chat.files.video')}"]`)!;
    expect(videoTile.getAttribute('aria-label')).toBe(`${tRu('chat.files.video')}: v1.mp4`);
  });

  it('миниатюра, которая не загрузилась, — нейтральная заглушка, а не битая картинка', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const img = container.querySelector('img[src="https://pub/i1.png"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('decoding')).toBe('async');
    expect(container.querySelector('[data-testid="chat-files-broken-thumb"]')).toBeNull();

    act(() => { img.dispatchEvent(new Event('error')); });

    expect(container.querySelector('img[src="https://pub/i1.png"]')).toBeNull();
    expect(container.querySelector('[data-testid="chat-files-broken-thumb"]')).not.toBeNull();
  });

  it('повторная загрузка даёт битой миниатюре новый шанс, а не хранит старую заглушку', async () => {
    api.get.mockResolvedValueOnce(ok(ITEMS));
    const { container, rerender } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const img = container.querySelector('img[src="https://pub/i1.png"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(container.querySelector('[data-testid="chat-files-broken-thumb"]')).not.toBeNull();

    // Меняется assistantId — панель, оставшаяся тем же инстансом, запускает
    // новую загрузку; бэк на этот раз временно недоступен.
    api.get.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as any);
    rerender(<ChatFilesPanel assistantId={13} onClose={vi.fn()} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.files.load_error'));

    // «Повторить» возвращает ТЕ ЖЕ данные (та же протухшая/восстановленная
    // ссылка) — миниатюра должна получить честный повторный рендер <img>,
    // а не остаться заглушкой из прошлого brokenKeys.
    api.get.mockResolvedValueOnce(ok(ITEMS));
    await clickAsync(byButton(container, new RegExp(tRu('chat.files.retry')))!);
    await settle();

    expect(container.querySelector('img[src="https://pub/i1.png"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-files-broken-thumb"]')).toBeNull();
  });

  it('плитка берёт миниатюру, при ошибке — оригинал, потом значок', async () => {
    api.get.mockResolvedValue(ok([f({ key: 'i1', name: 'i1.png', url: 'https://pub/i1.png', thumbPath: '/webhook/chat/thumb?src=x%2Fi1.png' })]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const img = () => container.querySelector('[role="tabpanel"] img') as HTMLImageElement | null;
    expect(img()!.getAttribute('src')).toBe('/webhook/chat/thumb?src=x%2Fi1.png');
    act(() => { img()!.dispatchEvent(new Event('error')); });
    expect(img()!.getAttribute('src')).toBe('https://pub/i1.png');
    act(() => { img()!.dispatchEvent(new Event('error')); });
    expect(img()).toBeNull();
    expect(container.querySelector('[data-testid="chat-files-broken-thumb"]')).not.toBeNull();
  });

  // Уточнено с приходом загрузок (C4): «сразу оригинал по адресу» — только у
  // файлов ассистента (публичный бакет). Загрузки пользователя идут через blob
  // с JWT — describe «загрузки пользователя» ниже.
  it('картинка ассистента без thumbPath — сразу оригинал по публичному адресу, без запроса за blob', async () => {
    api.get.mockResolvedValue(ok([f({ key: 'i1', name: 'i1.png', url: 'https://pub/i1.png' })]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(container.querySelector('[role="tabpanel"] img')!.getAttribute('src')).toBe('https://pub/i1.png');
    // Единственный запрос — сам список; превью ассистента браузер берёт сам.
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('файл ассистента скачивается по публичной ссылке под своим именем', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    click(tab(container, 'chat.files.tab_files'));
    const a = byLink(container, /report\.pdf/)!;
    expect(a.getAttribute('href')).toBe('https://pub/report.pdf');
    expect(a.getAttribute('download')).toBe('report.pdf');
  });

  it('скачивание из списка файлов сообщает вид файла', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const onDownload = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} onDownload={onDownload} />);
    await settle();
    click(tab(container, 'chat.files.tab_files'));
    click(container.querySelector('[role="tabpanel"] a[href="https://pub/report.pdf"]')!);
    expect(onDownload).toHaveBeenCalledWith('document', 'list');
  });

  it('не сохранившиеся — свёрнутой строкой внизу, без ссылок', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    click(tab(container, 'chat.files.tab_files'));
    expect(visibleText(container)).toContain(tRu('chat.files.unsaved', { n: 1 }));
    expect(visibleText(container)).not.toContain('old.docx');

    click(byButton(container, new RegExp(tRu('chat.files.unsaved', { n: 1 })))!);
    expect(visibleText(container)).toContain('old.docx');
    expect(visibleText(container)).toContain(tRu('chat.files.unsaved_hint'));
    expect(byLink(container, /old\.docx/)).toBeNull();
  });

  it('пусто — подсказка во вкладке; при пустом списке открыты «Файлы»', async () => {
    api.get.mockResolvedValue(ok([]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.files.empty_files'));
    click(tab(container, 'chat.files.tab_media'));
    expect(visibleText(container)).toContain(tRu('chat.files.empty_media'));
  });

  it('ошибка — «Не удалось загрузить» и «Повторить», повтор загружает заново', async () => {
    api.get.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as any);
    api.get.mockResolvedValueOnce(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.files.load_error'));
    await clickAsync(byButton(container, new RegExp(tRu('chat.files.retry')))!);
    await settle();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(visibleText(container)).toContain('Октябрь 2026 г.');
  });

  it('нажатие на превью открывает просмотр; Esc закрывает сначала просмотр, потом панель', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const onClose = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={onClose} />);
    await settle();
    const tiles = container.querySelectorAll(`button[aria-label^="${tRu('chat.files.image')}"]`);
    click(tiles[1]);
    const viewer = container.querySelector('[data-testid="media-viewer"]')!;
    expect(viewer).not.toBeNull();
    expect(byLink(viewer as HTMLElement, new RegExp(tRu('chat.files.download')))!.getAttribute('href')).toBe('https://pub/i2.png');

    press('Escape');
    expect(container.querySelector('[data-testid="media-viewer"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('закрытие просмотра возвращает фокус на плитку, что его открыла', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const tiles = container.querySelectorAll(`button[aria-label^="${tRu('chat.files.image')}"]`);
    const tile = tiles[1] as HTMLButtonElement;
    click(tile);
    const closeBtn = container.querySelector(
      `[data-testid="media-viewer"] button[aria-label="${tRu('chat.files.close')}"]`,
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn);

    click(closeBtn);
    expect(container.querySelector('[data-testid="media-viewer"]')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it('корень панели поверх нижней навигации (z-[60], та же у TokenPackages/VoiceCallModal)', async () => {
    api.get.mockResolvedValue(ok([]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const root = container.querySelector('[data-testid="chat-files-panel"]')!;
    expect(root.className).toContain('z-[60]');
    expect(root.className).not.toContain('z-50');
  });

  it('«Назад» и крестик закрывают панель', async () => {
    api.get.mockResolvedValue(ok([]));
    const onClose = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={onClose} />);
    await settle();
    click(container.querySelector(`button[aria-label="${tRu('chat.files.back')}"]`)!);
    click(container.querySelector(`button[aria-label="${tRu('chat.files.close')}"]`)!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('при открытии фокус уходит в панель, при закрытии — обратно на кнопку, что её открыла', async () => {
    api.get.mockResolvedValue(ok([]));
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);
    try {
      const { container, unmount } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
      await settle();
      // Иначе Tab уходит на «Перегенерировать» под подложкой, а Enter там
      // срабатывает по кнопке, которая была в фокусе до открытия панели.
      expect(container.contains(document.activeElement)).toBe(true);

      unmount();
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });

  it('Tab с последнего фокусируемого элемента внутри панели переходит на первый (ловушка)', async () => {
    api.get.mockResolvedValue(ok([]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const focusables = Array.from(container.querySelectorAll('button, a[href], video')) as HTMLElement[];
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    press('Tab');
    expect(document.activeElement).toBe(first);
  });

  it('ловушка пропускает невидимую кнопку («назад» скрыт CSS на десктопе) в обе стороны', async () => {
    api.get.mockResolvedValue(ok([]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const backBtn = container.querySelector(`button[aria-label="${tRu('chat.files.back')}"]`) as HTMLButtonElement;
    // Инлайн, а не класс: Tailwind не подключён в jsdom (sm:hidden ничего не
    // меняет без реального CSS) — имитируем именно итог media-query на десктопе.
    backBtn.style.display = 'none';
    const closeBtn = container.querySelector(`button[aria-label="${tRu('chat.files.close')}"]`) as HTMLButtonElement;
    const focusables = Array.from(container.querySelectorAll('button, a[href], video')) as HTMLElement[];
    const last = focusables[focusables.length - 1];
    expect(last).not.toBe(backBtn);

    closeBtn.focus();
    pressShiftTab();
    expect(document.activeElement).toBe(last);

    last.focus();
    press('Tab');
    expect(document.activeElement).toBe(closeBtn);
  });

  it('Tab из открытого просмотра не утекает на кнопки панели под подложкой — у каждого своя ловушка', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const tiles = container.querySelectorAll(`button[aria-label^="${tRu('chat.files.image')}"]`);
    // i2 (индекс 1 в media.stored) — есть и «назад», и «вперёд» у просмотра.
    click(tiles[1]);
    const viewer = container.querySelector('[data-testid="media-viewer"]') as HTMLElement;
    expect(viewer).not.toBeNull();
    const viewerFocusables = Array.from(viewer.querySelectorAll('button, a[href], video')) as HTMLElement[];
    expect(viewerFocusables.length).toBeGreaterThan(1);
    const first = viewerFocusables[0];
    const last = viewerFocusables[viewerFocusables.length - 1];

    last.focus();
    press('Tab');
    expect(document.activeElement).toBe(first);
    expect(viewer.contains(document.activeElement)).toBe(true);

    first.focus();
    pressShiftTab();
    expect(document.activeElement).toBe(last);
    expect(viewer.contains(document.activeElement)).toBe(true);
  });

  it('Esc, уже обработанный чужим кодом страницы (capture), панель не закрывает', async () => {
    api.get.mockResolvedValue(ok([]));
    const onClose = vi.fn();
    mount(<ChatFilesPanel assistantId={12} onClose={onClose} />);
    await settle();
    const swallow = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener('keydown', swallow, { capture: true });
    try {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      });
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', swallow, { capture: true });
    }
  });

  it('перерисовка с новым onClose не переподписывает слушатель; срабатывает актуальный onClose', async () => {
    api.get.mockResolvedValue(ok([]));
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    try {
      const keydownAdds = () => addSpy.mock.calls.filter((c) => c[0] === 'keydown').length;
      const keydownRemoves = () => removeSpy.mock.calls.filter((c) => c[0] === 'keydown').length;
      const a = vi.fn();
      const b = vi.fn();
      const { rerender } = mount(<ChatFilesPanel assistantId={12} onClose={a} />);
      await settle();
      const addsAfterMount = keydownAdds();
      const removesAfterMount = keydownRemoves();

      rerender(<ChatFilesPanel assistantId={12} onClose={b} />);
      // Эффект подписки не завязан на identity onClose — ререндер с новым
      // onClose не должен снимать и ставить слушатель заново (иначе он
      // переставляется в конец списка слушателей window, после MediaViewer).
      expect(keydownAdds()).toBe(addsAfterMount);
      expect(keydownRemoves()).toBe(removesAfterMount);

      press('Escape');
      expect(b).toHaveBeenCalledTimes(1);
      expect(a).not.toHaveBeenCalled();
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});

describe('ChatFilesPanel — загрузки пользователя', () => {
  const UP_IMG = f({
    key: 'upload:u1', name: 'гостиная.jpg', ext: 'jpg', url: '/webhook/chat-uploads/u1', thumbUrl: '/webhook/chat-uploads/u1/thumb',
    origin: 'upload', source: 'web', note: 'Фото гостиной: решили перекрасить стены в серый', uploadId: 'u1',
    createdAt: '2026-10-06T10:00:00.000Z', messageId: 0,
  });
  // Картинка без миниатюры (битый файл, сбой генерации) — превью берётся из
  // оригинала: он небольшой (3 МБ, до потолка плитки в 5 МБ).
  const UP_TG = f({
    key: 'upload:u2', name: 'чек.png', url: '/webhook/chat-uploads/u2', sizeBytes: 3 * 1024 * 1024,
    origin: 'upload', source: 'telegram', note: null, uploadId: 'u2', createdAt: '2026-10-06T09:00:00.000Z', messageId: 0,
  });
  // PDF, который Маша разобрала через scan-document: source 'scan' — тоже «загрузили вы».
  const UP_DOC = f({
    key: 'upload:u3', kind: 'document', ext: 'pdf', name: 'договор.pdf', url: '/webhook/chat-uploads/u3',
    origin: 'upload', source: 'scan', note: 'Договор аренды, срок до мая', uploadId: 'u3',
    createdAt: '2026-10-06T08:00:00.000Z', messageId: 0,
  });
  const UPLOADS = [UP_IMG, UP_TG, UP_DOC];
  /** Список панели — JSON; всё остальное (миниатюры и оригиналы загрузок) — байты. */
  const routeGet = (items: ChatFileItem[]) => (url: string) =>
    Promise.resolve(
      url.startsWith('/webhook/chat/files')
        ? ok(items)
        : ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/webp' }) } as any),
    );
  // Список, затем запрос за каждым превью и его тело — цепочка длиннее, чем у settle().
  const settleBlobs = async () => { await settle(); await settle(); };
  const delBtn = (c: ParentNode, name: string) =>
    c.querySelector(`button[aria-label="${tRu('chat.files.delete')}: ${name}"]`) as HTMLButtonElement | null;
  // Точная метка плитки: вид, имя и пометка источника (её слышит и экранный диктор).
  const imageTile = (c: ParentNode, name: string, badge = tRu('chat.files.uploaded_by_you')) =>
    c.querySelector(`button[aria-label="${tRu('chat.files.image')}: ${name}, ${badge}"]`) as HTMLButtonElement | null;
  /** Запросы к приватным адресам загрузок (миниатюры и оригиналы), без списка. */
  const uploadCalls = () => api.get.mock.calls.filter(([u]) => String(u).startsWith('/webhook/chat-uploads/'));

  let blobs = 0;
  beforeEach(() => {
    // reset, а не clear: тесты выше оставляют на api.get реализации
    // (mockResolvedValue и т.п.), а здесь каждый тест ставит свою маршрутизацию.
    vi.resetAllMocks();
    blobs = 0;
    // jsdom не реализует object URL (как в uploadMemory.test.tsx).
    (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => `blob:panel-${++blobs}`);
    (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    vi.mocked(window.confirm).mockRestore();
  });

  it('«Медиа»: превью из blob (миниатюра, у картинки без неё — оригинал), пометка источника, комментарий в две строки', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    expect(tab(container, 'chat.files.tab_media').textContent).toBe(`${tRu('chat.files.tab_media')} · 2`);
    expect(api.get).toHaveBeenCalledWith('/webhook/chat-uploads/u1/thumb', expect.anything());
    expect(api.get).toHaveBeenCalledWith('/webhook/chat-uploads/u2', expect.anything());
    // Миниатюра есть — оригинал (до 100 МБ) ради плитки не тянем.
    expect(api.get).not.toHaveBeenCalledWith('/webhook/chat-uploads/u1', expect.anything());

    const imgs = Array.from(container.querySelectorAll('[role="tabpanel"] img'));
    expect(imgs).toHaveLength(2);
    for (const im of imgs) expect(im.getAttribute('src')).toMatch(/^blob:panel-/);
    // <img src> на приватный адрес получил бы 401: браузер не шлёт JWT.
    expect(container.querySelector('img[src*="/webhook/chat-uploads/"]')).toBeNull();

    const text = visibleText(container);
    expect(text).toContain(tRu('chat.files.uploaded_by_you'));
    expect(text).toContain(tRu('chat.files.from_telegram'));
    const note = container.querySelector('[data-testid="chat-files-note"]')!;
    expect(note.textContent).toBe('Фото гостиной: решили перекрасить стены в серый');
    expect(note.classList.contains('line-clamp-2')).toBe(true);
    // block вместе с line-clamp-2 не работает: block в CSS идёт позже (CallSessionItem.test.tsx).
    expect(note.classList.contains('block')).toBe(false);
  });

  // Поправка после ревью B1: картинка, которую браузер не покажет (HEIC с
  // айфона, BMP), миниатюры не получает. Оригинал в blob ради «битой
  // картинки» не тянем — значок файла с именем и «Скачать», как у документа.
  it('«Медиа»: HEIC без миниатюры — значок с именем и «Скачать», ни одного запроса к /webhook/chat-uploads/', async () => {
    const UP_HEIC = f({
      key: 'upload:h1', name: 'IMG_0001.heic', ext: 'heic', url: '/webhook/chat-uploads/h1',
      origin: 'upload', source: 'web', note: null, uploadId: 'h1', createdAt: '2026-10-06T10:00:00.000Z', messageId: 0,
    });
    api.get.mockImplementation(routeGet([UP_HEIC]) as any);
    const onDownload = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} onDownload={onDownload} />);
    await settleBlobs();
    expect(uploadCalls()).toHaveLength(0);
    expect(container.querySelector('[role="tabpanel"] img')).toBeNull();
    const file = container.querySelector('[data-testid="chat-files-upload-file"]')!;
    expect(file.querySelector('svg')).not.toBeNull();
    expect(file.textContent).toContain('IMG_0001.heic');

    click(byButton(container, new RegExp(tRu('chat.files.download')))!);
    expect(openChatUpload).toHaveBeenCalledWith('/webhook/chat-uploads/h1', tRu('chat.upload_download_error'), 'IMG_0001.heic');
    // Место — сетка «Медиа» (grid), а не список «Файлы» (list): так их и
    // различает chat_files_download в статистике.
    expect(onDownload).toHaveBeenCalledWith('image', 'grid');

    // Просмотр такой картинки — тот же значок, а не запрос оригинала.
    click(imageTile(container, 'IMG_0001.heic')!);
    await settleBlobs();
    expect(container.querySelector('[data-testid="media-viewer-upload-file"]')).not.toBeNull();
    expect(uploadCalls()).toHaveLength(0);
  });

  it.each([
    ['30 МБ', 30 * 1024 * 1024],
    ['размер неизвестен', undefined],
  ])('«Медиа»: картинка без миниатюры, %s, — значок с именем, оригинал ради плитки не тянем', async (_label, sizeBytes) => {
    const BIG = f({
      key: 'upload:b1', name: 'панорама.jpg', ext: 'jpg', url: '/webhook/chat-uploads/b1', sizeBytes,
      origin: 'upload', source: 'web', note: null, uploadId: 'b1', createdAt: '2026-10-06T10:00:00.000Z', messageId: 0,
    });
    api.get.mockImplementation(routeGet([BIG]) as any);
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    expect(uploadCalls()).toHaveLength(0);
    expect(container.querySelector('[role="tabpanel"] img')).toBeNull();
    expect(container.querySelector('[data-testid="chat-files-upload-file"]')!.textContent).toContain('панорама.jpg');
  });

  it('превью качается, только когда плитка подошла к видимой области: 500 загрузок не тянутся разом', async () => {
    const seen: { cb: IntersectionObserverCallback; target: Element | null }[] = [];
    class FakeIO {
      private rec: { cb: IntersectionObserverCallback; target: Element | null };
      constructor(cb: IntersectionObserverCallback) {
        this.rec = { cb, target: null };
        seen.push(this.rec);
      }
      observe(el: Element) { this.rec.target = el; }
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
    try {
      api.get.mockImplementation(routeGet([UP_IMG, UP_TG]) as any);
      const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
      await settleBlobs();
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="tabpanel"] img')).toBeNull();

      // Первая плитка (гостиная.jpg) доехала до видимой области, вторая — нет.
      const first = seen[0];
      act(() => {
        first.cb([{ isIntersecting: true, target: first.target } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
      });
      await settleBlobs();
      expect(api.get).toHaveBeenCalledWith('/webhook/chat-uploads/u1/thumb', expect.anything());
      expect(api.get).not.toHaveBeenCalledWith('/webhook/chat-uploads/u2', expect.anything());
      expect(container.querySelectorAll('[role="tabpanel"] img')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Защита: бэк без поля origin (или старый ответ) — приватный адрес всё равно
  // не уходит в <img src> или в ссылку с href, где браузер получил бы 401.
  it('элемент без origin с адресом /webhook/chat-uploads/ — как загрузка: ни <img src>, ни ссылки с href на него', async () => {
    const NO_ORIGIN = [
      f({ key: 'g1', name: 'без-пометки.jpg', ext: 'jpg', url: '/webhook/chat-uploads/g1', thumbUrl: '/webhook/chat-uploads/g1/thumb', messageId: 0 }),
      f({ key: 'g2', kind: 'document', ext: 'pdf', name: 'без-пометки.pdf', url: '/webhook/chat-uploads/g2', messageId: 0 }),
    ];
    api.get.mockImplementation(routeGet(NO_ORIGIN) as any);
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    expect(container.querySelector('img[src*="/webhook/chat-uploads/"]')).toBeNull();
    expect(container.querySelector('[data-testid="chat-files-upload-tile"]')).not.toBeNull();

    click(imageTile(container, 'без-пометки.jpg')!);
    await settleBlobs();
    const viewer = container.querySelector('[data-testid="media-viewer"]') as HTMLElement;
    expect(viewer.querySelector('img[src*="/webhook/chat-uploads/"]')).toBeNull();
    expect(viewer.querySelector('a[href^="/webhook/chat-uploads/"]')).toBeNull();
    // uploadId нет — удалять нечем: кнопки «Удалить» нет, а не мёртвая кнопка.
    expect(byButton(viewer, new RegExp(tRu('chat.files.delete')))).toBeNull();
    click(viewer.querySelector(`button[aria-label="${tRu('chat.files.close')}"]`)!);

    click(tab(container, 'chat.files.tab_files'));
    expect(container.querySelector('a[href^="/webhook/chat-uploads/"]')).toBeNull();
    expect(container.querySelector('[data-testid="chat-files-upload-row"]')).not.toBeNull();
    expect(delBtn(container, 'без-пометки.pdf')).toBeNull();
  });

  // Прокручивается не окно, а вкладка панели (overflow-y-auto): с корнем по
  // умолчанию (окно) запас rootMargin не работал бы, и превью начинало бы
  // качаться, только когда плитка уже на экране.
  it('видимая область для превью — прокручиваемая вкладка панели, с запасом 200px', async () => {
    const opts: (IntersectionObserverInit | undefined)[] = [];
    class FakeIO {
      constructor(_cb: IntersectionObserverCallback, o?: IntersectionObserverInit) { opts.push(o); }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
    try {
      api.get.mockImplementation(routeGet([UP_IMG, UP_TG]) as any);
      const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
      await settleBlobs();
      const tabpanel = container.querySelector('[role="tabpanel"]');
      expect(tabpanel).not.toBeNull();
      expect(opts.length).toBeGreaterThanOrEqual(2);
      for (const o of opts) {
        expect(o?.root).toBe(tabpanel);
        expect(o?.rootMargin).toBe('200px');
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Пометка источника видна глазами на плитке — диктору её тоже нужно услышать.
  it('доступность: в имени плитки и строки — пометка источника; комментарий строки — её описание', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    expect(imageTile(container, 'гостиная.jpg')).not.toBeNull();
    expect(imageTile(container, 'чек.png', tRu('chat.files.from_telegram'))).not.toBeNull();

    click(tab(container, 'chat.files.tab_files'));
    const row = byButton(container, /договор\.pdf/)!;
    const date = new Date(UP_DOC.createdAt).toLocaleDateString('ru');
    expect(row.getAttribute('aria-label')).toBe(
      `${tRu('chat.files.download')}: договор.pdf, ${date}, ${tRu('chat.files.uploaded_by_you')}`,
    );
    const noteId = row.getAttribute('aria-describedby')!;
    expect(noteId).toBeTruthy();
    expect(container.querySelector(`[id="${noteId}"]`)!.textContent).toBe('Договор аренды, срок до мая');
  });

  it('«Файлы»: скачивание через openChatUpload (JWT), пометка и комментарий; ссылок с href на приватный адрес нет', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    const onDownload = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} onDownload={onDownload} />);
    await settleBlobs();
    click(tab(container, 'chat.files.tab_files'));
    const text = visibleText(container);
    expect(text).toContain('договор.pdf');
    expect(text).toContain('Договор аренды, срок до мая');
    expect(text).toContain(tRu('chat.files.uploaded_by_you'));
    expect(container.querySelector('a[href^="/webhook/chat-uploads/"]')).toBeNull();

    click(byButton(container, /договор\.pdf/)!);
    expect(openChatUpload).toHaveBeenCalledWith('/webhook/chat-uploads/u3', tRu('chat.upload_download_error'), 'договор.pdf');
    expect(onDownload).toHaveBeenCalledWith('document', 'list');
  });

  it('удаление: подтверждение → DELETE → строка пропадает, «Медиа» не задеты', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    vi.mocked(deleteChatUpload).mockResolvedValue(undefined);
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    click(tab(container, 'chat.files.tab_files'));

    await clickAsync(delBtn(container, 'договор.pdf')!);
    await settle();
    // Подтверждение называет файл: в длинном списке легко нажать не ту корзину.
    expect(window.confirm).toHaveBeenCalledWith(tRu('chat.files.delete_confirm', { name: 'договор.pdf' }));
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toContain('договор.pdf');
    expect(deleteChatUpload).toHaveBeenCalledWith('u3');
    expect(visibleText(container)).not.toContain('договор.pdf');
    expect(visibleText(container)).toContain(tRu('chat.files.empty_files'));
    expect(tab(container, 'chat.files.tab_media').textContent).toBe(`${tRu('chat.files.tab_media')} · 2`);
  });

  it('отказ в подтверждении — запроса нет, файл на месте', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    vi.mocked(window.confirm).mockReturnValue(false);
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    click(tab(container, 'chat.files.tab_files'));

    await clickAsync(delBtn(container, 'договор.pdf')!);
    await settle();
    expect(deleteChatUpload).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain('договор.pdf');
  });

  it('сбой удаления (502) — файл остаётся, тост «не удалось удалить»', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    vi.mocked(deleteChatUpload).mockRejectedValue(new Error('chat upload delete: HTTP 502'));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    click(tab(container, 'chat.files.tab_files'));

    await clickAsync(delBtn(container, 'договор.pdf')!);
    await settle();
    expect(toast.error).toHaveBeenCalledWith(tRu('chat.files.delete_failed'));
    expect(visibleText(container)).toContain('договор.pdf');
  });

  it('второе «Удалить», пока первый запрос в пути, второго DELETE не шлёт', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    let finish!: () => void;
    vi.mocked(deleteChatUpload).mockReturnValue(new Promise<void>((r) => { finish = r; }));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    click(tab(container, 'chat.files.tab_files'));

    doubleClick(delBtn(container, 'договор.pdf')!);
    expect(deleteChatUpload).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledTimes(1);

    await actAsync(() => { finish(); });
    await settle();
    expect(visibleText(container)).not.toContain('договор.pdf');
  });

  it('просмотр загрузки: оригинал из blob и полный комментарий; «Удалить» в просмотре закрывает его и убирает плитку', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    vi.mocked(deleteChatUpload).mockResolvedValue(undefined);
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();

    click(imageTile(container, 'гостиная.jpg')!);
    await settleBlobs();
    const viewer = container.querySelector('[data-testid="media-viewer"]') as HTMLElement;
    expect(viewer).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith('/webhook/chat-uploads/u1', expect.anything());
    expect(viewer.querySelector('img')!.getAttribute('src')).toMatch(/^blob:panel-/);
    expect(viewer.querySelector('[data-testid="media-viewer-note"]')!.textContent).toContain(
      'Фото гостиной: решили перекрасить стены в серый',
    );

    await clickAsync(byButton(viewer, new RegExp(tRu('chat.files.delete')))!);
    await settle();
    expect(deleteChatUpload).toHaveBeenCalledWith('u1');
    expect(container.querySelector('[data-testid="media-viewer"]')).toBeNull();
    expect(imageTile(container, 'гостиная.jpg')).toBeNull();
    expect(tab(container, 'chat.files.tab_media').textContent).toBe(`${tRu('chat.files.tab_media')} · 1`);
    // Плитки, что открыла просмотр, больше нет — фокус остаётся в панели, а не падает на body.
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it('пока DELETE в пути, корзина — disabled и aria-busy; сбой снимает признак', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    let fail!: (e: Error) => void;
    vi.mocked(deleteChatUpload).mockReturnValue(new Promise<void>((_r, j) => { fail = j; }));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    click(tab(container, 'chat.files.tab_files'));
    expect(delBtn(container, 'договор.pdf')!.disabled).toBe(false);
    expect(delBtn(container, 'договор.pdf')!.hasAttribute('aria-busy')).toBe(false);

    await clickAsync(delBtn(container, 'договор.pdf')!);
    expect(delBtn(container, 'договор.pdf')!.disabled).toBe(true);
    expect(delBtn(container, 'договор.pdf')!.getAttribute('aria-busy')).toBe('true');

    await actAsync(() => { fail(new Error('chat upload delete: HTTP 502')); });
    await settle();
    expect(toast.error).toHaveBeenCalledWith(tRu('chat.files.delete_failed'));
    expect(delBtn(container, 'договор.pdf')!.disabled).toBe(false);
    expect(delBtn(container, 'договор.pdf')!.hasAttribute('aria-busy')).toBe(false);
  });

  it('«Удалить» в просмотре, пока DELETE в пути, — disabled и aria-busy', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    let finish!: () => void;
    vi.mocked(deleteChatUpload).mockReturnValue(new Promise<void>((r) => { finish = r; }));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    click(imageTile(container, 'гостиная.jpg')!);
    await settleBlobs();
    const viewer = container.querySelector('[data-testid="media-viewer"]') as HTMLElement;
    const del = () => byButton(viewer, new RegExp(tRu('chat.files.delete')))!;
    expect(del().disabled).toBe(false);

    await clickAsync(del());
    expect(del().disabled).toBe(true);
    expect(del().getAttribute('aria-busy')).toBe('true');

    await actAsync(() => { finish(); });
    await settle();
    expect(container.querySelector('[data-testid="media-viewer"]')).toBeNull();
  });

  // Удаление открытого файла, пока DELETE в пути, пользователь листнул на
  // соседний: закрывать просмотр нечего — он показывает не удалённый файл.
  it('удалили A, пока просмотр уже на B, — просмотр остаётся на B', async () => {
    api.get.mockImplementation(routeGet(UPLOADS) as any);
    let finish!: () => void;
    vi.mocked(deleteChatUpload).mockReturnValue(new Promise<void>((r) => { finish = r; }));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settleBlobs();
    const viewer = () => container.querySelector('[data-testid="media-viewer"]') as HTMLElement | null;

    click(imageTile(container, 'гостиная.jpg')!);
    await settleBlobs();
    await clickAsync(byButton(viewer()!, new RegExp(tRu('chat.files.delete')))!);
    expect(deleteChatUpload).toHaveBeenCalledWith('u1');
    click(viewer()!.querySelector(`button[aria-label="${tRu('chat.files.next')}"]`)!);
    expect(viewer()!.getAttribute('aria-label')).toBe('чек.png');

    await actAsync(() => { finish(); });
    await settle();
    expect(imageTile(container, 'гостиная.jpg')).toBeNull();
    expect(viewer()).not.toBeNull();
    expect(viewer()!.getAttribute('aria-label')).toBe('чек.png');
    expect(tab(container, 'chat.files.tab_media').textContent).toBe(`${tRu('chat.files.tab_media')} · 1`);
  });
});
