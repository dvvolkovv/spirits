#!/usr/bin/env node
/**
 * Переводит недостающие ключи локалей через Claude API.
 * Источник правды — ru.json. Переводятся только ключи, которых нет в цели,
 * поэтому повторный запуск после добавления одного ключа стоит один запрос.
 *
 *   pnpm translate-locales           # все языки
 *   pnpm translate-locales es de     # только указанные
 *
 * Требует ANTHROPIC_API_KEY в окружении либо активный профиль `ant auth login`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flatten, unflatten, missingKeys, placeholdersMatch } from './locale-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'i18n', 'locales');

const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish (Spain)',
  de: 'German',
  fr: 'French',
  zh: 'Simplified Chinese',
};

const GLOSSARY = `
- "Linkeon" / "LINKEON.IO" — название продукта, НЕ переводить и не транслитерировать.
- «Ассистент» — переводить как assistant / asistente / Assistent / assistant / 助手.
  Это термин продукта: НИКОГДА не использовать «агент» или его эквиваленты.
- «Нетворкинг» — раздел поиска партнёров: Networking / Networking / Networking / Réseautage / 人脉拓展.
- «токены» — внутренняя валюта: tokens / tokens / Tokens / jetons / 代币.
- «Совместимость» — compatibility / compatibilidad / Kompatibilität / compatibilité / 契合度.
`;

const CHUNK_SIZE = 40;

const client = new Anthropic();

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'object',
      description: 'Ключ локали → перевод. Ровно те же ключи, что во входных данных.',
      additionalProperties: { type: 'string' },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

async function translateChunk(entries, targetCode) {
  const languageName = LANGUAGE_NAMES[targetCode];
  const payload = Object.fromEntries(entries);

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
    },
    system: `Ты переводишь строки интерфейса веб-приложения Linkeon с русского на ${languageName}.

ГЛОССАРИЙ (обязателен):${GLOSSARY}

ПРАВИЛА:
1. Плейсхолдеры переносить ПОБАЙТОВО, не переводя их содержимое.
   Это касается и интерполяции {{count}}, и кастомных тегов
   {{button: Текст | action: … | variant: … | icon: …}} и {{link: Текст | url: …}}.
   Весь фрагмент от {{ до }} копируется как есть.
2. Сохранять пунктуацию, эмодзи, переводы строк и HTML-теги исходной строки.
3. Это интерфейс: держать перевод коротким. Длинная строка ломает вёрстку кнопок и меток.
4. Обращение к пользователю — на «ты» там, где язык это различает (tú, du, tu).
5. Вернуть РОВНО те же ключи, что пришли на вход. Ничего не добавлять и не выбрасывать.`,
    messages: [
      {
        role: 'user',
        content: `Переведи значения на ${languageName}:\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Модель отклонила запрос: ${response.stop_details?.category ?? 'unknown'}`);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('В ответе модели нет текстового блока');
  return JSON.parse(textBlock.text).translations;
}

async function translateLanguage(targetCode, sourceFlat) {
  const targetPath = join(localesDir, `${targetCode}.json`);
  const target = JSON.parse(readFileSync(targetPath, 'utf8'));
  const targetFlat = flatten(target);

  const missing = missingKeys(sourceFlat, targetFlat);
  if (missing.length === 0) {
    console.log(`✅ ${targetCode}: всё переведено, запросов не нужно`);
    return;
  }

  console.log(`🔤 ${targetCode}: не хватает ${missing.length} ключей`);

  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunkKeys = missing.slice(i, i + CHUNK_SIZE);
    const entries = chunkKeys.map((key) => [key, sourceFlat[key]]);
    const chunkNo = Math.floor(i / CHUNK_SIZE) + 1;
    const chunkTotal = Math.ceil(missing.length / CHUNK_SIZE);
    process.stdout.write(`   пачка ${chunkNo}/${chunkTotal} … `);

    const translated = await translateChunk(entries, targetCode);

    let rejected = 0;
    for (const key of chunkKeys) {
      const value = translated[key];
      if (typeof value !== 'string') {
        console.warn(`\n   ⚠️  ${key}: модель не вернула перевод, пропущен`);
        rejected++;
        continue;
      }
      // Сломанный плейсхолдер тихо ломает рендер кнопок — лучше оставить
      // ключ непереведённым, его поймает check-locales.
      if (!placeholdersMatch(sourceFlat[key], value)) {
        console.warn(`\n   ⚠️  ${key}: плейсхолдеры не совпали, пропущен`);
        rejected++;
        continue;
      }
      targetFlat[key] = value;
    }
    console.log(`готово${rejected ? ` (пропущено ${rejected})` : ''}`);
  }

  // Ключи в порядке ru.json, чтобы диффы читались
  const ordered = {};
  for (const key of Object.keys(sourceFlat)) {
    if (targetFlat[key] !== undefined) ordered[key] = targetFlat[key];
  }
  writeFileSync(targetPath, JSON.stringify(unflatten(ordered), null, 2) + '\n', 'utf8');
  console.log(`💾 ${targetPath}`);
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : Object.keys(LANGUAGE_NAMES);
const sourceFlat = flatten(JSON.parse(readFileSync(join(localesDir, 'ru.json'), 'utf8')));

for (const code of targets) {
  if (!LANGUAGE_NAMES[code]) {
    console.error(`Неизвестный язык: ${code}. Доступны: ${Object.keys(LANGUAGE_NAMES).join(', ')}`);
    process.exit(1);
  }
  await translateLanguage(code, sourceFlat);
}
