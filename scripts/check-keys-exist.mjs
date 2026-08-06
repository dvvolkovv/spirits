#!/usr/bin/env node
/**
 * Падает, если код обращается к ключу, которого нет в ru.json.
 *
 * check-locales сверяет переводы С ИСТОЧНИКОМ, поэтому ключ, отсутствующий
 * в самом источнике, для неё невидим: он «есть везде», просто нигде нет.
 * i18next в таком случае молча показывает defaultValue из кода — то есть
 * русский текст во всех языках сразу, без единого предупреждения.
 *
 * Так три строки («или по телефону / email», «Поиск людей», «Совместимость»)
 * оставались русскими для англичан, испанцев, немцев, французов и китайцев.
 *
 * Запуск: pnpm check-keys
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatten } from './locale-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const localesDir = join(srcDir, 'i18n', 'locales');

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Ключи-литералы: `t('a.b')`, `t('a.b', 'дефолт')`, `<Trans i18nKey="a.b">`.
 * Динамические (`t(someVar)`, `t(\`a.${x}\`)`) пропускаем — статически их
 * не разрешить, и ложное срабатывание здесь хуже пропуска.
 */
const KEY_PATTERNS = [
  /\bt\(\s*'([a-zA-Z0-9_][a-zA-Z0-9_.]*)'/g,
  /\bt\(\s*"([a-zA-Z0-9_][a-zA-Z0-9_.]*)"/g,
  /i18nKey=\s*"([a-zA-Z0-9_][a-zA-Z0-9_.]*)"/g,
  /i18nKey=\s*'([a-zA-Z0-9_][a-zA-Z0-9_.]*)'/g,
];

/** Плюральные формы: в коде зовут базу, в локали лежат base_one/base_other. */
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

const source = flatten(JSON.parse(readFileSync(join(localesDir, 'ru.json'), 'utf8')));
const known = new Set(Object.keys(source));
const pluralBases = new Set();
for (const key of known) {
  const i = key.lastIndexOf('_');
  if (i > 0 && PLURAL_SUFFIXES.includes(key.slice(i + 1))) pluralBases.add(key.slice(0, i));
}

const missing = new Map();

for (const file of sourceFiles(srcDir)) {
  const code = readFileSync(file, 'utf8');
  for (const pattern of KEY_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(code)) !== null) {
      const key = m[1];
      if (known.has(key) || pluralBases.has(key)) continue;
      const line = code.slice(0, m.index).split('\n').length;
      if (!missing.has(key)) missing.set(key, []);
      missing.get(key).push(`${file.replace(srcDir, 'src')}:${line}`);
    }
  }
}

if (missing.size === 0) {
  console.log(`✅ все ключи из кода есть в ru.json (${known.size} ключей)`);
  process.exit(0);
}

console.error(`❌ ${missing.size} ключей нет в ru.json — их текст будет русским во всех языках:`);
for (const [key, places] of missing) {
  console.error(`   ${key}  ← ${places.slice(0, 3).join(', ')}`);
}
console.error('\nДобавьте ключ в ru.json и переводы, а defaultValue из кода уберите.');
process.exit(1);
