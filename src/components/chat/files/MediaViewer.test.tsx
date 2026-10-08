// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { mount, click, byLink, tRu } from '../../../test/dom';
import MediaViewer from './MediaViewer';
import type { ChatFileItem } from './chatFiles';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});

const img = (n: number): ChatFileItem => ({
  key: `k${n}`, kind: 'image', url: `https://pub/${n}.png`, name: `${n}.png`, ext: 'png',
  createdAt: '2026-10-05T10:00:00.000Z', messageId: n, stored: true,
});
const video: ChatFileItem = { ...img(9), key: 'v', kind: 'video', url: 'https://pub/v.mp4', name: 'v.mp4', ext: 'mp4' };
const key = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });
const byAria = (c: HTMLElement, label: string) => c.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

describe('MediaViewer', () => {
  it('показывает картинку и даёт её скачать под своим именем', () => {
    const { container } = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://pub/1.png');
    const a = byLink(container, new RegExp(tRu('chat.files.download')))!;
    expect(a.getAttribute('href')).toBe('https://pub/1.png');
    expect(a.getAttribute('download')).toBe('1.png');
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

  it('видео — плеер', () => {
    const { container } = mount(<MediaViewer items={[video]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://pub/v.mp4');
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
