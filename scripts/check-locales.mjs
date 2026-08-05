#!/usr/bin/env node
/**
 * Падает, если в какой-либо локали нет ключа из ru.json.
 * ru.json — источник правды; всё остальное обязано его покрывать.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flatten, missingKeys } from './locale-utils.mjs';

// Список продублирован из src/i18n/languages.ts намеренно: тот файл —
// TypeScript, node его не исполнит. check-locales.test.mjs следит,
// чтобы дубль не разъехался с реестром.
const SUPPORTED_CODES = ['ru', 'en', 'es', 'de', 'fr', 'zh'];
const DEFAULT_LANGUAGE = 'ru';

/**
 * Админка не локализуется по решению из спеки: её видит только isAdmin,
 * аудитория русскоязычная. Ключи admin.* остаются лишь в ru.json,
 * i18next отдаёт по ним русский фолбэк — это и есть желаемое поведение,
 * поэтому требовать их в остальных локалях нельзя.
 */
const UNTRANSLATED_PREFIXES = ['admin.'];

const isTranslatable = (key) => !UNTRANSLATED_PREFIXES.some((p) => key.startsWith(p));

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * Формы множественного числа зависят от языка: у русского их четыре
 * (one/few/many/other), у английского и немецкого две, у китайского одна.
 * Требовать от en ключ chat.file_count_few бессмысленно — по правилам CLDR
 * i18next его никогда не выберет. Категории берём из Intl.PluralRules,
 * а не из захардкоженного списка.
 */
function isRequiredFor(key, locale) {
  const suffix = key.split('_').pop();
  if (!PLURAL_SUFFIXES.includes(suffix)) return true;
  return new Intl.PluralRules(locale).resolvedOptions().pluralCategories.includes(suffix);
}

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'i18n', 'locales');

function load(code) {
  return JSON.parse(readFileSync(join(localesDir, `${code}.json`), 'utf8'));
}

const source = Object.fromEntries(
  Object.entries(flatten(load(DEFAULT_LANGUAGE))).filter(([key]) => isTranslatable(key)),
);
const sourceCount = Object.keys(source).length;
let failed = false;

for (const code of SUPPORTED_CODES) {
  if (code === DEFAULT_LANGUAGE) continue;
  const required = Object.fromEntries(
    Object.entries(source).filter(([key]) => isRequiredFor(key, code)),
  );
  const requiredCount = Object.keys(required).length;
  const missing = missingKeys(required, flatten(load(code)));
  if (missing.length === 0) {
    console.log(`✅ ${code}: ${requiredCount}/${requiredCount} ключей`);
    continue;
  }
  failed = true;
  console.error(`❌ ${code}: не хватает ${missing.length} из ${requiredCount} ключей`);
  for (const key of missing.slice(0, 20)) console.error(`   ${key}`);
  if (missing.length > 20) console.error(`   … и ещё ${missing.length - 20}`);
}

if (failed) {
  console.error('\nЗапустите: pnpm translate-locales');
  process.exit(1);
}
