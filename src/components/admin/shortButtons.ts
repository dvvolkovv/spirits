/**
 * Классы кнопок решений по ролику — общие у строки (`ShortCard`) и раскрытой
 * карточки (`ShortActions`): одно и то же действие должно выглядеть одинаково
 * независимо от того, где кнопка нажата.
 */
export const BTN = 'px-3 py-1 text-xs rounded disabled:opacity-50';
export const PRIMARY = `${BTN} bg-forest-600 text-white hover:bg-forest-700`;
export const SECONDARY = `${BTN} bg-gray-100 hover:bg-gray-200`;
export const DANGER = `${BTN} bg-rose-50 text-rose-700 hover:bg-rose-100`;
