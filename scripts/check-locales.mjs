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

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'i18n', 'locales');

function load(code) {
  return JSON.parse(readFileSync(join(localesDir, `${code}.json`), 'utf8'));
}

const source = flatten(load(DEFAULT_LANGUAGE));
const sourceCount = Object.keys(source).length;
let failed = false;

for (const code of SUPPORTED_CODES) {
  if (code === DEFAULT_LANGUAGE) continue;
  const missing = missingKeys(source, flatten(load(code)));
  if (missing.length === 0) {
    console.log(`✅ ${code}: ${sourceCount}/${sourceCount} ключей`);
    continue;
  }
  failed = true;
  console.error(`❌ ${code}: не хватает ${missing.length} из ${sourceCount} ключей`);
  for (const key of missing.slice(0, 20)) console.error(`   ${key}`);
  if (missing.length > 20) console.error(`   … и ещё ${missing.length - 20}`);
}

if (failed) {
  console.error('\nЗапустите: pnpm translate-locales');
  process.exit(1);
}
