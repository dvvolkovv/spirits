# Мультиязычность — Заход 1 (инфраструктура): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать инфраструктуру мультиязычности для шести языков (RU, EN, ES, DE, FR, ZH) и добиться, чтобы AI-ассистенты и карточки ассистентов работали на языке пользователя.

**Architecture:** Язык хранится в `profile_data` (JSONB) — миграция не нужна. Фронт получает реестр языков, ленивую загрузку локалей, локале-зависимые форматтеры и два скрипта (перевод + проверка паритета ключей). Бэк получает `resolveUserLanguage`, языковую директиву в трёх местах сборки промпта и таблицу `agent_translations` для локализованных карточек.

**Tech Stack:** React 18 + TypeScript 5 + Vite 5, i18next 23, Tailwind 3, pnpm. Бэк — NestJS 10 + PostgreSQL, тесты на Jest. Скрипты перевода — Node ESM + `@anthropic-ai/sdk` (модель `claude-opus-5`).

**Спека:** `docs/superpowers/specs/2026-08-04-multilanguage-design.md`

**Границы захода:** админка не трогается. Экстракция захардкоженных строк (~1500 строк вне админки) — заходы 2-6, не здесь. Серверные SMS/push/TG-бот вне объёма.

---

## Отклонение от спеки, обнаруженное при планировании

Спека говорит, что `/webhook/agents` берёт локаль из профиля. **Это невозможно:** эндпоинт объявлен без `JwtGuard` (`agents.controller.ts:21-25`), userId там недоступен. Локаль передаётся query-параметром `?lang=`, дефолт `ru`. Задачи 16 и 18 реализуют именно так.

Второе: спека упоминает языковую директиву в одном месте. Фактически русский язык захардкожен в **трёх**: `chat.service.ts:546` (`streamUniversalAgent` — основной путь, все ассистенты кроме Маши id=3), `chat.service.ts:1007` (`generateAgentReply` — приветствия и синтетические пробы) и `chat.service.ts:251` (локальный путь Маши). Задачи 13 и 14 покрывают все три.

---

## Структура файлов

**Создаётся:**

| Файл | Ответственность |
|---|---|
| `vitest.config.ts` | Конфиг тест-раннера фронта |
| `src/i18n/languages.ts` | Реестр языков + нормализация кода языка |
| `src/i18n/languages.test.ts` | Тесты нормализации |
| `src/utils/formatters.ts` | Локале-зависимое форматирование дат/чисел/сумм |
| `src/utils/formatters.test.ts` | Тесты форматтеров |
| `src/components/settings/LanguageSelect.tsx` | Переиспользуемый переключатель языка |
| `scripts/check-locales.mjs` | Проверка паритета ключей локалей |
| `scripts/check-locales.test.mjs` | Тесты проверки паритета |
| `scripts/translate-locales.mjs` | Генерация переводов через Claude API |
| `scripts/locale-utils.mjs` | Чистые хелперы обоих скриптов (плоские ключи, плейсхолдеры, merge) |
| `scripts/locale-utils.test.mjs` | Тесты хелперов |
| `src/i18n/locales/{es,de,fr,zh}.json` | Новые локали (генерируются скриптом) |
| `spirits_back/src/common/services/language.service.ts` | `resolveUserLanguage` + названия языков |
| `spirits_back/src/common/services/language.service.spec.ts` | Тесты |
| `spirits_back/src/agents/migrations/001_agent_translations.sql` | Таблица переводов карточек |

**Изменяется:**

| Файл | Что |
|---|---|
| `package.json` | devDeps `vitest`, `@anthropic-ai/sdk`, `eslint-plugin-i18next`; dep `i18next-resources-to-backend`; скрипты `test`, `check-locales`, `translate-locales` |
| `src/i18n/index.ts` | Ленивая загрузка, `supportedLngs`, `load: 'languageOnly'` |
| `src/components/settings/SettingsView.tsx` | Переключатель из реестра + сохранение в профиль |
| `src/components/onboarding/PhoneInput.tsx` | Переключатель языка на экране входа |
| `src/contexts/AuthContext.tsx` | Чтение языка из профиля при старте |
| `src/components/chat/ChatInterface.tsx` | `lang` в теле запроса чата |
| `src/components/chat/AssistantSelection.tsx` | `?lang=` в запросе списка ассистентов |
| `eslint.config.js` | `check-locales` не сюда, а в `pnpm lint`; плагин `i18next` с реестром мигрированных каталогов |
| `spirits_back/src/chat/chat.service.ts` | Языковая директива в трёх местах + локализованные имена в контексте |
| `spirits_back/src/agents/agents.service.ts` | Джойн `agent_translations` |
| `spirits_back/src/agents/agents.controller.ts` | Приём `?lang=` |

---

## Task 1: Тест-раннер фронта

Сейчас на фронте нет юнит-раннера (только Playwright e2e, который ходит в прод). Без него задачи 2 и 4 нечем проверять. Ставим vitest — он переиспользует конфиг vite и умеет TypeScript из коробки.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Установить vitest**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm add -D vitest@^2.1.0
```

- [ ] **Step 2: Создать конфиг**

Создать `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
});
```

- [ ] **Step 3: Добавить скрипт в package.json**

В блоке `"scripts"` файла `package.json` добавить строку после `"lint": "eslint .",`:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Убедиться, что раннер стартует**

Run: `pnpm test`
Expected: `No test files found` (или аналогичное сообщение) и **нулевой** код возврата, так как тестов ещё нет. Если код возврата ненулевой — добавить в `vitest.config.ts` в блок `test` строку `passWithNoTests: true,` и перезапустить.

- [ ] **Step 5: Коммит**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore(test): добавить vitest как юнит-раннер фронта"
```

---

## Task 2: Реестр языков

Единственный список поддерживаемых языков. Всё остальное (переключатели, конфиг i18next, скрипты) читает его отсюда, поэтому седьмой язык добавляется одной строкой.

**Files:**
- Create: `src/i18n/languages.ts`
- Test: `src/i18n/languages.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `src/i18n/languages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, SUPPORTED_CODES, DEFAULT_LANGUAGE, resolveLanguage } from './languages';

