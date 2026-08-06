#!/usr/bin/env node
/**
 * Падает, если числа или даты форматируются жёстко заданной локалью.
 *
 * `toLocaleString('ru-RU')` внешне работает и на ревью не бросается в глаза,
 * но немцу показывает русские разряды, а американцу — русский порядок даты.
 * Ни один из прежних сторожей этого не видел: строка не является текстом
 * интерфейса, ключа локали у неё нет, и переводить там нечего.
 *
 * Так набралось 33 таких места в 18 файлах.
 *
 * Правильный способ — форматтеры из src/utils/formatters.ts: они берут
 * активный язык из i18next.
 *
 * Запуск: pnpm check-locale-format
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'src');

/**
 * Админка не локализуется по решению из спеки — её видит только
 * администратор, аудитория русскоязычная. Сами форматтеры и их тесты
 * обязаны упоминать локали по своей природе.
 */
const SKIP = [
  join(srcDir, 'components', 'admin'),
  join(srcDir, 'utils', 'formatters.ts'),
  join(srcDir, 'utils', 'formatters.test.ts'),
  join(srcDir, 'i18n'),
];

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP.some((s) => full === s || full.startsWith(s + '/'))) continue;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** `toLocaleString('ru-RU')`, `toLocaleDateString("en-US", …)` и т.п. */
const PATTERN = /toLocale(?:Date|Time)?String\(\s*['"][a-z]{2}-[A-Z]{2}['"]/g;

const hits = [];
for (const file of sourceFiles(srcDir)) {
  const code = readFileSync(file, 'utf8');
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    // Комментарии пропускаем: они объясняют, почему так делать нельзя.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    PATTERN.lastIndex = 0;
    if (PATTERN.test(line)) {
      hits.push(`${relative(root, file)}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}

if (hits.length === 0) {
  console.log('✅ жёстко заданных локалей в форматировании нет');
  process.exit(0);
}

console.error(`❌ ${hits.length} мест форматируют жёстко заданной локалью:`);
for (const h of hits) console.error(`   ${h}`);
console.error('\nИспользуйте formatNumber / formatDate / formatTime / formatDateTime');
console.error('из src/utils/formatters.ts — они берут активный язык из i18next.');
process.exit(1);
