// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { mount, click, byLink, byButton, flush, actAsync, tRu } from '../../../test/dom';
import MediaViewer from './MediaViewer';
import type { ChatFileItem } from './chatFiles';
import { apiClient } from '../../../services/apiClient';
import { openChatUpload } from '../chatUploads';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
// Загрузки пользователя просмотр берёт через apiClient (useAuthedBlobUrl).
// Мок нужен и самому импорту: настоящий apiClient тянет src/i18n/index.ts, а
// тот зовёт initReactI18next, которого в моке react-i18next выше нет.
vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
// Скачивание приватного файла с JWT проверяет uploadMemory.test.tsx; здесь
// важно, что просмотр идёт именно через него, а не через ссылку с href.
vi.mock('../chatUploads', () => ({ openChatUpload: vi.fn() }));
const api = vi.mocked(apiClient);

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom не реализует object URL (как в uploadMemory.test.tsx).
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:viewer-1');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
});

const img = (n: number): ChatFileItem => ({
  key: `k${n}`, kind: 'image', url: `https://pub/${n}.png`, name: `${n}.png`, ext: 'png',
  createdAt: '2026-10-05T10:00:00.000Z', messageId: n, stored: true,
});
const video: ChatFileItem = { ...img(9), key: 'v', kind: 'video', url: 'https://pub/v.mp4', name: 'v.mp4', ext: 'mp4' };
const key = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });
const byAria = (c: HTMLElement, label: string) => c.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