describe('SUPPORTED_LANGUAGES', () => {
  it('содержит шесть языков в фиксированном порядке', () => {
    expect(SUPPORTED_CODES).toEqual(['ru', 'en', 'es', 'de', 'fr', 'zh']);
  });

  it('у каждого языка есть родное название и флаг', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.nativeName.length).toBeGreaterThan(0);
      expect(lang.flag.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveLanguage', () => {
  it('пропускает поддерживаемый код как есть', () => {
    expect(resolveLanguage('es')).toBe('es');
  });

  it('схлопывает региональный вариант до корня', () => {
    expect(resolveLanguage('es-MX')).toBe('es');
    expect(resolveLanguage('zh-Hans')).toBe('zh');
    expect(resolveLanguage('de_AT')).toBe('de');
  });

  it('не зависит от регистра', () => {
    expect(resolveLanguage('ES')).toBe('es');
  });

  it('возвращает дефолт для неподдерживаемого языка', () => {
    expect(resolveLanguage('pt')).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('ja-JP')).toBe(DEFAULT_LANGUAGE);
  });

  it('возвращает дефолт для пустого значения', () => {
    expect(resolveLanguage(undefined)).toBe('ru');
    expect(resolveLanguage(null)).toBe('ru');
    expect(resolveLanguage('')).toBe('ru');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm test src/i18n/languages.test.ts`
Expected: FAIL — `Failed to resolve import "./languages"` (файла ещё нет).

- [ ] **Step 3: Реализовать реестр**

Создать `src/i18n/languages.ts`:

```typescript
export interface LanguageDef {
  /** Корень BCP-47: ru, en, es, de, fr, zh */
  code: string;
  /** Название языка на нём самом — так его ищут в списке */
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: 'ru', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'en', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'de', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'zh', nativeName: '中文', flag: '🇨🇳' },
];

export const DEFAULT_LANGUAGE = 'ru';

export const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Схлопывает произвольный тег языка до поддерживаемого корня.
 * navigator.language отдаёт es-MX / zh-Hans, профиль может отдать что угодно.
 */
export function resolveLanguage(raw?: string | null): string {
  if (!raw) return DEFAULT_LANGUAGE;
  const root = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(root) ? root : DEFAULT_LANGUAGE;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm test src/i18n/languages.test.ts`
Expected: PASS — 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/i18n/languages.ts src/i18n/languages.test.ts
git commit -m "feat(i18n): реестр поддерживаемых языков и нормализация кода"
```

---

## Task 3: Ленивая загрузка локалей

Сейчас локали в бандле статическим импортом. Шесть по ~60K дали бы ~360K мёртвого веса. `ru` остаётся в бандле как фолбэк, остальные — отдельным чанком по требованию.

**Files:**
- Modify: `src/i18n/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Установить бэкенд ресурсов**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm add i18next-resources-to-backend@^1.2.1
```

- [ ] **Step 2: Создать пустые файлы новых локалей**

Динамический импорт `./locales/${language}.json` требует, чтобы файлы существовали на момент сборки — иначе Vite не создаст чанки. Заполнит их Task 7.

```bash
cd /Users/dmitry/Downloads/spirits_front
for lang in es de fr zh; do echo '{}' > "src/i18n/locales/$lang.json"; done
ls src/i18n/locales/
```

Expected: `de.json en.json es.json fr.json ru.json zh.json`

- [ ] **Step 3: Переписать конфиг i18next**

Заменить всё содержимое `src/i18n/index.ts` на:

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';

import ru from './locales/ru.json';
import { SUPPORTED_CODES, DEFAULT_LANGUAGE } from './languages';

i18n
  // ru лежит в бандле как фолбэк, остальные локали Vite нарезает в отдельные
  // чанки и подтягивает только при переключении языка.
  .use(
    resourcesToBackend((language: string) =>
      language === DEFAULT_LANGUAGE
        ? Promise.resolve({ default: ru })
        : import(`./locales/${language}.json`),
    ),
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_CODES,
    // es-MX → es: без этого детектор навигатора уводит в фолбэк
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    // ru отдан ресурсами, остальные — бэкендом; без флага i18next
    // считает, что раз ресурсы есть, бэкенд не нужен
    partialBundledLanguages: true,
    resources: {
      ru: { translation: ru },
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

- [ ] **Step 4: Проверить, что сборка проходит и чанки нарезались**

Run: `pnpm build`
Expected: сборка успешна; в выводе видны отдельные чанки для `es`, `de`, `fr`, `zh` (например `es-XXXX.js`). Проверить:

```bash
ls dist/assets/ | grep -E '^(es|de|fr|zh)-' | head
```

Expected: четыре файла.

- [ ] **Step 5: Коммит**

```bash
git add package.json pnpm-lock.yaml src/i18n/index.ts src/i18n/locales/
git commit -m "feat(i18n): ленивая загрузка локалей, шесть поддерживаемых языков"
```

---

## Task 4: Локале-зависимое форматирование

`'ru-RU'` захардкожен в 85 вызовах. Здесь создаётся замена; вызовы мигрируют на неё по ходу заходов 2-6.

**Files:**
- Create: `src/utils/formatters.ts`
- Test: `src/utils/formatters.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `src/utils/formatters.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../i18n';
import { toIntlLocale, formatDate, formatNumber, formatCurrency } from './formatters';

describe('toIntlLocale', () => {
  it('разворачивает корень языка в полную Intl-локаль', () => {
    expect(toIntlLocale('ru')).toBe('ru-RU');
    expect(toIntlLocale('en')).toBe('en-US');
    expect(toIntlLocale('zh')).toBe('zh-CN');
  });

  it('падает в русскую локаль на неизвестном языке', () => {
    expect(toIntlLocale('pt')).toBe('ru-RU');
  });
});

describe('форматирование по активному языку', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
  });

  it('форматирует число по-русски', () => {
    // NBSP-разделитель разрядов — сравниваем по наличию цифр, не по байтам
    expect(formatNumber(1234567)).toMatch(/^1.234.567$/);
  });

  it('переключает формат числа вместе с языком', async () => {
    await i18n.changeLanguage('de');
    expect(formatNumber(1234567)).toBe('1.234.567');
    await i18n.changeLanguage('en');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('форматирует дату по активному языку', async () => {
    const date = new Date(Date.UTC(2026, 7, 4));
    await i18n.changeLanguage('ru');
    expect(formatDate(date)).toBe('04.08.2026');
    await i18n.changeLanguage('en');
    expect(formatDate(date)).toBe('08/04/2026');
  });

  it('форматирует сумму в рублях', () => {
    expect(formatCurrency(1500)).toContain('1');
    expect(formatCurrency(1500)).toContain('₽');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm test src/utils/formatters.test.ts`
Expected: FAIL — `Failed to resolve import "./formatters"`.

- [ ] **Step 3: Реализовать форматтеры**

Создать `src/utils/formatters.ts`:

```typescript
import i18n from '../i18n';
import { DEFAULT_LANGUAGE } from '../i18n/languages';

/**
 * Intl хочет полную локаль, i18next хранит корень языка.
 * Ключи должны совпадать с SUPPORTED_CODES из i18n/languages.
 */
const INTL_LOCALES: Record<string, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  zh: 'zh-CN',
};

export function toIntlLocale(lang: string): string {
  return INTL_LOCALES[lang] ?? INTL_LOCALES[DEFAULT_LANGUAGE];
}

function activeLocale(): string {
  return toIntlLocale(i18n.language || DEFAULT_LANGUAGE);
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): string {
  return new Date(value).toLocaleDateString(activeLocale(), options);
}

export function formatTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  return new Date(value).toLocaleTimeString(activeLocale(), options);
}

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  return value.toLocaleString(activeLocale(), options);
}

export function formatCurrency(value: number, currency = 'RUB'): string {
  return value.toLocaleString(activeLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm test src/utils/formatters.test.ts`
Expected: PASS — 6 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/utils/formatters.ts src/utils/formatters.test.ts
git commit -m "feat(i18n): форматирование дат, чисел и сумм по активному языку"
```

---

## Task 5: Чистые хелперы для скриптов локалей

Оба скрипта (проверка паритета и перевод) работают с одними и теми же операциями над вложенным JSON. Выносим их отдельно, чтобы протестировать без сети.

**Files:**
- Create: `scripts/locale-utils.mjs`
- Test: `scripts/locale-utils.test.mjs`

- [ ] **Step 1: Написать падающий тест**

Создать `scripts/locale-utils.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import { flatten, unflatten, missingKeys, extractPlaceholders, placeholdersMatch } from './locale-utils.mjs';

describe('flatten / unflatten', () => {
  it('разворачивает вложенный объект в плоские ключи', () => {
    expect(flatten({ a: { b: 'x' }, c: 'y' })).toEqual({ 'a.b': 'x', c: 'y' });
  });

  it('сворачивает обратно без потерь', () => {
    const nested = { chat: { send: 'Отправить', empty: 'Пусто' }, ok: 'Да' };
    expect(unflatten(flatten(nested))).toEqual(nested);
  });
});

describe('missingKeys', () => {
  it('находит ключи источника, отсутствующие в цели', () => {
    expect(missingKeys({ a: '1', b: '2' }, { a: 'x' })).toEqual(['b']);
  });

  it('считает пустую строку отсутствующим переводом', () => {
    expect(missingKeys({ a: '1' }, { a: '' })).toEqual(['a']);
  });

  it('возвращает пустой список при полном покрытии', () => {
    expect(missingKeys({ a: '1' }, { a: 'x' })).toEqual([]);
  });
});

describe('extractPlaceholders', () => {
  it('находит интерполяцию i18next', () => {
    expect(extractPlaceholders('Осталось {{count}} дней')).toEqual(['{{count}}']);
  });

  it('находит кастомные теги кнопок целиком', () => {
    const s = '{{button: Купить | action: buy | variant: primary}}';
    expect(extractPlaceholders(s)).toEqual([s]);
  });

  it('возвращает пустой список без плейсхолдеров', () => {
    expect(extractPlaceholders('Просто текст')).toEqual([]);
  });
});

describe('placeholdersMatch', () => {
  it('пропускает перевод с идентичным набором плейсхолдеров', () => {
    expect(placeholdersMatch('Осталось {{count}} дней', '{{count}} days left')).toBe(true);
  });

  it('отклоняет перевод, потерявший плейсхолдер', () => {
    expect(placeholdersMatch('Осталось {{count}} дней', 'Días restantes')).toBe(false);
  });

  it('отклоняет перевод, переведший содержимое кастомного тега', () => {
    expect(
      placeholdersMatch('{{button: Купить | action: buy}}', '{{button: Comprar | action: buy}}'),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm test scripts/locale-utils.test.mjs`
Expected: FAIL — `Failed to resolve import "./locale-utils.mjs"`.

- [ ] **Step 3: Реализовать хелперы**

Создать `scripts/locale-utils.mjs`:

```javascript
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

/** Ключи источника, которых нет в цели или которые там пусты. */
export function missingKeys(sourceFlat, targetFlat) {
  return Object.keys(sourceFlat).filter((key) => {
    const value = targetFlat[key];
    return value === undefined || value === null || value === '';
  });
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
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm test scripts/locale-utils.test.mjs`
Expected: PASS — 11 тестов.

- [ ] **Step 5: Коммит**

```bash
git add scripts/locale-utils.mjs scripts/locale-utils.test.mjs
git commit -m "feat(i18n): чистые хелперы для работы с файлами локалей"
```

---

## Task 6: Проверка паритета ключей

`ru.json` — 64K, `en.json` — 44K: английский уже неполон, недостающие ключи молча падают в русский фолбэк. Скрипт делает это заметным и не даёт повториться.

**Files:**
- Create: `scripts/check-locales.mjs`
- Modify: `package.json`

- [ ] **Step 1: Реализовать скрипт**

Создать `scripts/check-locales.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Падает, если в какой-либо локали нет ключа из ru.json.
 * ru.json — источник правды; всё остальное обязано его покрывать.
 * Запускается из pnpm lint, поэтому непереведённый ключ не уезжает в прод.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flatten, missingKeys } from './locale-utils.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'i18n', 'locales');

const { SUPPORTED_CODES, DEFAULT_LANGUAGE } = await import(
  join(here, '..', 'src', 'i18n', 'languages.ts')
).catch(() => ({
  // languages.ts — TypeScript, node его не исполнит. Список дублируется здесь
  // намеренно; check-locales.test.mjs следит, что дубль не разъехался.
  SUPPORTED_CODES: ['ru', 'en', 'es', 'de', 'fr', 'zh'],
  DEFAULT_LANGUAGE: 'ru',
}));

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
```

- [ ] **Step 2: Написать тест на синхронность списка языков**

Скрипт дублирует список языков, потому что `languages.ts` — TypeScript и node его не исполнит. Тест ловит расхождение дубля с реестром.

Создать `scripts/check-locales.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPORTED_CODES } from '../src/i18n/languages';

const here = dirname(fileURLToPath(import.meta.url));

describe('check-locales', () => {
  it('дублированный список языков совпадает с реестром', () => {
    const src = readFileSync(join(here, 'check-locales.mjs'), 'utf8');
    const match = src.match(/SUPPORTED_CODES: \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const duplicated = match[1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    expect(duplicated).toEqual(SUPPORTED_CODES);
  });
});
```

- [ ] **Step 3: Добавить скрипты в package.json**

В блоке `"scripts"` заменить строку `"lint": "eslint .",` на:

```json
    "lint": "eslint . && node scripts/check-locales.mjs",
    "check-locales": "node scripts/check-locales.mjs",
```

- [ ] **Step 4: Запустить и убедиться, что дыры найдены**

Run: `pnpm check-locales`
Expected: FAIL (код возврата 1) — `es`, `de`, `fr`, `zh` пусты, `en` неполон. Вывод перечисляет недостающие ключи. Это ожидаемо, закроет Task 7.

Run: `pnpm test scripts/check-locales.test.mjs`
Expected: PASS — 1 тест.

- [ ] **Step 5: Коммит**

```bash
git add scripts/check-locales.mjs scripts/check-locales.test.mjs package.json
git commit -m "feat(i18n): проверка паритета ключей локалей в составе lint"
```

---

## Task 7: Скрипт перевода через Claude API

Переводит только недостающие ключи, поэтому повторный запуск дёшев и идемпотентен. Валидирует плейсхолдеры: модель, «переведшая» `{{button: Купить}}`, тихо ломает рендер кнопок в ответах ассистентов.

**Files:**
- Create: `scripts/translate-locales.mjs`
- Modify: `package.json`

- [ ] **Step 1: Установить SDK**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm add -D @anthropic-ai/sdk@^0.68.0
```

- [ ] **Step 2: Реализовать скрипт**

Создать `scripts/translate-locales.mjs`:

```javascript
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
```

- [ ] **Step 3: Добавить скрипт в package.json**

В блоке `"scripts"` после строки `"check-locales": "node scripts/check-locales.mjs",` добавить:

```json
    "translate-locales": "node scripts/translate-locales.mjs",
```

- [ ] **Step 4: Проверить на одном языке малой кровью**

Run: `pnpm translate-locales de`
Expected: вывод вида `🔤 de: не хватает N ключей`, затем пачки, затем `💾 …/de.json`. Проверить результат:

```bash
node -e "const d=require('./src/i18n/locales/de.json'); console.log(Object.keys(d).length, 'разделов'); console.log(d.common)"
```

Expected: непустой объект с немецкими строками.

Если `ANTHROPIC_API_KEY` не задан — проверить `ant auth status`; при активном профиле SDK подхватит его сам.

- [ ] **Step 5: Коммит**

```bash
git add scripts/translate-locales.mjs package.json pnpm-lock.yaml
git commit -m "feat(i18n): скрипт перевода локалей через Claude API"
```

---

## Task 8: Сгенерировать переводы для всех языков

**Files:**
- Modify: `src/i18n/locales/{en,es,de,fr,zh}.json`

- [ ] **Step 1: Прогнать перевод по всем языкам**

Run: `pnpm translate-locales`
Expected: для каждого из `en`, `es`, `de`, `fr`, `zh` — либо `✅ всё переведено`, либо пачки и запись файла. `en` доберёт недостающие ключи (сейчас 44K против 64K у `ru`).

- [ ] **Step 2: Проверить паритет**

Run: `pnpm check-locales`
Expected: PASS — по строке `✅ <код>: N/N ключей` на каждый язык, код возврата 0.

Если какие-то ключи пропущены из-за несовпадения плейсхолдеров — перезапустить `pnpm translate-locales <код>`: скрипт возьмёт только оставшиеся. Если ключ не переводится и со второго раза, вписать перевод вручную, сверив плейсхолдеры с `ru.json`.

- [ ] **Step 3: Проверить, что сборка проходит**

Run: `pnpm build`
Expected: сборка успешна.

- [ ] **Step 4: Коммит**

```bash
git add src/i18n/locales/
git commit -m "feat(i18n): переводы интерфейса на en, es, de, fr, zh"
```

---

## Task 9: Переключатель языка из реестра

`<select>` в настройках захардкожен на два языка. Выносим в компонент, читающий реестр, чтобы седьмой язык добавлялся одной строкой и переключатель можно было переиспользовать на онбординге.

**Files:**
- Create: `src/components/settings/LanguageSelect.tsx`
- Modify: `src/components/settings/SettingsView.tsx:316-323`

- [ ] **Step 1: Создать компонент**

Создать `src/components/settings/LanguageSelect.tsx`:

```typescript
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, resolveLanguage } from '../../i18n/languages';

interface LanguageSelectProps {
  onChange?: (lang: string) => void;
  className?: string;
}

/**
 * Единственный переключатель языка в приложении. Список берётся из реестра,
 * поэтому новый язык не требует правок здесь.
 */
export const LanguageSelect: React.FC<LanguageSelectProps> = ({ onChange, className }) => {
  const { i18n } = useTranslation();
  const current = resolveLanguage(i18n.language);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
    onChange?.(lang);
  };

  return (
    <select
      value={current}
      onChange={handleChange}
      className={
        className ??
        'px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent'
      }
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.nativeName}
        </option>
      ))}
    </select>
  );
};
```

- [ ] **Step 2: Подключить в настройках**

В `src/components/settings/SettingsView.tsx` заменить блок:

```typescript
              <select
                value={settings.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              >
                <option value="ru">🇷🇺 Русский</option>
                <option value="en">🇺🇸 English</option>
              </select>
```

на:

```typescript
              <LanguageSelect onChange={handleLanguageChange} />
```

- [ ] **Step 3: Добавить импорт**

В `src/components/settings/SettingsView.tsx` добавить к остальным импортам компонентов:

```typescript
import { LanguageSelect } from './LanguageSelect';
```

- [ ] **Step 4: Упростить обработчик**

`LanguageSelect` уже сам зовёт `i18n.changeLanguage`, поэтому в `handleLanguageChange` дублировать не нужно. Заменить в `src/components/settings/SettingsView.tsx`:

```typescript
  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    handleSettingChange('language', lang);
  };
```

на:

```typescript
  const handleLanguageChange = (lang: string) => {
    handleSettingChange('language', lang);
  };
```

- [ ] **Step 5: Проверить сборку**

Run: `pnpm build`
Expected: сборка успешна. Если ESLint ругается на неиспользуемый `i18n` в `SettingsView` — убрать его из деструктуризации `useTranslation()`, оставив только `t`.

- [ ] **Step 6: Коммит**

```bash
git add src/components/settings/LanguageSelect.tsx src/components/settings/SettingsView.tsx
git commit -m "feat(i18n): переключатель языка рендерится из реестра языков"
```

---

## Task 10: Переключатель языка на онбординге

Не говорящий по-русски пользователь упирается в русский экран входа до того, как доберётся до настроек. Автоопределение по navigator это в основном закрывает, но выбор должен быть доступен вручную.

**Files:**
- Modify: `src/components/onboarding/PhoneInput.tsx`

- [ ] **Step 1: Посмотреть текущую разметку**

Run: `grep -n "return (" -A 20 src/components/onboarding/PhoneInput.tsx | head -40`
Expected: видна корневая обёртка компонента. Запомнить её класс и первый дочерний элемент — переключатель встанет перед ним.

- [ ] **Step 2: Добавить импорт**

В `src/components/onboarding/PhoneInput.tsx` добавить к импортам:

```typescript
import { LanguageSelect } from '../settings/LanguageSelect';
```

- [ ] **Step 3: Вставить переключатель**

Внутри корневого элемента, который возвращает компонент, самым первым дочерним элементом добавить:

```typescript
      <div className="flex justify-end mb-4">
        <LanguageSelect className="text-sm px-2 py-1 border border-gray-200 rounded-lg bg-white/80 focus:ring-2 focus:ring-forest-500" />
      </div>
```

- [ ] **Step 4: Проверить визуально**

Run: `pnpm dev`

Открыть http://localhost:5173 в режиме инкогнито (чтобы не было сохранённой авторизации). Ожидается: в правом верхнем углу экрана ввода телефона — компактный селект с шестью языками; переключение немедленно меняет язык подписей формы.

Остановить dev-сервер (Ctrl+C).

- [ ] **Step 5: Коммит**

```bash
git add src/components/onboarding/PhoneInput.tsx
git commit -m "feat(i18n): переключатель языка на экране входа"
```

---

## Task 11: Хранение языка в профиле

`ProfileService.updateProfile` мерджит произвольные поля в `profile_data` (JSONB), поэтому миграция не нужна. Это существенно: прод-migrate-runner застревает на `base/001` и не докатывает ничего следом.

**Files:**
- Modify: `src/contexts/AuthContext.tsx:172-207`
- Modify: `src/components/settings/SettingsView.tsx`

- [ ] **Step 1: Читать язык из профиля при старте**

В `src/contexts/AuthContext.tsx` добавить импорт:

```typescript
import i18n from '../i18n';
import { resolveLanguage } from '../i18n/languages';
```

- [ ] **Step 2: Применять язык профиля в checkAdminStatus**

В `src/contexts/AuthContext.tsx`, в функции `checkAdminStatus`, сразу после строки:

```typescript
          const profileJson = profileRecord.profileJson || profileRecord;
```

добавить:

```typescript
          // Язык профиля — источник правды: он синхронизирует UI между
          // устройствами. Если в профиле пусто, молча сохраняем то, что
          // определил детектор, чтобы следующее устройство получило язык.
          const profileLang = profileJson.language;
          if (profileLang) {
            const resolved = resolveLanguage(profileLang);
            if (resolved !== i18n.language) {
              i18n.changeLanguage(resolved);
            }
          } else {
            const detected = resolveLanguage(i18n.language);
            apiClient
              .post('/webhook/profile-update', { language: detected })
              .catch((e) => console.warn('Не удалось сохранить язык в профиль:', e));
          }
```

- [ ] **Step 3: Сохранять явный выбор языка**

В `src/components/settings/SettingsView.tsx` заменить:

```typescript
  const handleLanguageChange = (lang: string) => {
    handleSettingChange('language', lang);
  };
```

на:

```typescript
  const handleLanguageChange = (lang: string) => {
    handleSettingChange('language', lang);
    // Язык уходит в профиль, чтобы подхватился на других устройствах
    // и попал в системный промпт ассистентов.
    apiClient
      .post('/webhook/profile-update', { language: lang })
      .catch((e) => console.warn('Не удалось сохранить язык в профиль:', e));
  };
```

- [ ] **Step 4: Проверить импорт apiClient**

Run: `grep -n "apiClient" src/components/settings/SettingsView.tsx | head -3`
Expected: строка с импортом `apiClient`. Если её нет — добавить:

```typescript
import { apiClient } from '../../services/apiClient';
```

- [ ] **Step 5: Проверить сборку**

Run: `pnpm build && pnpm lint`
Expected: обе команды успешны.

- [ ] **Step 6: Коммит**

```bash
git add src/contexts/AuthContext.tsx src/components/settings/SettingsView.tsx
git commit -m "feat(i18n): язык пользователя сохраняется в профиль и читается при старте"
```

---

## Task 12: Хелпер языка на бэке

**Files:**
- Create: `~/Downloads/spirits_back/src/common/services/language.service.ts`
- Test: `~/Downloads/spirits_back/src/common/services/language.service.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `~/Downloads/spirits_back/src/common/services/language.service.spec.ts`:

```typescript
import { LanguageService, SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from './language.service';

describe('LanguageService', () => {
  const makePg = (rows: any[]) => ({ query: jest.fn().mockResolvedValue({ rows }) }) as any;

  describe('normalize', () => {
    it('пропускает поддерживаемый код', () => {
      expect(LanguageService.normalize('es')).toBe('es');
    });

    it('схлопывает региональный вариант', () => {
      expect(LanguageService.normalize('es-MX')).toBe('es');
      expect(LanguageService.normalize('ZH_HANS')).toBe('zh');
    });

    it('падает в русский на неизвестном и пустом', () => {
      expect(LanguageService.normalize('pt')).toBe('ru');
      expect(LanguageService.normalize(undefined)).toBe('ru');
      expect(LanguageService.normalize(null)).toBe('ru');
    });
  });

  describe('SUPPORTED_LANGUAGES', () => {
    it('у каждого языка есть человекочитаемое название для промпта', () => {
      for (const code of SUPPORTED_LANGUAGES) {
        expect(LANGUAGE_NAMES[code]).toBeTruthy();
      }
    });
  });

  describe('resolveUserLanguage', () => {
    it('возвращает язык из profile_data', async () => {
      const svc = new LanguageService(makePg([{ language: 'de' }]));
      await expect(svc.resolveUserLanguage('u1')).resolves.toBe('de');
    });

    it('нормализует региональный вариант из профиля', async () => {
      const svc = new LanguageService(makePg([{ language: 'fr-CA' }]));
      await expect(svc.resolveUserLanguage('u1')).resolves.toBe('fr');
    });

    it('падает в русский, если профиля нет', async () => {
      const svc = new LanguageService(makePg([]));
      await expect(svc.resolveUserLanguage('u1')).resolves.toBe('ru');
    });

    it('падает в русский, если запрос упал', async () => {
      const pg = { query: jest.fn().mockRejectedValue(new Error('boom')) } as any;
      const svc = new LanguageService(pg);
      await expect(svc.resolveUserLanguage('u1')).resolves.toBe('ru');
    });
  });

  describe('buildDirective', () => {
    it('называет язык и разрешает подстройку под пользователя', () => {
      const directive = LanguageService.buildDirective('es');
      expect(directive).toContain('Spanish');
      expect(directive).toContain('языке его последнего сообщения');
    });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd ~/Downloads/spirits_back && npx jest src/common/services/language.service.spec.ts`
Expected: FAIL — `Cannot find module './language.service'`.

- [ ] **Step 3: Реализовать сервис**

Создать `~/Downloads/spirits_back/src/common/services/language.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PgService } from './pg.service';

export const SUPPORTED_LANGUAGES = ['ru', 'en', 'es', 'de', 'fr', 'zh'] as const;
export const DEFAULT_LANGUAGE = 'ru';

/** Названия для системного промпта — модель понимает их однозначнее кодов. */
export const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'русском',
  en: 'English (английском)',
  es: 'Spanish / español (испанском)',
  de: 'German / Deutsch (немецком)',
  fr: 'French / français (французском)',
  zh: 'Simplified Chinese / 简体中文 (упрощённом китайском)',
};

@Injectable()
export class LanguageService {
  constructor(private readonly pg: PgService) {}

  /** Схлопывает произвольный тег языка до поддерживаемого корня. */
  static normalize(raw?: string | null): string {
    if (!raw) return DEFAULT_LANGUAGE;
    const root = String(raw).toLowerCase().split(/[-_]/)[0];
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(root) ? root : DEFAULT_LANGUAGE;
  }

  /**
   * Языковая директива для системного промпта.
   * Схема — язык профиля как база, подстройка под язык реплики пользователя.
   */
  static buildDirective(lang: string): string {
    const name = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES[DEFAULT_LANGUAGE];
    return (
      `\n--- ЯЗЫК ОБЩЕНИЯ ---\n` +
      `Язык интерфейса пользователя — ${name}. По умолчанию отвечай именно на нём, ` +
      `независимо от языка системных сообщений, tool-результатов, путей файлов и ` +
      `английских промптов в твоём контексте. ` +
      `Если пользователь написал последнее сообщение на другом языке — отвечай на ` +
      `языке его последнего сообщения.\n`
    );
  }

  /** Язык из profile_data. Фолбэк — русский, в том числе при ошибке БД. */
  async resolveUserLanguage(userId: string): Promise<string> {
    try {
      const res = await this.pg.query(
        `SELECT profile_data->>'language' AS language
           FROM ai_profiles_consolidated
          WHERE user_id = $1
          LIMIT 1`,
        [userId],
      );
      return LanguageService.normalize(res.rows[0]?.language);
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `cd ~/Downloads/spirits_back && npx jest src/common/services/language.service.spec.ts`
Expected: PASS — 10 тестов.

- [ ] **Step 5: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/common/services/language.service.ts src/common/services/language.service.spec.ts
git commit -m "feat(i18n): хелпер языка пользователя и языковая директива промпта"
```

---

## Task 13: Языковая директива в основном пути чата

`streamUniversalAgent` обслуживает **всех** ассистентов кроме Маши (`chat.service.ts:217`: `if (agent.id !== 3) return this.streamUniversalAgent(...)`). Сейчас там на строке 546 захардкожено «ЯЗЫК ОТВЕТА: всегда отвечай на русском языке» — прямая блокировка фичи.

**Files:**
- Modify: `~/Downloads/spirits_back/src/chat/chat.service.ts:455-546`
- Modify: `~/Downloads/spirits_back/src/chat/chat.module.ts`

- [ ] **Step 1: Зарегистрировать LanguageService в модуле чата**

В `~/Downloads/spirits_back/src/chat/chat.module.ts` добавить импорт:

```typescript
import { LanguageService } from '../common/services/language.service';
```

и добавить `LanguageService` в массив `providers`.

- [ ] **Step 2: Внедрить сервис в ChatService**

Run: `cd ~/Downloads/spirits_back && grep -n "constructor(" -A 12 src/chat/chat.service.ts | head -20`
Expected: виден список зависимостей конструктора.

Добавить в конструктор `ChatService` параметр:

```typescript
    private readonly language: LanguageService,
```

и импорт в шапку файла:

```typescript
import { LanguageService } from '../common/services/language.service';
```

- [ ] **Step 3: Заменить захардкоженную русскую директиву**

В `~/Downloads/spirits_back/src/chat/chat.service.ts` в методе `streamUniversalAgent` заменить строку (546):

```typescript
      `ЯЗЫК ОТВЕТА: всегда отвечай на русском языке, независимо от языка системных сообщений, tool-результатов, путей файлов или английских промптов в твоём контексте. Переключайся на другой язык ТОЛЬКО если пользователь явно полностью пишет на нём. Если пользователь пишет по-русски — твой ответ обязан быть на русском, даже если в нём есть английские слова или ты только что генерировал английский prompt для картинки.\n\n`;
```

на:

```typescript
      LanguageService.buildDirective(userLanguage) + `\n`;
```

- [ ] **Step 4: Вычислить язык перед сборкой префикса**

В том же методе, непосредственно перед строкой `let contextPrefix =` (540) вставить:

```typescript
    // Язык профиля читается один раз на запрос; фолбэк внутри — русский.
    const userLanguage = await this.language.resolveUserLanguage(userId);
```

- [ ] **Step 5: Написать тест на директиву**

Создать `~/Downloads/spirits_back/src/chat/chat.language.spec.ts`:

```typescript
import { LanguageService } from '../common/services/language.service';

describe('языковая директива в промпте', () => {
  it('для испанского называет испанский, а не русский', () => {
    const d = LanguageService.buildDirective('es');
    expect(d).toContain('español');
    expect(d).not.toContain('Язык интерфейса пользователя — русском');
  });

  it('для русского профиля остаётся русской', () => {
    expect(LanguageService.buildDirective('ru')).toContain('русском');
  });

  it('неизвестный код деградирует в русский, а не в пустоту', () => {
    const d = LanguageService.buildDirective('xx');
    expect(d).toContain('русском');
  });

  it('всегда разрешает подстройку под язык реплики', () => {
    for (const lang of ['ru', 'en', 'es', 'de', 'fr', 'zh']) {
      expect(LanguageService.buildDirective(lang)).toContain('языке его последнего сообщения');
    }
  });
});
```

- [ ] **Step 6: Запустить тесты**

Run: `cd ~/Downloads/spirits_back && npx jest src/chat/chat.language.spec.ts src/common/services/language.service.spec.ts`
Expected: PASS — 14 тестов.

Run: `cd ~/Downloads/spirits_back && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 7: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/chat/chat.service.ts src/chat/chat.module.ts src/chat/chat.language.spec.ts
git commit -m "feat(i18n): язык профиля в системном промпте основного пути чата"
```

---

## Task 14: Языковая директива в оставшихся двух путях

`generateAgentReply` (приветствия и синтетические пробы) содержит `ЯЗЫК ОТВЕТА: всегда на русском языке` — из-за него первое сообщение ассистента приходит по-русски даже при испанском профиле. Локальный путь Маши (id=3) директивы не имеет вовсе.

**Files:**
- Modify: `~/Downloads/spirits_back/src/chat/chat.service.ts:251-257` (путь Маши)
- Modify: `~/Downloads/spirits_back/src/chat/chat.service.ts:1003-1013` (`generateAgentReply`)

- [ ] **Step 1: Починить generateAgentReply**

В `~/Downloads/spirits_back/src/chat/chat.service.ts` заменить строку:

```typescript
      `ЯЗЫК ОТВЕТА: всегда на русском языке.\n\n`;
```

на:

```typescript
      LanguageService.buildDirective(await this.language.resolveUserLanguage(userId)) + `\n`;
```

- [ ] **Step 2: Убедиться, что userId доступен в этой области**

Run: `cd ~/Downloads/spirits_back && grep -n "async generateAgentReply" -A 6 src/chat/chat.service.ts`
Expected: `userId` есть среди параметров метода. Если параметр называется иначе — использовать фактическое имя.

- [ ] **Step 3: Добавить директиву в локальный путь Маши**

В `~/Downloads/spirits_back/src/chat/chat.service.ts` в конце шаблонной строки `stableSystemPrompt` (после строки `• Если запрос многослойный — сначала покрой то, что ясно (частичный ответ), потом максимум один вопрос для следующего шага.`) добавить перед закрывающей обратной кавычкой:

```
${LanguageService.buildDirective(userLanguage)}
```

- [ ] **Step 4: Вычислить язык для локального пути**

Непосредственно перед строкой `const platformContext = ` вставить:

```typescript
    const userLanguage = await this.language.resolveUserLanguage(userId);
```

- [ ] **Step 5: Убедиться, что русский хардкод больше не встречается**

Run: `cd ~/Downloads/spirits_back && grep -n "ЯЗЫК ОТВЕТА" src/chat/chat.service.ts`
Expected: пустой вывод — все три вхождения заменены на `LanguageService.buildDirective`.

Run: `cd ~/Downloads/spirits_back && grep -c "buildDirective" src/chat/chat.service.ts`
Expected: `3`.

- [ ] **Step 6: Проверить компиляцию и тесты**

Run: `cd ~/Downloads/spirits_back && npx tsc --noEmit && npx jest src/chat/`
Expected: компиляция без ошибок, все тесты чата зелёные.

- [ ] **Step 7: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/chat/chat.service.ts
git commit -m "feat(i18n): язык профиля в приветствиях и в локальном пути Маши"
```

---

## Task 15: Таблица переводов карточек ассистентов

`entity_id` — именно `TEXT`: у `agents.id` тип `int`, у `custom_agents.id` — `uuid`. Числовая колонка тихо сломалась бы ровно на пользовательских ассистентах.

**Files:**
- Create: `~/Downloads/spirits_back/src/agents/migrations/001_agent_translations.sql`

- [ ] **Step 1: Написать миграцию**

Создать `~/Downloads/spirits_back/src/agents/migrations/001_agent_translations.sql`:

```sql
-- Локализованные карточки ассистентов (имя и описание), которые видит пользователь.
-- Системные промпты НЕ переводятся намеренно: шесть копий каждой персоны — это
-- шесть источников расхождений при любой правке промпта.
CREATE TABLE IF NOT EXISTS agent_translations (
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('agent', 'custom_agent')),
  -- TEXT, а не INT: agents.id — int, custom_agents.id — uuid.
  -- Внешнего ключа нет по той же причине: таблица ссылается на два источника.
  entity_id    TEXT NOT NULL,
  locale       TEXT NOT NULL,
  display_name TEXT,
  description  TEXT,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, locale)
);

