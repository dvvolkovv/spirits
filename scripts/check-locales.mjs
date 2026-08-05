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

const pluralParts = (key) => {
  const i = key.lastIndexOf('_');
  if (i < 0) return null;
  const suffix = key.slice(i + 1);
  return PLURAL_SUFFIXES.includes(suffix) ? { base: key.slice(0, i), suffix } : null;
};

/**
 * Набор ключей, обязательных для локали.
 *
 * Формы множественного числа НЕ переносятся из русского один к одному:
 * категории разных языков не соответствуют друг другу. У русского `many` —
 * это «5 дней», у испанского и французского `many` — миллионы («1 000 000
 * de jours»), у немецкого её нет вовсе, а `other` есть почти везде, хотя
 * в русском источнике этого ключа может не быть.
 *
 * Поэтому для каждого «базового» ключа, у которого в источнике есть хоть
 * одна плюральная форма, требуем ровно те категории, которые есть у самой
 * целевой локали (Intl.PluralRules), а не те, что оказались у русского.
 */
function requiredKeysFor(source, locale) {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  // Ключ считаем плюральным, только если у базы есть НЕСКОЛЬКО форм-соседей.
  // Иначе `settings.calendar.connect_other` («Подключить другой аккаунт»)
  // принимался за форму множественного числа, и от локалей требовали
  // несуществующий `connect_one`.
  const groups = new Map();
  for (const key of Object.keys(source)) {
    const parts = pluralParts(key);
    if (!parts) continue;
    if (!groups.has(parts.base)) groups.set(parts.base, []);
    groups.get(parts.base).push(key);
  }
  const pluralBases = new Map();
  for (const [base, keys] of groups) {
    if (keys.length > 1) pluralBases.set(base, source[keys[0]]);
  }

  const required = {};
  for (const [key, value] of Object.entries(source)) {
    const parts = pluralParts(key);
    if (parts && pluralBases.has(parts.base)) continue;
    required[key] = value;
  }
  for (const [base, sample] of pluralBases) {
    for (const category of categories) required[`${base}_${category}`] = sample;
  }
  return required;
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
  const required = requiredKeysFor(source, code);
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
