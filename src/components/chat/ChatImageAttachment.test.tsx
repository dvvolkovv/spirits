// src/components/chat/ChatImageAttachment.test.tsx
// @vitest-environment jsdom
//
// @testing-library/react в зависимостях репозитория нет (решение — см.
// комментарий в src/test/dom.tsx: заводить библиотеку ради нескольких
// запросов к DOM — это правка package.json и pnpm-lock.yaml в ветке, где
// параллельно работают другие сессии). Тест держится на том же крошечном
// стенде поверх react-dom/client, что и соседние .test.tsx (пример с той же
// последовательностью «миниатюра → оригинал → значок» — ChatFilesPanel.test.tsx).
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { mount, click, byLink } from '../../test/dom';
import ChatImageAttachment from './ChatImageAttachment';

const props = {
  thumbUrl: '/webhook/chat/thumb?src=x',
  fullUrl: 'https://my.linkeon.io/smm-media/linkeon-chat-files/k/a.jpg',
  alt: 'a.jpg',
};

const img = (container: HTMLElement) => container.querySelector('img');
const fireError = (el: Element) => act(() => { el.dispatchEvent(new Event('error')); });

describe('ChatImageAttachment', () => {
  it('показывает миниатюру и ссылку на оригинал', () => {
    const { container } = mount(
      <ChatImageAttachment {...props} onOpen={vi.fn()}>Скачать a.jpg</ChatImageAttachment>,
    );
    expect(img(container)!.getAttribute('src')).toBe(props.thumbUrl);
    expect(byLink(container, /Скачать a\.jpg/)).not.toBeNull();
  });

  it('миниатюра не загрузилась — показывает оригинал', () => {
    const { container } = mount(
      <ChatImageAttachment {...props} onOpen={vi.fn()}>Скачать a.jpg</ChatImageAttachment>,
    );
    fireError(img(container)!);
    expect(img(container)!.getAttribute('src')).toBe(props.fullUrl);
  });

  it('и оригинал не загрузился — картинки нет, ссылка остаётся', () => {
    const { container } = mount(
      <ChatImageAttachment {...props} onOpen={vi.fn()}>Скачать a.jpg</ChatImageAttachment>,
    );
    fireError(img(container)!);
    fireError(img(container)!);
    expect(img(container)).toBeNull();
    expect(byLink(container, /Скачать a\.jpg/)).not.toBeNull();
  });

  it('клик по миниатюре и по ссылке — открыть оригинал', () => {
    const onOpen = vi.fn();
    const { container } = mount(
      <ChatImageAttachment {...props} onOpen={onOpen}>Скачать a.jpg</ChatImageAttachment>,
    );
    click(img(container)!);
    click(byLink(container, /Скачать a\.jpg/)!);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('ссылка — мимо «Внешних переходов» Метрики', () => {
    const { container } = mount(
      <ChatImageAttachment {...props} onOpen={vi.fn()}>Скачать a.jpg</ChatImageAttachment>,
    );
    expect(byLink(container, /Скачать a\.jpg/)!.className).toContain('ym-disable-tracklink');
  });
});