CREATE INDEX IF NOT EXISTS agent_translations_lookup
  ON agent_translations (locale, entity_type);
```

- [ ] **Step 2: Применить миграцию локально**

Run:

```bash
cd ~/Downloads/spirits_back && npm run migrate 2>&1 | tail -20
```

Expected: миграция применена. Если runner падает на `base/001` (известная поломка прода) — применить вручную:

```bash
psql "$DATABASE_URL" -f src/agents/migrations/001_agent_translations.sql
```

- [ ] **Step 3: Проверить структуру**

Run: `psql "$DATABASE_URL" -c "\d agent_translations"`
Expected: таблица с колонками `entity_type`, `entity_id` (**text**), `locale`, `display_name`, `description`, `updated_at`.

- [ ] **Step 4: Записать факт применения для прода**

Прод-migrate-runner застревает на `base/001` и не докатывает ничего после него, поэтому на проде миграция накатывается вручную с записью в `schema_migrations`. Зафиксировать команду для будущего деплоя в самой миграции — добавить в конец файла комментарий:

```sql
-- Накат на прод (migrate-runner сломан на base/001):
--   psql -f src/agents/migrations/001_agent_translations.sql
--   INSERT INTO schema_migrations (name) VALUES ('agents/001_agent_translations')
--     ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/agents/migrations/001_agent_translations.sql
git commit -m "feat(i18n): таблица agent_translations для локализованных карточек"
```

---

## Task 16: Локализованный список ассистентов

`/webhook/agents` объявлен **без** `JwtGuard` (`agents.controller.ts:21-25`), поэтому userId недоступен и локаль приходит query-параметром.

**Files:**
- Modify: `~/Downloads/spirits_back/src/agents/agents.service.ts:15-22`
- Modify: `~/Downloads/spirits_back/src/agents/agents.controller.ts:21-25`

- [ ] **Step 1: Написать падающий тест**

Создать `~/Downloads/spirits_back/src/agents/agents.i18n.spec.ts`:

```typescript
import { AgentsService } from './agents.service';