describe('MediaViewer', () => {
  // Уточнено с приходом загрузок (C4): адрес прямо в <img> и в ссылке — только
  // у файлов ассистента (публичный бакет); загрузки пользователя — в describe ниже.
  it('картинка ассистента: публичный адрес в <img> и в ссылке «Скачать» под своим именем, без apiClient', () => {
    const { container } = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://pub/1.png');
    const a = byLink(container, new RegExp(tRu('chat.files.download')))!;
    expect(a.getAttribute('href')).toBe('https://pub/1.png');
    expect(a.getAttribute('download')).toBe('1.png');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('стрелки: у первой нет «назад», у последней нет «вперёд»', () => {
    const onIndex = vi.fn();
    const first = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={onIndex} onClose={vi.fn()} />);
    expect(byAria(first.container, tRu('chat.files.prev'))).toBeNull();
    click(byAria(first.container, tRu('chat.files.next'))!);
    expect(onIndex).toHaveBeenCalledWith(1);
    first.unmount();

    const last = mount(<MediaViewer items={[img(1), img(2)]} index={1} onIndexChange={onIndex} onClose={vi.fn()} />);
    expect(byAria(last.container, tRu('chat.files.next'))).toBeNull();
    last.unmount();
  });

  it('клавиатура: ← → листают, Esc закрывает', () => {
    const onIndex = vi.fn();
    const onClose = vi.fn();
    const m = mount(<MediaViewer items={[img(1), img(2), img(3)]} index={1} onIndexChange={onIndex} onClose={onClose} />);
    key('ArrowRight');
    expect(onIndex).toHaveBeenLastCalledWith(2);
    key('ArrowLeft');
    expect(onIndex).toHaveBeenLastCalledWith(0);
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('Alt+→ не листает — горячая клавиша страницы/браузера, не навигация просмотра', () => {
    const onIndex = vi.fn();
    const m = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={onIndex} onClose={vi.fn()} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, cancelable: true }));
    });
    expect(onIndex).not.toHaveBeenCalled();
    m.unmount();
  });

  it('→ на фокусе <video> — родная перемотка плеера, не листание просмотра', () => {
    const onIndex = vi.fn();
    const m = mount(<MediaViewer items={[video, img(2)]} index={0} onIndexChange={onIndex} onClose={vi.fn()} />);
    const videoEl = m.container.querySelector('video')!;
    act(() => {
      videoEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(onIndex).not.toHaveBeenCalled();
    m.unmount();
  });

  it('видео ассистента — плеер на публичном адресе', () => {
    const { container } = mount(<MediaViewer items={[video]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://pub/v.mp4');
  });

  // Ревью E3 (02.11): px-12 были прибиты всегда — нужны только под стрелки
  // «назад»/«вперёд», а при одном файле (самый частый случай — просмотр
  // открыли по клику на единственную картинку в ленте) стрелок нет, и те же
  // поля на телефоне делали «полноэкранный» просмотр мельче, чем картинка в
  // самой ленте.
  it('поля по бокам: px-2 при одном файле (стрелок нет), px-12 при нескольких', () => {
    const one = mount(<MediaViewer items={[img(1)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    const stageOne = one.container.querySelector('img')!.parentElement!;
    expect(stageOne.className).toContain('px-2');
    expect(stageOne.className).not.toContain('px-12');
    one.unmount();

    const many = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    const stageMany = many.container.querySelector('img')!.parentElement!;
    expect(stageMany.className).toContain('px-12');
    expect(stageMany.className).not.toContain('px-2');
    many.unmount();
  });

  it('открытие переводит фокус на «Закрыть»; имя файла — в aria-label диалога', () => {
    const { container, unmount } = mount(
      <MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />,
    );
    const closeBtn = byAria(container, tRu('chat.files.close'));
    expect(document.activeElement).toBe(closeBtn);
    expect(container.querySelector('[data-testid="media-viewer"]')?.getAttribute('aria-label')).toBe('1.png');
    unmount();
  });

  it('Esc помечает событие обработанным — иначе то же нажатие закрывает и панель «Медиа и файлы»', () => {
    const onClose = vi.fn();
    const m = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={vi.fn()} onClose={onClose} />);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => { window.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('Tab с последней кнопки переходит на первую (ловушка над своим корнем)', () => {
    const m = mount(<MediaViewer items={[img(1), img(2), img(3)]} index={1} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    const viewer = m.container.querySelector('[data-testid="media-viewer"]') as HTMLElement;
    const focusables = Array.from(viewer.querySelectorAll('button, a[href]')) as HTMLElement[];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })); });
    expect(document.activeElement).toBe(first);
    m.unmount();
  });

  it('ловушка просмотра тоже пропускает невидимую кнопку (тот же помощник, что у панели)', () => {
    const m = mount(<MediaViewer items={[img(1), img(2), img(3)]} index={1} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    const viewer = m.container.querySelector('[data-testid="media-viewer"]') as HTMLElement;
    const download = byLink(viewer, new RegExp(tRu('chat.files.download')))!;
    // Инлайн, не класс: как и в ChatFilesPanel.test.tsx, Tailwind не подключён в jsdom.
    download.style.display = 'none';
    const closeBtn = byAria(viewer, tRu('chat.files.close'))!;
    const focusables = Array.from(viewer.querySelectorAll('button, a[href]')) as HTMLElement[];
    const last = focusables[focusables.length - 1];
    expect(closeBtn).not.toBe(download);

    closeBtn.focus();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })); });
    expect(document.activeElement).toBe(last);

    last.focus();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })); });
    expect(document.activeElement).toBe(closeBtn);
    m.unmount();
  });

  it('«Скачать» сообщает вид файла', () => {
    const onDownload = vi.fn();
    const { container } = mount(<MediaViewer items={[img(0)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} onDownload={onDownload} />);
    click(container.querySelector('a[download]')!);
    expect(onDownload).toHaveBeenCalledWith('image');
  });

  it('стрелки не помечаются обработанными — на них может быть завязан другой код страницы', () => {
    const onIndex = vi.fn();
    const m = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={onIndex} onClose={vi.fn()} />);
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    act(() => { window.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(false);
    expect(onIndex).toHaveBeenCalledWith(1);
    m.unmount();
  });
});

