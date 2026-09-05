/**
 * Позиция плавающей кнопки звонка: арифметика перетаскивания без React.
 *
 * Зачем кнопку вообще двигать: поле ввода в чате растёт вверх по мере набора
 * текста, и на длинном сообщении догоняет кнопку — та закрывает «отправить»
 * (репорт владельца 05.09.2026). Любая фиксированная точка рано или поздно
 * оказывается под растущим полем, поэтому решение — отдать позицию человеку.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Кнопка 56×56 плюс поля, чтобы она не липла к самому краю. */
export const BUTTON_SIZE = 56;
export const EDGE_MARGIN = 8;

/**
 * Ниже этого сдвига жест считаем нажатием, а не перетаскиванием.
 *
 * Без порога палец, дрогнувший на пару пикселей, отменял бы звонок: обычный
 * тап почти никогда не бывает идеально неподвижным.
 */
export const TAP_THRESHOLD_PX = 6;

export function isTap(from: Point, to: Point): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) < TAP_THRESHOLD_PX;
}

/**
 * Держим кнопку целиком внутри экрана.
 *
 * Нужно не только при перетаскивании: телефон поворачивают, окно браузера
 * меняют размер, а сохранённая позиция переживает и то, и другое — без
 * пересчёта кнопка уехала бы за границу и стала недоступной навсегда.
 */
export function clampPosition(pos: Point, viewport: Viewport): Point {
  const maxX = Math.max(EDGE_MARGIN, viewport.width - BUTTON_SIZE - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, viewport.height - BUTTON_SIZE - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(pos.x, EDGE_MARGIN), maxX),
    y: Math.min(Math.max(pos.y, EDGE_MARGIN), maxY),
  };
}

const STORAGE_KEY = 'floating_call_button_pos';

/**
 * Позиция по умолчанию — там же, где кнопка стояла до перетаскивания: правый
 * край, над нижней навигацией. Считаем от размеров экрана, а не константой:
 * иначе на низком экране дефолт оказался бы за границей.
 */
export function defaultPosition(viewport: Viewport, inChat: boolean): Point {
  const fromBottom = inChat ? 176 : 96;
  return clampPosition(
    { x: viewport.width - BUTTON_SIZE - 16, y: viewport.height - BUTTON_SIZE - fromBottom },
    viewport,
  );
}

/** Прочитать сохранённую позицию. Мусор в хранилище — не повод падать. */
export function loadPosition(storage: Pick<Storage, 'getItem'>): Point | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

/** Сохранить позицию. Переполненное хранилище не должно ломать перетаскивание. */
export function savePosition(storage: Pick<Storage, 'setItem'>, pos: Point): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* приватный режим или квота — позиция просто не переживёт перезагрузку */
  }
}