describe('AgentsService.getAgents с локалью', () => {
  const makePg = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }) as any;

  it('передаёт локаль параметром запроса', async () => {
    const pg = makePg();
    await new AgentsService(pg).getAgents('es');
    expect(pg.query).toHaveBeenCalledWith(expect.stringContaining('agent_translations'), ['es']);
  });

  it('нормализует региональный вариант локали', async () => {
    const pg = makePg();
    await new AgentsService(pg).getAgents('es-MX');
    expect(pg.query).toHaveBeenCalledWith(expect.any(String), ['es']);
  });

  it('без локали берёт русский', async () => {
    const pg = makePg();
    await new AgentsService(pg).getAgents();
    expect(pg.query).toHaveBeenCalledWith(expect.any(String), ['ru']);
  });

  it('запрос деградирует в русские колонки через COALESCE', async () => {
    const pg = makePg();
    await new AgentsService(pg).getAgents('de');
    const sql = pg.query.mock.calls[0][0];
    expect(sql).toContain('COALESCE');
    expect(sql).toContain('LEFT JOIN');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd ~/Downloads/spirits_back && npx jest src/agents/agents.i18n.spec.ts`
Expected: FAIL — `getAgents` не принимает аргумент и не упоминает `agent_translations`.

- [ ] **Step 3: Переписать getAgents**

В `~/Downloads/spirits_back/src/agents/agents.service.ts` добавить импорт:

```typescript
import { LanguageService } from '../common/services/language.service';
```

и заменить метод `getAgents`:

```typescript
  async getAgents(): Promise<any[]> {
    const res = await this.pg.query(
      `SELECT id, name, COALESCE(display_name, name) AS "displayName",
              description, category
         FROM agents
        ORDER BY id`,
    );
    return res.rows;
  }
```

на:

```typescript
  /**
   * Локаль приходит query-параметром, а не из профиля: эндпоинт /webhook/agents
   * публичный (без JwtGuard), userId там недоступен.
   * Незаполненный перевод деградирует в русские колонки, а не в пустоту.
   */
  async getAgents(locale?: string): Promise<any[]> {
    const lang = LanguageService.normalize(locale);
    const res = await this.pg.query(
      `SELECT a.id,
              a.name,
              COALESCE(t.display_name, a.display_name, a.name) AS "displayName",
              COALESCE(t.description, a.description)           AS description,
              a.category
         FROM agents a
         LEFT JOIN agent_translations t
                ON t.entity_type = 'agent'
               AND t.entity_id   = a.id::text
               AND t.locale      = $1
        ORDER BY a.id`,
      [lang],
    );
    return res.rows;
  }
```

- [ ] **Step 4: Принять параметр в контроллере**

В `~/Downloads/spirits_back/src/agents/agents.controller.ts` заменить:

```typescript
  @Get('agents')
  async getAgents(@Res() res: Response) {
    const agents = await this.agentsService.getAgents();
    return res.status(200).json(agents);
  }
```

на:

```typescript
  @Get('agents')
  async getAgents(@Query('lang') lang: string, @Res() res: Response) {
    const agents = await this.agentsService.getAgents(lang);
    return res.status(200).json(agents);
  }
```

и добавить `Query` в импорт из `@nestjs/common`:

```typescript
import { Controller, Get, Post, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
```

- [ ] **Step 5: Запустить тесты**

Run: `cd ~/Downloads/spirits_back && npx jest src/agents/agents.i18n.spec.ts && npx tsc --noEmit`
Expected: PASS — 4 теста, компиляция без ошибок.

- [ ] **Step 6: Проверить, что русский путь не сломался**

Run:

```bash
cd ~/Downloads/spirits_back && npm run start:dev &
sleep 15
curl -s 'http://localhost:3001/webhook/agents' | head -c 400
echo
curl -s 'http://localhost:3001/webhook/agents?lang=es' | head -c 400
```

Expected: оба запроса возвращают список ассистентов с непустыми `displayName` и `description`. Без переводов в таблице оба ответа одинаковы и по-русски — это и есть корректная деградация.

Остановить сервер: `kill %1`

- [ ] **Step 7: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/agents/agents.service.ts src/agents/agents.controller.ts src/agents/agents.i18n.spec.ts
git commit -m "feat(i18n): /webhook/agents отдаёт локализованные карточки по ?lang="
```

---

## Task 17: Локализованные имена коллег в промпте

`platformContext` перечисляет других ассистентов из БД. Без этого испаноязычному пользователю ассистент предложит переключиться на «Машу» кириллицей посреди испанского ответа.

**Files:**
- Modify: `~/Downloads/spirits_back/src/chat/chat.service.ts:228-243` (локальный путь)
- Modify: `~/Downloads/spirits_back/src/chat/chat.service.ts:557-570` (`streamUniversalAgent`)

- [ ] **Step 1: Локализовать список коллег в локальном пути**

В `~/Downloads/spirits_back/src/chat/chat.service.ts` заменить:

```typescript
    const allAgents = await this.pg.query('SELECT name, COALESCE(display_name, name) AS display_name, description, system_prompt FROM agents ORDER BY id');
```

на:

```typescript
    // Имена и описания коллег — на языке пользователя, иначе ассистент
    // предложит переключиться на «Машу» кириллицей посреди испанского ответа.
    const allAgents = await this.pg.query(
      `SELECT a.name,
              COALESCE(t.display_name, a.display_name, a.name) AS display_name,
              COALESCE(t.description, a.description)           AS description,
              a.system_prompt
         FROM agents a
         LEFT JOIN agent_translations t
                ON t.entity_type = 'agent'
               AND t.entity_id   = a.id::text
               AND t.locale      = $1
        ORDER BY a.id`,
      [userLanguage],
    );
```

- [ ] **Step 2: Локализовать список коллег в streamUniversalAgent**

Run: `cd ~/Downloads/spirits_back && sed -n '556,572p' src/chat/chat.service.ts`
Expected: виден запрос `coworkersRes` с `SELECT COALESCE(display_name, name) AS display_name, description FROM agents`.

Заменить тело этого запроса на:

```typescript
      const coworkersRes = await this.pg.query(
        `SELECT COALESCE(t.display_name, a.display_name, a.name) AS display_name,
                COALESCE(t.description, a.description)           AS description
           FROM agents a
           LEFT JOIN agent_translations t
                  ON t.entity_type = 'agent'
                 AND t.entity_id   = a.id::text
                 AND t.locale      = $1
          ORDER BY a.id`,
        [userLanguage],
      );
```

Если в исходном запросе были дополнительные условия (`WHERE`, фильтры) — сохранить их, добавив после `LEFT JOIN`.

- [ ] **Step 3: Проверить компиляцию**

Run: `cd ~/Downloads/spirits_back && npx tsc --noEmit`
Expected: без ошибок. Если `userLanguage` не в области видимости во втором месте — он объявлен в Task 13 Step 4 перед `let contextPrefix`; перенести объявление выше блока с коллегами.

- [ ] **Step 4: Проверить, что чат работает**

Run:

```bash
cd ~/Downloads/spirits_back && npx jest src/chat/
```

Expected: все тесты чата зелёные.

- [ ] **Step 5: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/chat/chat.service.ts
git commit -m "feat(i18n): локализованные имена ассистентов в контексте промпта"
```

---

## Task 18: Фронт передаёт язык в чат и в список ассистентов

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx:1114-1118`
- Modify: `src/components/chat/AssistantSelection.tsx`

- [ ] **Step 1: Передать язык в запрос чата**

В `src/components/chat/ChatInterface.tsx` заменить:

```typescript
      const response = await apiClient.post('/webhook/soulmate/chat', {
        chatInput: userMessage,
        assistant: currentAssistantId,
        ...(freshTs ? { fresh: true, freshTs } : {})
      }, {
```

на:

```typescript
      const response = await apiClient.post('/webhook/soulmate/chat', {
        chatInput: userMessage,
        assistant: currentAssistantId,
        // Быстрый путь: бэк не читает профиль лишний раз. Профиль остаётся
        // авторитетным фолбэком, если поле не пришло.
        lang: resolveLanguage(i18n.language),
        ...(freshTs ? { fresh: true, freshTs } : {})
      }, {
```

- [ ] **Step 2: Добавить импорты в ChatInterface**

В `src/components/chat/ChatInterface.tsx` добавить:

```typescript
import { resolveLanguage } from '../../i18n/languages';
```

Run: `grep -n "useTranslation" src/components/chat/ChatInterface.tsx | head -3`
Expected: `useTranslation` уже используется. Убедиться, что из него достаётся `i18n`; если в компоненте написано `const { t } = useTranslation();` — заменить на `const { t, i18n } = useTranslation();`.

- [ ] **Step 3: Передать язык в запрос списка ассистентов**

Run: `grep -n "webhook/agents" src/components/chat/AssistantSelection.tsx`
Expected: строка с вызовом `apiClient.get('/webhook/agents')`.

Заменить её на:

```typescript
      const response = await apiClient.get(`/webhook/agents?lang=${resolveLanguage(i18n.language)}`);
```

- [ ] **Step 4: Добавить импорты в AssistantSelection**

В `src/components/chat/AssistantSelection.tsx` добавить:

```typescript
import { resolveLanguage } from '../../i18n/languages';
```

и убедиться, что `i18n` достаётся из `useTranslation()`. Если `useTranslation` в файле нет — добавить:

```typescript
import { useTranslation } from 'react-i18next';
```

и внутри компонента:

```typescript
  const { i18n } = useTranslation();
```

- [ ] **Step 5: Перезагружать список при смене языка**

Найти `useEffect`, который грузит ассистентов, и добавить `i18n.language` в массив зависимостей — иначе при переключении языка карточки останутся на прежнем.

Run: `grep -n "useEffect" -A 8 src/components/chat/AssistantSelection.tsx | grep -n "\], \[" `
Expected: виден массив зависимостей эффекта загрузки.

- [ ] **Step 6: Проверить сборку и линт**

Run: `pnpm build && pnpm lint`
Expected: обе команды успешны.

- [ ] **Step 7: Коммит**

```bash
git add src/components/chat/ChatInterface.tsx src/components/chat/AssistantSelection.tsx
git commit -m "feat(i18n): фронт передаёт язык в чат и в список ассистентов"
```

---

## Task 19: Заполнить agent_translations переводами карточек

Таблица из Task 15 пуста, поэтому карточки деградируют в русские. Расширяем скрипт перевода режимом, который читает `agents` из БД и пишет переводы обратно.

**Files:**
- Create: `~/Downloads/spirits_back/scripts/translate-agents.mjs`
- Modify: `~/Downloads/spirits_back/package.json`

- [ ] **Step 1: Установить SDK на бэке**

```bash
cd ~/Downloads/spirits_back
npm install --save-dev @anthropic-ai/sdk@^0.68.0
```

- [ ] **Step 2: Написать скрипт**

Создать `~/Downloads/spirits_back/scripts/translate-agents.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Переводит имена и описания ассистентов из таблицы agents в agent_translations.
 * Идемпотентен: пропускает пары (ассистент, локаль), которые уже переведены.
 *
 *   node scripts/translate-agents.mjs           # все языки
 *   node scripts/translate-agents.mjs es de     # только указанные
 *
 * Системные промпты НЕ переводятся намеренно — см. спеку.
 */
import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';

const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish (Spain)',
  de: 'German',
  fr: 'French',
  zh: 'Simplified Chinese',
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    display_name: { type: 'string', description: 'Имя ассистента на целевом языке' },
    description: { type: 'string', description: 'Описание ассистента на целевом языке' },
  },
  required: ['display_name', 'description'],
  additionalProperties: false,
};

const client = new Anthropic();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

async function translateAgent(agent, targetCode) {
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2000,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
    },
    system: `Ты локализуешь карточки AI-ассистентов платформы Linkeon на ${LANGUAGE_NAMES[targetCode]}.

ПРАВИЛА:
1. Имя ассистента — это личное имя (Роман, Маша, Юлия). Транслитерируй его в целевой
   язык естественно для носителя, НЕ переводи по смыслу и не заменяй другим именем.
2. Описание — короткая фраза для карточки выбора. Держи его коротким: длинная строка
   ломает вёрстку карточки.
3. "Linkeon" не переводить.
4. Термин продукта — «Ассистент» (assistant / asistente / Assistent / assistant / 助手),
   НИКОГДА не «агент».`,
    messages: [
      {
        role: 'user',
        content: `Имя: ${agent.display_name}\nОписание: ${agent.description || '(пусто)'}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Модель отклонила запрос: ${response.stop_details?.category ?? 'unknown'}`);
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('В ответе модели нет текстового блока');
  return JSON.parse(textBlock.text);
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(LANGUAGE_NAMES);

for (const code of targets) {
  if (!LANGUAGE_NAMES[code]) {
    console.error(`Неизвестный язык: ${code}. Доступны: ${Object.keys(LANGUAGE_NAMES).join(', ')}`);
    process.exit(1);
  }
}

const { rows: agents } = await db.query(
  `SELECT id, COALESCE(display_name, name) AS display_name, description FROM agents ORDER BY id`,
);

for (const code of targets) {
  console.log(`\n🔤 ${code}`);
  for (const agent of agents) {
    const { rows: existing } = await db.query(
      `SELECT 1 FROM agent_translations
        WHERE entity_type = 'agent' AND entity_id = $1 AND locale = $2`,
      [String(agent.id), code],
    );
    if (existing.length > 0) {
      console.log(`   ⏭  ${agent.display_name} — уже переведён`);
      continue;
    }

    const translated = await translateAgent(agent, code);
    await db.query(
      `INSERT INTO agent_translations (entity_type, entity_id, locale, display_name, description)
       VALUES ('agent', $1, $2, $3, $4)
       ON CONFLICT (entity_type, entity_id, locale)
       DO UPDATE SET display_name = EXCLUDED.display_name,
                     description  = EXCLUDED.description,
                     updated_at   = now()`,
      [String(agent.id), code, translated.display_name, translated.description],
    );
    console.log(`   ✅ ${agent.display_name} → ${translated.display_name}`);
  }
}

await db.end();
```

- [ ] **Step 3: Добавить скрипт в package.json**

В `~/Downloads/spirits_back/package.json` в блок `"scripts"` добавить:

```json
    "translate-agents": "node scripts/translate-agents.mjs",
```

- [ ] **Step 4: Прогнать на одном языке**

Run: `cd ~/Downloads/spirits_back && npm run translate-agents es`
Expected: по строке на каждого ассистента вида `✅ Роман → Román`.

- [ ] **Step 5: Проверить результат в БД**

Run: `psql "$DATABASE_URL" -c "SELECT entity_id, locale, display_name FROM agent_translations WHERE locale='es' ORDER BY entity_id::int"`
Expected: по строке на ассистента с испанскими именами и непустыми описаниями.

- [ ] **Step 6: Прогнать остальные языки**

Run: `cd ~/Downloads/spirits_back && npm run translate-agents`
Expected: `es` пропускается целиком (`⏭ уже переведён`), остальные четыре языка переводятся.

- [ ] **Step 7: Проверить эндпоинт**

```bash
cd ~/Downloads/spirits_back && npm run start:dev &
sleep 15
curl -s 'http://localhost:3001/webhook/agents?lang=es' | head -c 400
kill %1
```

Expected: `displayName` и `description` на испанском.

- [ ] **Step 8: Коммит**

```bash
cd ~/Downloads/spirits_back
git add scripts/translate-agents.mjs package.json package-lock.json
git commit -m "feat(i18n): скрипт локализации карточек ассистентов"
```

---

## Task 20: Защита от нарастания хардкода

Вычистить строки мало — новые нарастут за месяц. Плагин ограничен уже мигрированными каталогами; каждый заход экстракции (2-6) дописывает свой каталог в `MIGRATED_DIRS`.

**Files:**
- Modify: `eslint.config.js`
- Modify: `package.json`

- [ ] **Step 1: Установить плагин**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm add -D eslint-plugin-i18next@^6.1.1
```

- [ ] **Step 2: Настроить правило по мигрированным каталогам**

В `eslint.config.js` добавить импорт после существующих:

```javascript
import i18next from 'eslint-plugin-i18next';
```

и добавить вторым аргументом `tseslint.config(...)`, после существующего блока (перед закрывающей `)`):

```javascript
  {
    // Каталоги, из которых хардкод уже вычищен. Каждый заход экстракции
    // (chat → onboarding → settings/profile → video/imagegen/tokens →
    // pages/chats/search) дописывает сюда свой путь, и правило удерживает
    // зачищенный слой чистым. Админка сюда не попадает никогда — она
    // остаётся русской по решению из спеки.
    files: ['src/i18n/**/*.{ts,tsx}', 'src/utils/formatters.ts'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        { markupOnly: true, onlyAttribute: [] },
      ],
    },
  },
```

- [ ] **Step 3: Убедиться, что линт зелёный**

Run: `pnpm lint`
Expected: успех — ESLint без ошибок и `check-locales` с шестью зелёными строками.

Если правило срабатывает на реестре языков (родные названия `Русский`, `English` — это данные, а не UI-строки), добавить в блок правила исключение файла:

```javascript
    files: ['src/utils/formatters.ts'],
```

то есть убрать `src/i18n/**` из области.

- [ ] **Step 4: Коммит**

```bash
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "chore(i18n): eslint-правило против хардкода в мигрированных каталогах"
```

---

## Task 21: Сквозная проверка и деплой

**Files:** нет — только проверка.

- [ ] **Step 1: Полный прогон проверок фронта**

Run: `cd /Users/dmitry/Downloads/spirits_front && pnpm test && pnpm lint && pnpm build`
Expected: все три зелёные. `check-locales` показывает `✅` по всем пяти языкам.

- [ ] **Step 2: Полный прогон проверок бэка**

Run: `cd ~/Downloads/spirits_back && npx tsc --noEmit && npm test`
Expected: компиляция без ошибок, jest-сьюты зелёные.

- [ ] **Step 3: Ручная проверка на dev-сервере**

Run: `cd /Users/dmitry/Downloads/spirits_front && pnpm dev`

Пройти по шагам и зафиксировать результат каждого:

1. Открыть http://localhost:5173 в инкогнито → на экране входа виден переключатель языка с шестью вариантами.
2. Переключить на **Español** → подписи формы входа стали испанскими.
3. Войти под тестовым номером `70000000000` (OTP через `GET /webhook/debug/sms-code/70000000000`).
4. Открыть чат → имена и описания ассистентов на испанском (из `agent_translations`).
5. Написать ассистенту фразу по-испански → ответ приходит по-испански.
6. Написать следующую фразу по-русски → ассистент отвечает по-русски (работает подстройка под язык реплики).
7. Переключить язык на **中文** в настройках → интерфейс китайский; проверить, что кнопки и метки не переполняют вёрстку (иероглифы шире кириллицы).
8. Перезагрузить страницу → язык остался китайским (прочитан из профиля).

Остановить dev-сервер (Ctrl+C).

- [ ] **Step 4: Зафиксировать результат проверки**

Записать, какие из восьми пунктов прошли, а какие нет. Незакрытый пункт — блокер деплоя, а не примечание.

- [ ] **Step 5: Запушить в origin/main**

```bash
cd /Users/dmitry/Downloads/spirits_front && git push origin main
cd ~/Downloads/spirits_back && git push origin main
```

- [ ] **Step 6: Деплой**

⚠️ **Не запускать без явного согласия пользователя** — `deploy.sh` катит на прод.

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

Двухфазный пайплайн: `test.linkeon.io` → smoke → `my.linkeon.io` → smoke. Если test красный — прод не трогается.

Перед деплоем накатить миграцию `agent_translations` на прод вручную (migrate-runner застревает на `base/001`):

```bash
ssh dvolkov@212.113.106.202 "cd ~/spirits_back && psql \"\$DATABASE_URL\" -f src/agents/migrations/001_agent_translations.sql && psql \"\$DATABASE_URL\" -c \"INSERT INTO schema_migrations (name) VALUES ('agents/001_agent_translations') ON CONFLICT DO NOTHING;\""
```

- [ ] **Step 7: Smoke-проверка прода**

```bash
curl -s 'https://my.linkeon.io/webhook/agents?lang=es' | head -c 300
```

Expected: список ассистентов, HTTP 200.

---

## Что остаётся после этого захода

Заходы 2-6 — экстракция захардкоженных строк по разделам: `chat` (354 строки) → `onboarding` включая юртексты (286) → `settings` + `profile` (249) → `video` + `imagegen` + `tokens` (273) → `pages` + `chats` + `search` (165). Каждый заход: вытащить литералы в `ru.json`, заменить на `t()`, мигрировать вызовы `'ru-RU'` на `formatters.ts`, прогнать `pnpm translate-locales`, дописать каталог в область правила `no-literal-string` из Task 20, прогнать `deploy.sh`.

Локализация карточек **пользовательских** ассистентов (`custom_agents`) схемой уже покрыта — `entity_type = 'custom_agent'`, — но не заполняется: они создаются юзерами на ходу, и осмысленный момент для перевода определится по мере использования фичи.
