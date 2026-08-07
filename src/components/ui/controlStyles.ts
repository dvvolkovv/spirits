/**
 * Единственный источник правды про геометрию элементов управления.
 *
 * Вынесено в чистый модуль, а не спрятано внутрь компонентов, потому что
 * vitest в проекте настроен на environment: 'node' — отрендерить React в
 * тесте нельзя. Так вся логика системы остаётся под тестами, а компоненты
 * остаются тонкими обёртками.
 *
 * До этого на экране входа сосуществовали три роста кнопок (py-2, py-3,
 * py-3 с тенью) и два роста полей с разным кеглем и разной толщиной
 * фокус-кольца.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** 44 px — минимальная комфортная цель нажатия на мобильном. */
export const CONTROL_HEIGHT = 'h-11';
export const CONTROL_RADIUS = 'rounded-xl';

const BUTTON_BASE = [
  'w-full inline-flex items-center justify-center gap-2',
  CONTROL_HEIGHT,
  CONTROL_RADIUS,
  'px-4 text-sm font-medium',
  'transition-colors duration-150',
  'active:scale-[0.99] motion-reduce:active:scale-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700/40',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
].join(' ');

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-forest-800 text-white hover:bg-forest-900',
  secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
  ghost: 'bg-white border border-forest-200 text-forest-800 hover:bg-forest-50',
};

export function buttonClasses(variant: ButtonVariant, extra?: string): string {
  return [BUTTON_BASE, BUTTON_VARIANT[variant], extra].filter(Boolean).join(' ');
}

const FIELD_BASE = [
  'w-full bg-white',
  CONTROL_HEIGHT,
  CONTROL_RADIUS,
  'px-3.5 text-[15px] text-gray-900 placeholder:text-gray-400',
  'border transition-colors duration-150',
  'focus:outline-none focus:ring-2',
].join(' ');

export function fieldClasses(hasError: boolean, extra?: string): string {
  const state = hasError
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
    : 'border-gray-200 focus:border-forest-700 focus:ring-forest-700/20';
  return [FIELD_BASE, state, extra].filter(Boolean).join(' ');
}
