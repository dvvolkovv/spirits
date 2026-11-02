// src/components/chat/ChatImageAttachment.test.tsx
// @vitest-environment jsdom
//
// @testing-library/react в зависимостях репозитория нет (решение — см.
// комментарий в src/test/dom.tsx). Тест держится на том же крошечном
// стенде поверх react-dom/client, что и соседние .test.tsx. Открывает
// настоящий MediaViewer (у него свой useTranslation) — react-i18next мокнут,
// как в соседних тестах, где он встречается (ChatFilesPanel.test.tsx).
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { mount, click, byLink } from '../../test/dom';
import ChatImageAttachment from './ChatImageAttachment';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const props = {
  url: 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/a.jpg',
  name: 'a.jpg',
};

const img = (container: HTMLElement) => container.querySelector('img');
/** media-viewer рисуется порталом в document.body — мимо container мьюнта. */
const viewer = () => document.querySelector('[data-testid="media-viewer"]');
const fireError = (el: Element) => act(() => { el.dispatchEvent(new Event('error')); });
// cancelable: true — Escape в MediaViewer.tsx вызывает preventDefault.
const escape = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });

describe('ChatImageAttachment', () => {
  it('показывает сам файл (не миниатюру) и ссылку на него', () => {
    const { container } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    expect(img(container)!.getAttribute('src')).toBe(props.url);
    expect(img(container)!.getAttribute('alt')).toBe(props.name);
    expect(byLink(container, /Скачать a\.jpg/)).not.toBeNull();
  });

  it('ошибка загрузки — картинки нет, ссылка остаётся', () => {
    const { container } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    fireError(img(container)!);
    expect(img(container)).toBeNull();
    expect(byLink(container, /Скачать a\.jpg/)).not.toBeNull();
  });

  it('клик по картинке открывает просмотрщик, Esc закрывает', () => {
    const { container } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    expect(viewer()).toBeNull();
    click(img(container)!);
    expect(viewer()).not.toBeNull();
    escape();
    expect(viewer()).toBeNull();
  });

  it('клик по картинке открывает просмотрщик, кнопка «Закрыть» тоже закрывает', () => {
    const { container } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    click(img(container)!);
    const dialog = viewer();
    expect(dialog).not.toBeNull();
    // Один элемент — без стрелок «вперёд»/«назад» (items.length === 1),
    // кнопка внутри диалога однозначно «Закрыть».
    click(dialog!.querySelector('button')!);
    expect(viewer()).toBeNull();
  });

  it('ссылка ведёт на файл, открывается в новой вкладке, не перехватывается кликом', () => {
    const { container } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    const link = byLink(container, /Скачать a\.jpg/)!;
    expect(link.getAttribute('href')).toBe(props.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('ссылка — мимо «Внешних переходов» Метрики', () => {
    const { container } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    expect(byLink(container, /Скачать a\.jpg/)!.className).toContain('ym-disable-tracklink');
  });

  it('обёртка — ym-hide-content и not-prose', () => {
    const { container } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    const wrap = container.querySelector('[data-testid="chat-image-attachment"]')!;
    expect(wrap.className).toContain('ym-hide-content');
    expect(wrap.className).toContain('not-prose');
  });
});
