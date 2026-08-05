/**
 * Общие операции над локалями для check-locales и translate-locales.
 * Чистые функции без ввода-вывода — тестируются без сети и файловой системы.
 */

export function flatten(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

export function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] ??= {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

const isBlank = (value) => value === undefined || value === null || value === '';

/**
 * Ключи источника, которых нет в цели или которые там пусты.
 * Ключи, пустые в самом источнике, не считаются недостающими: в ru.json
 * есть намеренно пустые значения (например chat.welcome_message), и
 * требовать их «перевод» бессмысленно.
 */
export function missingKeys(sourceFlat, targetFlat) {
  return Object.keys(sourceFlat).filter(
    (key) => !isBlank(sourceFlat[key]) && isBlank(targetFlat[key]),
  );
}

/**
 * И интерполяция i18next ({{count}}), и кастомные теги CustomMarkdown
 * ({{button: … | action: …}}) используют двойные фигурные скобки.
 * Модель, «переведшая» содержимое тега кнопки, тихо ломает рендер,
 * поэтому весь фрагмент от {{ до }} считается неделимым плейсхолдером.
 */
export function extractPlaceholders(text) {
  if (typeof text !== 'string') return [];
  return text.match(/\{\{[^}]*\}\}/g) ?? [];
}

export function placeholdersMatch(source, translated) {
  const a = extractPlaceholders(source).slice().sort();
  const b = extractPlaceholders(translated).slice().sort();
  if (a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}
