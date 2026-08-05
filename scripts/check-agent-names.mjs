/**
 * Сверка имён ассистентов между строками локалей и карточками agent_translations.
 *
 * Проблема повторялась в каждом заходе: переводчик видит имя ассистента внутри
 * UI-строки и транслитерирует по-своему, не зная, как тот же ассистент назван
 * в карточке. Юля стала Julia/Yulia/Ioulia, Рая — Raya/Raja/Raïa.
 * В итоге один персонаж получает два имени в одном интерфейсе.
 *
 * Метод: берём ТОЛЬКО те ключи, где имя ассистента стоит в русском исходнике,
 * и проверяем, что в переводе стоит каноническое имя из карточки.
 * Сравнение «на похожесть» не годится — оно ловит Android вместо Andrej.
 */
import { readFileSync } from 'node:fs';
import { flatten } from './locale-utils.mjs';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LOCALES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');

/** Русское имя ассистента → id в agents (для сопоставления с карточкой). */
const AGENTS = {
  'Миша': 1, 'Оля': 2, 'Маша': 3, 'Ирина': 4, 'Лиана': 5, 'Екатерина': 6,
  'Андрей': 7, 'Герман': 8, 'Анна': 9, 'Алексей': 10, 'Александра': 11,
  'Роман': 12, 'Шанкара': 13, 'Райя': 14, 'Рая': 14, 'Юлия': 15, 'Юля': 15,
  'Виталий': 17,
};

/** { "<locale>": { "<agentId>": "<caноническое имя>" } } */
const cardsPath = process.argv[2];
if (!cardsPath) {
  console.error('Использование: node scripts/check-agent-names.mjs <cards.json>');
  console.error('');
  console.error('cards.json — выгрузка канонических имён из agent_translations:');
  console.error(`  psql "$DATABASE_URL" -tAF'|' -c \\`);
  console.error("    \"SELECT locale, entity_id, display_name FROM agent_translations\"");
  console.error('  → { "<locale>": { "<entity_id>": "<display_name>" } }');
  process.exit(2);
}
const cards = JSON.parse(readFileSync(cardsPath, 'utf8'));

const ru = flatten(JSON.parse(readFileSync(`${LOCALES}/ru.json`, 'utf8')));
let issues = 0;

for (const [loc, byId] of Object.entries(cards)) {
  const flat = flatten(JSON.parse(readFileSync(`${LOCALES}/${loc}.json`, 'utf8')));
  for (const [key, source] of Object.entries(ru)) {
    if (typeof source !== 'string') continue;
    for (const [rusName, id] of Object.entries(AGENTS)) {
      // Русские имена склоняются: «от Райи», «Юле», «с Романом».
      // Ищем по основе (имя без последней гласной), иначе поиск по
      // словарной форме не найдёт ни одного косвенного падежа —
      // ровно на этом проверка и дала ложно-зелёный результат.
      // Основа короче трёх букв («Ра» от «Рая») ловит «Работы» и «Расход»,
      // поэтому для коротких имён ищем полную форму, а падежи покрываются
      // более длинным вариантом того же имени («Райя» → «Рай»).
      const trimmed = rusName.replace(/[аяеёиоуыэюй]$/i, '');
      const stem = trimmed.length >= 3 ? trimmed : rusName;
      // Имя — отдельное слово с заглавной, а не кусок другого слова.
      if (!new RegExp(`(?<![А-Яа-яЁё])${stem}[а-яё]*`).test(source)) continue;
      const canonical = byId[String(id)];
      const translated = flat[key];
      if (!canonical || typeof translated !== 'string') continue;
      if (!translated.includes(canonical)) {
        console.log(`⚠️  ${loc}  ${key}`);
        console.log(`      ru: ${source.slice(0, 70)}`);
        console.log(`      ${loc}: ${translated.slice(0, 70)}`);
        console.log(`      в карточке: «${canonical}»`);
        issues++;
      }
    }
  }
}
console.log(issues === 0 ? '✅ имена ассистентов совпадают с карточками' : `❌ расхождений: ${issues}`);
process.exit(issues === 0 ? 0 : 1);
