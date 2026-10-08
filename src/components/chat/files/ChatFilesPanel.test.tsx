// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { mount, flush, click, clickAsync, byButton, byLink, visibleText, tRu } from '../../../test/dom';
import ChatFilesPanel from './ChatFilesPanel';
import { apiClient } from '../../../services/apiClient';
import type { ChatFileItem } from './chatFiles';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const api = vi.mocked(apiClient);

const ok = (items: ChatFileItem[]) => ({ ok: true, json: async () => ({ items }) }) as any;
const settle = async () => { await flush(); await flush(); };
const f = (p: Partial<ChatFileItem>): ChatFileItem => ({
  key: p.key ?? p.name ?? 'k', kind: 'image', url: 'https://pub/a.png', name: 'a.png', ext: 'png',
  createdAt: '2026-10-05T10:00:00.000Z', messageId: 1, stored: true, ...p,
});
const ITEMS: ChatFileItem[] = [
  f({ key: 'i1', name: 'i1.png', url: 'https://pub/i1.png', createdAt: '2026-10-05T10:00:00.000Z' }),
  f({ key: 'i2', name: 'i2.png', url: 'https://pub/i2.png', createdAt: '2026-10-02T10:00:00.000Z' }),
  f({ key: 'pdf', kind: 'document', ext: 'pdf', name: 'report.pdf', url: 'https://pub/report.pdf', createdAt: '2026-10-01T10:00:00.000Z' }),
  f({ key: 'v1', kind: 'video', ext: 'mp4', name: 'v1.mp4', url: 'https://pub/v1.mp4', thumbUrl: 'https://pub/v1.jpg', createdAt: '2026-09-20T10:00:00.000Z' }),
  f({ key: 'gone-img', name: 'chart.png', stored: false, url: undefined, createdAt: '2026-08-01T10:00:00.000Z' }),
  f({ key: 'gone-doc', kind: 'document', ext: 'docx', name: 'old.docx', stored: false, url: undefined, createdAt: '2026-08-01T10:00:00.000Z' }),
];
const tab = (c: HTMLElement, key: string) =>
  Array.from(c.querySelectorAll('[role="tab"]')).find((b) => (b.textContent ?? '').startsWith(tRu(key))) as HTMLButtonElement;
const press = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });

describe('ChatFilesPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('просит файлы именно этой переписки', async () => {
    api.get.mockResolvedValue(ok([]));
    mount(<ChatFilesPanel assistantId={12} freshTs="1728000000000" onClose={vi.fn()} />);
    await settle();
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/files?assistantId=12&freshTs=1728000000000');
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

  it('файл скачивается по ссылке под своим именем', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    click(tab(container, 'chat.files.tab_files'));
    const a = byLink(container, /report\.pdf/)!;
    expect(a.getAttribute('href')).toBe('https://pub/report.pdf');
    expect(a.getAttribute('download')).toBe('report.pdf');
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
    const tiles = container.querySelectorAll(`button[aria-label="${tRu('chat.files.image')}"]`);
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
    const tiles = container.querySelectorAll(`button[aria-label="${tRu('chat.files.image')}"]`);
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