describe('MediaViewer — загрузка пользователя (приватный файл)', () => {
  const upload = (p: Partial<ChatFileItem> = {}): ChatFileItem => ({
    key: 'upload:u1', kind: 'image', url: '/webhook/chat-uploads/u1', thumbUrl: '/webhook/chat-uploads/u1/thumb',
    name: 'гостиная.jpg', ext: 'jpg', createdAt: '2026-10-06T10:00:00.000Z', messageId: 0, stored: true,
    origin: 'upload', source: 'web', note: 'Фото гостиной: решили перекрасить стены в серый', uploadId: 'u1', ...p,
  });
  const blobRes = () => ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }) as any;
  const settle = async () => { await flush(); await flush(); };

  it('картинка — оригинал из blob через apiClient, пока едет — индикатор, а не <img> на приватный адрес', async () => {
    let resolve!: (v: unknown) => void;
    api.get.mockReturnValue(new Promise((r) => { resolve = r; }) as any);
    const { container, unmount } = mount(<MediaViewer items={[upload()]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="media-viewer-loading"]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // Просмотр — оригинал, не миниатюра.
    expect(api.get).toHaveBeenCalledWith('/webhook/chat-uploads/u1', expect.anything());

    await actAsync(() => { resolve(blobRes()); });
    await settle();
    expect(container.querySelector('img')!.getAttribute('src')).toBe('blob:viewer-1');
    expect(container.querySelector('[data-testid="media-viewer-loading"]')).toBeNull();
    unmount();
  });

  it('оригинал не загрузился (404) — значок с именем и «Скачать», а не бесконечный индикатор', async () => {
    api.get.mockResolvedValue({ ok: false, status: 404, blob: vi.fn() } as any);
    const { container, unmount } = mount(<MediaViewer items={[upload()]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    await settle();
    expect(container.querySelector('[data-testid="media-viewer-loading"]')).toBeNull();
    expect(container.querySelector('[data-testid="media-viewer-upload-file"]')!.textContent).toContain('гостиная.jpg');
    expect(byButton(container, new RegExp(tRu('chat.files.download')))).toBeTruthy();
    unmount();
  });

  it('blob пришёл, но браузер его не нарисовал (onError) — тот же значок с именем', async () => {
    api.get.mockResolvedValue(blobRes());
    const { container, unmount } = mount(<MediaViewer items={[upload()]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    await settle();
    const im = container.querySelector('img')!;
    act(() => { im.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-testid="media-viewer-upload-file"]')!.textContent).toContain('гостиная.jpg');
    unmount();
  });

  it('видео-загрузка — без плеера и без загрузки в память: название и «Скачать»', async () => {
    const v = upload({ key: 'upload:v1', kind: 'video', ext: 'mp4', name: 'кухня.mp4', url: '/webhook/chat-uploads/v1', thumbUrl: undefined, uploadId: 'v1' });
    const { container, unmount } = mount(<MediaViewer items={[v]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    await settle();
    expect(api.get).not.toHaveBeenCalled();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('[data-testid="media-viewer-upload-video"]')!.textContent).toContain('кухня.mp4');
    expect(byButton(container, new RegExp(tRu('chat.files.download')))).toBeTruthy();
    unmount();
  });

  // Поправка после ревью B1: HEIC/HEIF, BMP и прочее, что браузер не рисует,
  // миниатюры не получают. Оригинал в blob ради «битой картинки» не тянем —
  // значок файла с именем и «Скачать», как у документа.
  it('картинка, которую браузер не покажет (HEIC без миниатюры), — значок с именем и «Скачать», без запроса за blob', async () => {
    const heic = upload({ key: 'upload:h1', ext: 'heic', name: 'IMG_0001.heic', url: '/webhook/chat-uploads/h1', thumbUrl: undefined, uploadId: 'h1' });
    const { container, unmount } = mount(<MediaViewer items={[heic]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    await settle();
    expect(api.get).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-testid="media-viewer-loading"]')).toBeNull();
    const file = container.querySelector('[data-testid="media-viewer-upload-file"]')!;
    expect(file.querySelector('svg')).not.toBeNull();
    expect(file.textContent).toContain('IMG_0001.heic');
    click(byButton(container, new RegExp(tRu('chat.files.download')))!);
    expect(openChatUpload).toHaveBeenCalledWith('/webhook/chat-uploads/h1', tRu('chat.upload_download_error'), 'IMG_0001.heic');
    unmount();
  });

  it('картинка, которую браузер не покажет, но с миниатюрой (TIFF), — миниатюра из blob, оригинал не тянем', async () => {
    api.get.mockResolvedValue(blobRes());
    const tiff = upload({ key: 'upload:t1', ext: 'tiff', name: 'скан.tiff', url: '/webhook/chat-uploads/t1', thumbUrl: '/webhook/chat-uploads/t1/thumb', uploadId: 't1' });
    const { container, unmount } = mount(<MediaViewer items={[tiff]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    await settle();
    expect(api.get).toHaveBeenCalledWith('/webhook/chat-uploads/t1/thumb', expect.anything());
    expect(api.get).not.toHaveBeenCalledWith('/webhook/chat-uploads/t1', expect.anything());
    expect(container.querySelector('img')!.getAttribute('src')).toBe('blob:viewer-1');
    unmount();
  });

  it('«Скачать» — кнопка через openChatUpload (JWT) с именем файла; ссылки с href на приватный адрес нет', async () => {
    api.get.mockResolvedValue(blobRes());
    const onDownload = vi.fn();
    const { container, unmount } = mount(
      <MediaViewer items={[upload()]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} onDownload={onDownload} />,
    );
    await settle();
    expect(container.querySelector('a[href^="/webhook/chat-uploads/"]')).toBeNull();
    click(byButton(container, new RegExp(tRu('chat.files.download')))!);
    expect(openChatUpload).toHaveBeenCalledWith('/webhook/chat-uploads/u1', tRu('chat.upload_download_error'), 'гостиная.jpg');
    expect(onDownload).toHaveBeenCalledWith('image');
    unmount();
  });

  it('под файлом — полный комментарий ассистента с подписью, без обрезки', async () => {
    api.get.mockResolvedValue(blobRes());
    const long = Array.from({ length: 20 }, (_, i) => `Строка комментария ${i + 1}.`).join(' ');
    const { container, unmount } = mount(
      <MediaViewer items={[upload({ note: long })]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />,
    );
    await settle();
    const note = container.querySelector('[data-testid="media-viewer-note"]')!;
    expect(note.textContent).toContain(tRu('chat.files.note_label'));
    expect(note.textContent).toContain(long);
    expect(note.querySelector('.line-clamp-2')).toBeNull();
    unmount();
  });

  it('без комментария блока комментария нет', async () => {
    api.get.mockResolvedValue(blobRes());
    const { container, unmount } = mount(
      <MediaViewer items={[upload({ note: null })]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />,
    );
    await settle();
    expect(container.querySelector('[data-testid="media-viewer-note"]')).toBeNull();
    unmount();
  });

  it('«Удалить» — только у загрузки и только с onDelete; зовёт onDelete с этим файлом', async () => {
    api.get.mockResolvedValue(blobRes());
    const onDelete = vi.fn();
    const del = (c: HTMLElement) => byButton(c, new RegExp(tRu('chat.files.delete')));

    const a = mount(<MediaViewer items={[upload()]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);
    await settle();
    click(del(a.container)!);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ uploadId: 'u1' }));
    a.unmount();

    // Просмотр картинки из ленты (ChatImageAttachment) onDelete не передаёт.
    const b = mount(<MediaViewer items={[upload()]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    await settle();
    expect(del(b.container)).toBeNull();
    b.unmount();

    // Файлы ассистента пользователь не удаляет (спека, «Не делаем»).
    const c = mount(<MediaViewer items={[img(1)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} onDelete={onDelete} />);
    expect(del(c.container)).toBeNull();
    c.unmount();
  });
});
