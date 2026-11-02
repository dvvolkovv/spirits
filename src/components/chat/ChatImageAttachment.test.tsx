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
import { mount, click, byLink, tRu } from '../../test/dom';
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
/**
 * Кнопка-обёртка картинки — единственная <button> внутри container:
 * просмотрщик рисуется порталом мимо него (в document.body), поэтому его
 * кнопки сюда не попадают ни до, ни после открытия.
 */
const imgBtn = (container: HTMLElement) => container.querySelector('button') as HTMLButtonElement | null;
/** media-viewer рисуется порталом в document.body — мимо container мьюнта. */
const viewer = () => document.querySelector('[data-testid="media-viewer"]');
const byAria = (c: ParentNode, label: string) => c.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const fireError = (el: Element) => act(() => { el.dispatchEvent(new Event('error')); });
// cancelable: true — Escape в MediaViewer.tsx вызывает preventDefault.
const escape = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });

describe('ChatImageAttachment', () => {
  it('показывает сам файл (не миниатюру) и ссылку на него; картинка — за кнопкой с aria-label', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    expect(img(container)!.getAttribute('src')).toBe(props.url);
    expect(img(container)!.getAttribute('alt')).toBe(props.name);
    expect(byLink(container, /Скачать a\.jpg/)).not.toBeNull();
    // Доступность: картинка — за кнопкой (не только за мышиным кликом по
    // <img>), подпись — «Картинка: a.jpg».
    expect(imgBtn(container)).not.toBeNull();
    expect(imgBtn(container)!.getAttribute('aria-label')).toBe(`${tRu('chat.files.image')}: ${props.name}`);
    unmount();
  });

  it('ошибка загрузки — картинки нет, ссылка остаётся', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    fireError(img(container)!);
    expect(img(container)).toBeNull();
    expect(byLink(container, /Скачать a\.jpg/)).not.toBeNull();
    unmount();
  });

  it('клик по картинке открывает просмотрщик, Esc закрывает и возвращает фокус на кнопку-картинку', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    expect(viewer()).toBeNull();
    click(img(container)!);
    expect(viewer()).not.toBeNull();
    escape();
    expect(viewer()).toBeNull();
    // Фокус — на кнопку-картинку, а не на ссылку «Скачать»: человек жмёт Esc
    // после просмотра и должен попасть обратно туда, откуда открывал.
    expect(document.activeElement).toBe(imgBtn(container));
    unmount();
  });

  it('клик по картинке открывает просмотрщик, кнопка «Закрыть» (по aria-label) тоже закрывает и возвращает фокус', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    click(img(container)!);
    const dialog = viewer();
    expect(dialog).not.toBeNull();
    // По aria-label (= перевод chat.files.close), а не querySelector('button')
    // «первая попавшаяся»: у просмотра есть и другие кнопки (стрелки при
    // нескольких файлах) — здесь их нет, но проверка должна быть точной
    // независимо от этого.
    const closeBtn = byAria(dialog!, tRu('chat.files.close'));
    expect(closeBtn).not.toBeNull();
    click(closeBtn!);
    expect(viewer()).toBeNull();
    expect(document.activeElement).toBe(imgBtn(container));
    unmount();
  });

  it('просмотрщик рисуется порталом в document.body, а не внутри ленты', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    click(img(container)!);
    const dialog = viewer()!;
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    unmount();
  });

  it('ссылка ведёт на файл, открывается в новой вкладке, не перехватывается кликом', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    const link = byLink(container, /Скачать a\.jpg/)!;
    expect(link.getAttribute('href')).toBe(props.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    unmount();
  });

  it('клик по ссылке «Скачать» не перехватывается обработчиком и не открывает просмотрщик', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    const link = byLink(container, /Скачать a\.jpg/)!;
    let seenDefaultPrevented: boolean | null = null;
    // Слушатель на document — выше React-делегирования на корне мьюнта —
    // видит событие ПОСЛЕ любого обработчика ссылки внутри компонента: если
    // бы там был свой onClick с preventDefault (как у остальных ссылок чата,
    // ChatInterface.tsx), defaultPrevented здесь было бы уже true. Сам же
    // вызывает preventDefault() — иначе jsdom пытается настоящую навигацию
    // по target=_blank и роняет тест шумом в консоль.
    const onDocClick = (e: MouseEvent) => {
      seenDefaultPrevented = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener('click', onDocClick);
    try {
      act(() => {
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    } finally {
      document.removeEventListener('click', onDocClick);
    }
    expect(seenDefaultPrevented).toBe(false);
    expect(viewer()).toBeNull();
    unmount();
  });

  it('ссылка — мимо «Внешних переходов» Метрики', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    expect(byLink(container, /Скачать a\.jpg/)!.className).toContain('ym-disable-tracklink');
    unmount();
  });

  it('обёртка — ym-hide-content и not-prose', () => {
    const { container, unmount } = mount(<ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>);
    const wrap = container.querySelector('[data-testid="chat-image-attachment"]')!;
    expect(wrap.className).toContain('ym-hide-content');
    expect(wrap.className).toContain('not-prose');
    unmount();
  });

  it('нажатие «Скачать» в просмотрщике вызывает onDownload (статистика «из ленты»)', () => {
    const onDownload = vi.fn();
    const { container, unmount } = mount(
      <ChatImageAttachment {...props} onDownload={onDownload}>Скачать a.jpg</ChatImageAttachment>,
    );
    click(img(container)!);
    const dialog = viewer() as HTMLElement;
    click(byLink(dialog, new RegExp(tRu('chat.files.download')))!);
    expect(onDownload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('перерисовка (новый текст стрима, тот же файл) не переподписывает keydown просмотрщика на window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    try {
      const keydownAdds = () => addSpy.mock.calls.filter((c) => c[0] === 'keydown').length;
      const keydownRemoves = () => removeSpy.mock.calls.filter((c) => c[0] === 'keydown').length;
      const { container, rerender, unmount } = mount(
        <ChatImageAttachment {...props}>Скачать a.jpg</ChatImageAttachment>,
      );
      click(img(container)!);
      const addsAfterOpen = keydownAdds();
      const removesAfterOpen = keydownRemoves();

      // Тот же url/name — стрим дописал соседний текст в тот же пузырь,
      // ChatImageAttachment перерисовался, но это та же картинка: items,
      // onClose и onIndexChange обязаны остаться той же ссылкой, иначе
      // MediaViewer (keydown-эффект зависит от onClose/onIndexChange)
      // снимет и переставит слушатель — тот уедет в конец списка слушателей
      // window, за слушателем соседних панелей (та же ловушка, что в
      // ChatFilesPanel.tsx, разобрана в её тесте «перерисовка с новым
      // onClose не переподписывает слушатель»).
      rerender(<ChatImageAttachment {...props}>Скачать a.jpg (ещё немного текста)</ChatImageAttachment>);

      expect(keydownAdds()).toBe(addsAfterOpen);
      expect(keydownRemoves()).toBe(removesAfterOpen);
      unmount();
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});
