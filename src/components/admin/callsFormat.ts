/**
 * Форматирование для раздела звонков.
 *
 * Отдельный модуль, а не экспорт из AdminCallsView: из файла с компонентом
 * нельзя экспортировать ещё и функции — ломается hot reload (правило
 * react-refresh/only-export-components), да и тесту не нужен весь React.
 */

export const formatTokens = (n: number) => n.toLocaleString('ru-RU');

/**
 * Длительность словами, а не в секундах: в таблице стоят суммы за месяц, и
 * «7830» читается хуже, чем «2 ч 10 мин». Секунды показываем только когда
 * минут нет вовсе — иначе сорвавшийся сорокасекундный звонок выглядел бы
 * как «0 мин», то есть неотличимо от отсутствия разговора.
 */
export const formatDuration = (sec: number) => {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h} ч ${m} мин`;
  if (m) return `${m} мин`;
  return `${sec} с`;
};

/** Дата и время последнего звонка — без секунд, они в таблице не нужны. */
export const formatWhen = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
