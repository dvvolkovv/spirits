/**
 * Общая ловушка Tab/Shift+Tab для модальных поверхностей «Медиа и файлы»
 * (ChatFilesPanel.tsx, MediaViewer.tsx). У каждой поверхности — свой корень:
 * ловушка никогда не смотрит за пределы root, иначе Tab с последнего
 * элемента верхней поверхности (просмотра) утекает на элементы нижней
 * (панели), которые физически лежат в том же DOM-поддереве, просто
 * перекрыты сверху.
 */

const FOCUSABLE_SELECTOR = 'button:not(:disabled), a[href], video, [tabindex]:not([tabindex="-1"])';

/**
 * display:none/visibility:hidden где-то на пути от узла до root (сам root не
 * проверяется — его видимость не вопрос ловушки).
 *
 * Не offsetParent/getClientRects: jsdom не считает layout, оба вернут
 * null/пустой прямоугольник для вообще любого узла — проверка по ним
 * исправно гасила бы ловушку целиком в тестах. getComputedStyle в jsdom
 * честно отражает инлайновые стили и то, что реально выставлено в классах,
 * этого достаточно для «CSS-media-query скрыла кнопку» (sm:hidden и т. п.).
 */
function isHiddenInTree(el: HTMLElement, root: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    node = node.parentElement;
  }
  return false;
}

/** Живой список видимых фокусируемых узлов внутри root, в порядке DOM. */
export function getVisibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !isHiddenInTree(el, root),
  );
}

/**
 * Обработчик Tab/Shift+Tab, зацикливающий фокус внутри root. Вызывающая
 * сторона уже отфильтровала событие по `e.key === 'Tab'`.
 */
export function trapTab(root: HTMLElement, e: KeyboardEvent): void {
  const focusables = getVisibleFocusables(root);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
