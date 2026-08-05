#!/usr/bin/env node
/**
 * Ratchet против нарастания хардкода: падает, если в уже вычищенном каталоге
 * появилась русская строка вне вызова t().
 *
 * Почему не eslint-plugin-i18next: в установленной версии 6.1.5 правило
 * no-literal-string не срабатывает в этом проекте ни в одном режиме —
 * проверено и в конфиге репозитория, и в полной изоляции через Linter API,
 * на кириллице и на латинице. Опции markupOnly, с которой правило было
 * заведено изначально, в схеме v6 вообще нет (там mode), и неизвестная
 * опция молча игнорировалась. Гейт, которому нельзя доверять, хуже отсутствия
 * гейта: он создаёт ложное чувство защищённости.
 *
 * Здесь проверка простая и наблюдаемая: ищем кириллицу вне t(), вне
 * комментариев и вне console.*.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/**
 * Каталоги, из которых хардкод уже вычищен. Каждый заход экстракции
 * дописывает сюда свой путь. Админка сюда не попадает никогда — она
 * остаётся русской по решению из спеки.
 */
const MIGRATED = [
  'src/i18n',
  'src/utils/formatters.ts',
  'src/components/settings/LanguageSelect.tsx',
  'src/components/onboarding',
  'src/components/chat',
  'src/components/settings',
  'src/components/profile',
  'src/components/video',
  'src/components/imagegen',
  'src/components/tokens',
  'src/components/tg-bot',
  'src/components/search',
  'src/components/chats',
  'src/components/peer',
  'src/components/layout',
  'src/components/support',
  'src/pages',
  'src/App.tsx',
  'src/services/widgetClient.ts',
];

/**
 * Файлы, которые намеренно держат длинные документы двумя рукописными
 * блоками (русский и английский) вместо ключей локали: оферта, политика
 * конфиденциальности, условия оплаты. Дробить юридический текст на сотни
 * ключей вредно, а машинно переводить обязывающий документ нельзя.
 */
const DOCUMENT_BLOCKS = [
  'src/components/onboarding/LegalModal.tsx',
  'src/components/onboarding/PaymentInfoModal.tsx',
];

const CYRILLIC = /[А-Яа-яЁё]/;

function collect(target, acc = []) {
  const abs = join(root, target);
  if (statSync(abs).isFile()) {
    // Тесты не локализуются: их описания читает разработчик, а не пользователь.
    if (/\.(ts|tsx)$/.test(abs) && !/\.test\.tsx?$/.test(abs)) acc.push(abs);
    return acc;
  }
  for (const entry of readdirSync(abs)) collect(join(target, entry), acc);
  return acc;
}

/**
 * Строки, которые не являются пользовательским текстом.
 *
 * Прагма `// i18n-ignore: причина` — для случаев, которые построчной
 * проверкой не отличить от UI: идентификаторы, приходящие с бэкенда,
 * названия языков на них самих, брендовые глифы, фолбэки внутри
 * многострочного вызова t(). Причина обязательна — чтобы прагма
 * не превратилась в способ «заглушить проверку и забыть».
 *
 * Область действия — от строки с прагмой до ближайшей пустой строки.
 * Так одна прагма покрывает многострочный литерал массива или объекта,
 * и при этом её действие видно глазом, без подсчёта строк.
 */
function isIgnorable(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*') ||
    trimmed.includes('console.') ||
    // t('key', 'русский фолбэк') — штатный defaultValue i18next
    /\bt\(/.test(line)
  );
}

/** Множество номеров строк, накрытых прагмой (до ближайшей пустой строки). */
function suppressedLines(lines) {
  const suppressed = new Set();
  lines.forEach((line, i) => {
    if (!/i18n-ignore:/.test(line)) return;
    for (let j = i; j < lines.length; j++) {
      if (j > i && lines[j].trim() === '') break;
      suppressed.add(j);
    }
  });
  return suppressed;
}

const files = MIGRATED.flatMap((t) => collect(t)).filter(
  (abs) => !DOCUMENT_BLOCKS.includes(relative(root, abs)),
);

/**
 * Вырезает из исходника то, что заведомо не является захардкоженным UI,
 * сохраняя нумерацию строк (заменяем на пустые, а не удаляем):
 *
 *  - блочные комментарии, включая JSX-вариант {@literal {}/* ... *}{@literal }}
 *    — построчная проверка видела только первую строку такого блока;
 *  - хвостовые // комментарии после кода;
 *  - блоки <Trans>…</Trans> — их русское содержимое это шаблон по умолчанию,
 *    сам перевод лежит в локали под i18nKey.
 */
function stripNonUi(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<Trans[\s\S]*?<\/Trans>/g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const findings = [];
for (const abs of files) {
  const rel = relative(root, abs);
  const raw = readFileSync(abs, 'utf8');
  const lines = stripNonUi(raw).split('\n');
  const suppressed = suppressedLines(raw.split('\n'));
  lines.forEach((line, i) => {
    if (!CYRILLIC.test(line) || suppressed.has(i) || isIgnorable(line)) return;
    findings.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}

if (findings.length > 0) {
  console.error(`❌ найдено ${findings.length} захардкоженных строк в вычищенных каталогах:\n`);
  for (const f of findings.slice(0, 30)) console.error(`   ${f}`);
  if (findings.length > 30) console.error(`   … и ещё ${findings.length - 30}`);
  console.error('\nВынесите текст в ключ локали и вызовите через t().');
  process.exit(1);
}

console.log(`✅ хардкода нет: проверено ${files.length} файлов в ${MIGRATED.length} путях`);
