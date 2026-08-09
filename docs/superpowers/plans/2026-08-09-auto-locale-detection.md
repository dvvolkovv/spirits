# Автоопределение языка посетителя — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** посетитель с нерусской локалью браузера видит лендинг и кабинет на своём языке, и ассистенты общаются с ним на нём же.

**Architecture:** три независимые правки. В кабинете и на лендинге незнакомая локаль перестаёт падать в русский и падает в английский. На лендинге появляется inline-скрипт в `<head>`, который уводит посетителя с канонического русского корня на его языковую версию — логика живёт одной чистой функцией, её же исходник целиком уезжает в HTML через `Function.prototype.toString()`, поэтому проверяемый код и отгружаемый код физически один. На бэке язык из тела чат-запроса используется как подстраховка, когда в профиле языка ещё нет.

**Tech Stack:** Vite 5 + React 18 + i18next (оба фронтенда), vitest (юниты), Playwright (лендинг, e2e), NestJS 10 + jest (бэк).

**Спека:** `docs/superpowers/specs/2026-08-09-auto-locale-detection-design.md`

---

## Карта файлов

**`spirits_front` (кабинет)**
- Изменить `src/i18n/languages.ts` — константы `VISITOR_FALLBACK`, `FALLBACK_CHAIN`; `resolveLanguage` падает в английский
- Изменить `src/i18n/languages.test.ts` — тесты сейчас фиксируют старое поведение
- Изменить `src/i18n/index.ts` — `fallbackLng: FALLBACK_CHAIN`
- Создать `src/i18n/fallbackChain.test.ts` — проверка на настоящих файлах локалей
- Изменить `src/components/onboarding/phoneCountry.test.ts` — фиксирует старое `pt → RU`

**`land_linkeon` (лендинг)**
- Изменить `src/i18n/languages.ts` — тот же английский фолбэк
- Изменить `src/i18n/languages.test.ts`
- Создать `scripts/visitor-redirect.js` — `pickRedirect()` (чистая) и `snippetSource()`
- Создать `scripts/visitor-redirect.test.mjs`
- Изменить `vite.config.ts` — плагин, вставляющий скрипт в `<head>`
- Изменить `src/components/ui/LangSwitcher.tsx` — запись явного выбора
- Изменить `src/components/ui/LanguageBanner.tsx` — запись явного выбора
- Создать `tests/locale-redirect.spec.ts` — Playwright по локалям

**`spirits_back` (ассистенты)**
- Изменить `src/common/services/language.service.ts` — подсказка из запроса
- Изменить `src/chat/chat.controller.ts` — читает `body.lang`
- Изменить `src/chat/chat.service.ts` — прокидывает язык до `resolveUserLanguage`
- Изменить `src/chat/chat.language.spec.ts` — тесты приоритета
- Создать `tests/assistant-language.e2e.mjs` — сквозная проверка языка ответа

---

# Часть A. Кабинет `spirits_front`

Все команды из `/Users/dmitry/Downloads/spirits_front`.

## Task 1: незнакомая локаль → английский

**Files:**
- Modify: `src/i18n/languages.ts:20-32`
- Test: `src/i18n/languages.test.ts:33-42`

- [ ] **Step 1: Переписать тесты старого поведения**

В `src/i18n/languages.test.ts` заменить два последних блока `it` внутри `describe('resolveLanguage')` на:

```ts
  it('незнакомый язык уводит в английский, а не в русский', () => {
    expect(resolveLanguage('pt')).toBe(VISITOR_FALLBACK);
    expect(resolveLanguage('ja-JP')).toBe(VISITOR_FALLBACK);
    expect(resolveLanguage('pt')).not.toBe(DEFAULT_LANGUAGE);
  });

  it('пустое значение — тоже английский: языка посетителя мы не знаем', () => {
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage(null)).toBe('en');
    expect(resolveLanguage('')).toBe('en');
  });

  it('русский остаётся русским — фолбэк не подменяет явный язык', () => {
    expect(resolveLanguage('ru')).toBe('ru');
    expect(resolveLanguage('ru-RU')).toBe('ru');
  });
```

И дополнить импорт в первой строке файла:

```ts
import { SUPPORTED_LANGUAGES, SUPPORTED_CODES, DEFAULT_LANGUAGE, VISITOR_FALLBACK, resolveLanguage } from './languages';
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `pnpm vitest run src/i18n/languages.test.ts`
Expected: FAIL — `VISITOR_FALLBACK` не экспортируется, и `resolveLanguage('pt')` возвращает `'ru'`.

- [ ] **Step 3: Реализовать**

В `src/i18n/languages.ts` заменить блок от `export const DEFAULT_LANGUAGE` до конца файла на:

```ts
export const DEFAULT_LANGUAGE = 'ru';

/**
 * Что показать посетителю, чьей локали у нас нет (pt, uk, ja…).
 *
 * Отдельная константа, а не DEFAULT_LANGUAGE: у русского здесь другая роль —
 * это язык-источник переводов и канонический корень лендинга. Смешивать две
 * роли в одной константе нельзя, иначе португалец получает кириллицу просто
 * потому, что русский оказался первым в реестре.
 */
export const VISITOR_FALLBACK = 'en';

/**
 * Чем закрывать ключ, которого нет в текущей локали. Сначала английский,
 * русский — последним рубежом: в es/de/fr/zh не хватает по ~250 ключей из
 * 1703, и немец на непереведённом экране должен видеть английский текст,
 * а не русский.
 */
export const FALLBACK_CHAIN = ['en', 'ru'];

export const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Схлопывает произвольный тег языка до поддерживаемого корня.
 * navigator.language отдаёт es-MX / zh-Hans, профиль может отдать что угодно.
 */
export function resolveLanguage(raw?: string | null): string {
  if (!raw) return VISITOR_FALLBACK;
  const root = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(root) ? root : VISITOR_FALLBACK;
}
```

- [ ] **Step 4: Запустить тест, убедиться что проходит**

Run: `pnpm vitest run src/i18n/languages.test.ts`
Expected: PASS, все блоки зелёные.

- [ ] **Step 5: Сломать нарочно**

Временно вернуть в `resolveLanguage` строку `return SUPPORTED_CODES.includes(root) ? root : DEFAULT_LANGUAGE;` и запустить тот же прогон.
Expected: FAIL на «незнакомый язык уводит в английский». Вернуть правку обратно и убедиться, что снова PASS. Без этого шага неизвестно, проверяет ли тест хоть что-нибудь.

- [ ] **Step 6: Коммит**

```bash
git add src/i18n/languages.ts src/i18n/languages.test.ts
git commit -m "fix(i18n): незнакомая локаль ведёт в английский, а не в русский"
```

## Task 2: цепочка фолбэка ключей

**Files:**
- Modify: `src/i18n/index.ts:22`
- Create: `src/i18n/fallbackChain.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `src/i18n/fallbackChain.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import i18next from 'i18next';
import { FALLBACK_CHAIN, SUPPORTED_CODES } from './languages';
import ru from './locales/ru.json';
import en from './locales/en.json';
import de from './locales/de.json';

/**
 * Проверяем на НАСТОЯЩИХ файлах локалей, а не на выдуманных ресурсах: смысл
 * цепочки именно в том, чем закрываются реальные дыры в de/es/fr/zh.
 */
describe('фолбэк непереведённого ключа', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'de',
      fallbackLng: FALLBACK_CHAIN,
      supportedLngs: SUPPORTED_CODES,
      resources: {
        ru: { translation: ru },
        en: { translation: en },
        de: { translation: de },
      },
      interpolation: { escapeValue: false },
    });
  });

  it('ключ, которого нет в немецком, приходит из английского, а не из русского', () => {
    // admin.title переведён в ru и en, но не в de — ровно тот случай, ради
    // которого цепочка и меняется.
    expect((de as Record<string, any>).admin?.title).toBeUndefined();
    expect(i18next.t('admin.title')).toBe((en as any).admin.title);
    expect(i18next.t('admin.title')).not.toBe((ru as any).admin.title);
  });

  it('переведённый ключ берётся из немецкого и никуда не подменяется', () => {
    expect(i18next.t('settings.language_title')).toBe((de as any).settings.language_title);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm vitest run src/i18n/fallbackChain.test.ts`
Expected: FAIL — `FALLBACK_CHAIN` уже есть из Task 1, но `admin.title` вернётся русским, потому что тест берёт цепочку из константы, а сама константа в `index.ts` ещё не подключена. Если тест внезапно зелёный — значит `admin.title` есть в `de.json`; тогда выбрать другой ключ командой `node -e "const r=require('./src/i18n/locales/ru.json'),d=require('./src/i18n/locales/de.json');console.log(Object.keys(r.admin).filter(k=>!d.admin||!(k in d.admin)).slice(0,5))"` и подставить его.

- [ ] **Step 3: Подключить цепочку в конфиг**

В `src/i18n/index.ts` заменить строку `fallbackLng: DEFAULT_LANGUAGE,` на:

```ts
    // Цепочка, а не один язык: незакрытый ключ в de/es/fr/zh раньше приходил
    // русским прямо посреди чужого интерфейса. Русский остаётся последним
    // рубежом — он источник правды и заполнен целиком.
    fallbackLng: FALLBACK_CHAIN,
```

и дополнить импорт:

```ts
import { SUPPORTED_CODES, DEFAULT_LANGUAGE, FALLBACK_CHAIN } from './languages';
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `pnpm vitest run src/i18n/fallbackChain.test.ts`
Expected: PASS оба блока.

- [ ] **Step 5: Проверить, что английский чанк реально грузится**

Run: `pnpm build`
Expected: сборка проходит. `fallbackLng: ['en','ru']` означает, что для немца i18next дополнительно подтянет чанк `en` — это ожидаемая цена, а не дефект. Убедиться, что `dist/assets/` содержит отдельные чанки локалей: `ls dist/assets | grep -E "en|de" | head`.

- [ ] **Step 6: Коммит**

```bash
git add src/i18n/index.ts src/i18n/fallbackChain.test.ts
git commit -m "fix(i18n): непереведённый ключ закрывается английским, а не русским"
```

## Task 3: страна телефона для незнакомой локали

**Files:**
- Modify: `src/components/onboarding/phoneCountry.test.ts:17-21`

Правка кода не нужна: `defaultCountryForLanguage` уже строится на `resolveLanguage`. Нужно обновить тест, который фиксировал старое поведение, и убедиться, что смена осознанная.

- [ ] **Step 1: Переписать тест**

Заменить блок `it('падает в RU для неизвестного и пустого языка', …)` на:

```ts
  it('для незнакомой локали предлагает США, а не Россию', () => {
    // Следствие английского фолбэка (i18n/languages.ts): португалец больше не
    // получает предзаполненный +7. Страна — лишь первый выбор, список открыт.
    expect(defaultCountryForLanguage('pt')).toBe('US');
    expect(defaultCountryForLanguage(undefined)).toBe('US');
    expect(defaultCountryForLanguage(null)).toBe('US');
  });

  it('русский интерфейс по-прежнему даёт RU', () => {
    expect(defaultCountryForLanguage('ru')).toBe('RU');
    expect(defaultCountryForLanguage('ru-RU')).toBe('RU');
  });
```

- [ ] **Step 2: Запустить весь набор кабинета**

Run: `pnpm test`
Expected: PASS целиком. Если что-то ещё завязано на «неизвестный язык = русский», оно упадёт именно здесь — это и есть цель шага.

- [ ] **Step 3: Типы и линт**

Run: `pnpm typecheck && pnpm lint`
Expected: обе команды без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add src/components/onboarding/phoneCountry.test.ts
git commit -m "test(onboarding): незнакомая локаль даёт US, а не RU"
```

- [ ] **Step 5: Поправить комментарий, который описывает несуществующий механизм**

Выполняется ПОСЛЕ Task 10 — до неё правка была бы враньём в другую сторону.

В `src/components/chat/ChatInterface.tsx:1124-1126` заменить комментарий над полем `lang` на:

```tsx
        // Подстраховка на случай, когда язык ещё не доехал до профиля:
        // AuthContext пишет его без await, и первое сообщение новорега может
        // уйти раньше записи. Профиль остаётся главным — приоритет разбирает
        // LanguageService.resolveUserLanguage на бэке.
```

Старый текст утверждал «быстрый путь: бэк не читает профиль лишний раз», что неверно вдвойне: до Task 10 бэк поле вообще не читал, а после неё профиль всё равно запрашивается первым.

- [ ] **Step 6: Коммит**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "docs(chat): комментарий у поля lang описывает реальное поведение"
```

---

# Часть B. Лендинг `land_linkeon`

Все команды из `/Users/dmitry/Downloads/land_linkeon`. Репозиторий отдельный — коммиты идут в него, а не в `spirits_front`.

## Task 4: английский фолбэк на лендинге

**Files:**
- Modify: `src/i18n/languages.ts:13-21`
- Test: `src/i18n/languages.test.ts`

Без этой правки португалец после редиректа на `/en/` увидит баннер, предлагающий ему **русский**: у `LanguageBanner` своя копия `resolveLanguage`, `current='en'`, `preferred='ru'`, языки не совпали — баннер честно сработает.

- [ ] **Step 1: Написать падающий тест**

Дописать в `src/i18n/languages.test.ts` внутрь `describe('resolveLanguage')`:

```ts
  it('незнакомый язык уводит в английский', () => {
    expect(resolveLanguage('pt')).toBe(VISITOR_FALLBACK);
    expect(resolveLanguage('ja-JP')).toBe('en');
  });
```

и дополнить импорт файла именем `VISITOR_FALLBACK`.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm vitest run src/i18n/languages.test.ts`
Expected: FAIL — `VISITOR_FALLBACK` не экспортируется.

- [ ] **Step 3: Реализовать**

В `src/i18n/languages.ts` дописать константу и поправить функцию:

```ts
/**
 * Язык для посетителя, чьей локали у нас нет. Не DEFAULT_LANGUAGE: у русского
 * здесь другая роль — канонический корень сайта и источник переводов.
 */
export const VISITOR_FALLBACK = 'en';

export function resolveLanguage(raw?: string | null): string {
  if (!raw) return VISITOR_FALLBACK;
  const root = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(root) ? root : VISITOR_FALLBACK;
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `pnpm vitest run src/i18n/languages.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/i18n/languages.ts src/i18n/languages.test.ts
git commit -m "fix(i18n): незнакомая локаль ведёт в английский"
```

## Task 5: чистая логика выбора языка посетителя

**Files:**
- Create: `scripts/visitor-redirect.js`
- Test: `scripts/visitor-redirect.test.mjs`

- [ ] **Step 1: Написать падающий тест**

Создать `scripts/visitor-redirect.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { pickRedirect, snippetSource } from './visitor-redirect.js';

const PUBLISHED = ['ru', 'en', 'es', 'de', 'fr', 'zh'];
const base = {
  pathname: '/',
  languages: ['ru-RU'],
  stored: null,
  userAgent: 'Mozilla/5.0',
  published: PUBLISHED,
  canonical: 'ru',
};
const pick = (over) => pickRedirect({ ...base, ...over });

describe('pickRedirect', () => {
  it('уводит англичанина с корня на /en/', () => {
    expect(pick({ languages: ['en-US'] })).toBe('/en/');
  });

  it('схлопывает региональный вариант', () => {
    expect(pick({ languages: ['es-MX'] })).toBe('/es/');
    expect(pick({ languages: ['zh-Hans-CN'] })).toBe('/zh/');
  });

  it('русского оставляет на корне', () => {
    expect(pick({ languages: ['ru-RU'] })).toBeNull();
  });

  it('незнакомую локаль уводит в английский', () => {
    expect(pick({ languages: ['pt-BR'] })).toBe('/en/');
    expect(pick({ languages: ['ja-JP'] })).toBe('/en/');
  });

  it('берёт первый выпущенный язык из списка предпочтений', () => {
    // Португалец, у которого вторым стоит русский, русский и получает:
    // он сам объявил его приемлемым.
    expect(pick({ languages: ['pt-BR', 'ru'] })).toBeNull();
    expect(pick({ languages: ['pt-BR', 'de'] })).toBe('/de/');
  });

  it('молчит везде, кроме канонического корня', () => {
    expect(pick({ pathname: '/en/', languages: ['de-DE'] })).toBeNull();
    expect(pick({ pathname: '/es/', languages: ['de-DE'] })).toBeNull();
    expect(pick({ pathname: '/index.html', languages: ['de-DE'] })).toBe('/de/');
  });

  it('уважает явный выбор языка', () => {
    expect(pick({ languages: ['en-US'], stored: 'ru' })).toBeNull();
  });

  it('не трогает краулеров — корень остаётся каноническим русским', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; YandexBot/3.0)',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
    ]) {
      expect(pick({ languages: ['en-US'], userAgent: ua })).toBeNull();
    }
  });

  it('не предлагает невыпущенный язык', () => {
    expect(pick({ languages: ['zh-CN'], published: ['ru', 'en'] })).toBe('/en/');
  });

  it('пустой список языков уводит в английский', () => {
    // navigator.languages пуст — про посетителя не известно ничего,
    // международный дефолт лучше кириллицы.
    expect(pick({ languages: [] })).toBe('/en/');
  });
});

describe('snippetSource', () => {
  it('несёт в себе исходник pickRedirect и список выпущенных языков', () => {
    const src = snippetSource(PUBLISHED, 'ru');
    expect(src).toContain('pickRedirect');
    expect(src).toContain('"en"');
    expect(src).toContain('location.replace');
    expect(src).toContain('ll_lang_choice');
  });

  it('исполняется как валидный JS и уводит англичанина', () => {
    const replaced = [];
    const fakeWindow = {
      location: { pathname: '/', search: '', hash: '', replace: (u) => replaced.push(u) },
      localStorage: { getItem: () => null },
      navigator: { languages: ['en-US'], language: 'en-US', userAgent: 'Mozilla/5.0' },
    };
    const run = new Function('location', 'localStorage', 'navigator', snippetSource(PUBLISHED, 'ru'));
    run(fakeWindow.location, fakeWindow.localStorage, fakeWindow.navigator);
    expect(replaced).toEqual(['/en/']);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `pnpm vitest run scripts/visitor-redirect.test.mjs`
Expected: FAIL — файла `scripts/visitor-redirect.js` нет.

- [ ] **Step 3: Реализовать**

Создать `scripts/visitor-redirect.js`:

```js
/**
 * Куда увести посетителя с канонического русского корня.
 *
 * ВАЖНО: pickRedirect обязана быть самодостаточной — ни импортов, ни
 * замыканий, ни синтаксиса, который не переживёт вставку строкой. Её
 * исходник целиком уезжает в <head> через snippetSource(), поэтому
 * проверяемый код и отгружаемый код — физически один и тот же.
 *
 * Почему редирект, а не только баннер: баннер видят не все и не сразу, а
 * англоязычный посетитель на русской странице уходит за секунды. Почему при
 * этом краулеры исключены: автоматический редирект по языку уводит бота с
 * канонического корня, и русская версия теряет позиции.
 */
export function pickRedirect(input) {
  var pathname = input.pathname;
  var languages = input.languages || [];
  var stored = input.stored;
  var userAgent = input.userAgent || '';
  var published = input.published || [];
  var canonical = input.canonical;

  // Только канонический корень. Тот же HTML лежит в /en/index.html и остальных
  // языковых каталогах — без этой проверки получилась бы петля.
  if (pathname !== '/' && pathname !== '/index.html') return null;

  // Явный выбор языка уважаем: русскоязычный человек с английской системой
  // должен уметь остаться на русском.
  if (stored) return null;

  // Краулеру отдаём канонический корень.
  if (/bot|crawl|spider|slurp|mediapartners/i.test(userAgent)) return null;

  var picked = null;
  for (var i = 0; i < languages.length; i++) {
    var root = String(languages[i]).toLowerCase().split(/[-_]/)[0];
    if (published.indexOf(root) !== -1) {
      picked = root;
      break;
    }
  }

  // Ни один язык браузера не выпущен — английский как международный дефолт.
  if (!picked) picked = published.indexOf('en') !== -1 ? 'en' : canonical;

  if (picked === canonical) return null;
  return '/' + picked + '/';
}

/**
 * Исходник inline-скрипта для <head>. Список выпущенных языков подставляется
 * на сборке из scripts/translated-languages.js — того же источника, из
 * которого строятся пререндер, hreflang и sitemap.
 */
export function snippetSource(published, canonical) {
  return (
    '(function(){try{' +
    'var pick=' + pickRedirect.toString() + ';' +
    'var stored=null;try{stored=localStorage.getItem("ll_lang_choice")}catch(e){}' +
    'var langs=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language];' +
    'var target=pick({pathname:location.pathname,languages:langs,stored:stored,' +
    'userAgent:navigator.userAgent,published:' + JSON.stringify(published) + ',' +
    'canonical:' + JSON.stringify(canonical) + '});' +
    'if(target)location.replace(target+location.search+location.hash);' +
    '}catch(e){}})();'
  );
}
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `pnpm vitest run scripts/visitor-redirect.test.mjs`
Expected: PASS все блоки.

- [ ] **Step 5: Сломать нарочно**

Убрать в `pickRedirect` строку с проверкой краулера и прогнать снова.
Expected: FAIL на «не трогает краулеров». Вернуть строку, убедиться в PASS.

- [ ] **Step 6: Коммит**

```bash
git add scripts/visitor-redirect.js scripts/visitor-redirect.test.mjs
git commit -m "feat(i18n): логика выбора языковой версии для посетителя"
```

## Task 6: вставка скрипта в `<head>`

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Добавить плагин**

Заменить содержимое `vite.config.ts` на:

```ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { translatedCodes } from './scripts/translated-languages.js';
import { snippetSource } from './scripts/visitor-redirect.js';
import { DEFAULT_LANGUAGE } from './src/i18n/languages.data.js';

/**
 * Уводит посетителя с канонического русского корня на его языковую версию.
 * Скрипт стоит первым в <head> и выполняется до бандла — иначе посетитель
 * успевает увидеть кадр русской страницы. Логика и её тесты живут в
 * scripts/visitor-redirect.js.
 */
function visitorLanguageRedirect(): Plugin {
  return {
    name: 'visitor-language-redirect',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { 'data-visitor-redirect': '' },
          children: snippetSource(translatedCodes(), DEFAULT_LANGUAGE),
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), visitorLanguageRedirect()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  define: {
    // Переключатель языков и баннер работают в браузере и не могут заглянуть
    // в файлы локалей, а грузить все шесть ради проверки непустоты — значит
    // похоронить ленивую загрузку, ради которой локали и нарезаны на чанки.
    // Поэтому список считается на сборке и подставляется в бандл литералом.
    // См. scripts/translated-languages.js и src/i18n/translatedLanguages.ts.
    __TRANSLATED_LANGUAGES__: JSON.stringify(translatedCodes()),
  },
});
```

- [ ] **Step 2: Собрать и проверить, что скрипт доехал во все языковые версии**

Run: `pnpm build`
Expected: сборка проходит, включая `prerender.mjs`.

Run: `grep -c "data-visitor-redirect" dist/index.html dist/en/index.html dist/de/index.html`
Expected: по единице в каждом файле. Ноль в языковых каталогах означает, что пререндер потерял скрипт; больше единицы — что он продублировал head.

- [ ] **Step 3: Проверить, что пререндер не сломался**

Run: `grep -c 'rel="canonical"' dist/index.html dist/en/index.html`
Expected: ровно по единице. Пререндер делает девять подстановок по шаблону и падает при повторном прогоне — этот счётчик ловит случай, когда вставка скрипта сдвинула шаблон.

- [ ] **Step 4: Коммит**

```bash
git add vite.config.ts
git commit -m "feat(i18n): авторедирект с корня на языковую версию посетителя"
```

## Task 7: запоминание явного выбора языка

**Files:**
- Modify: `src/components/ui/LangSwitcher.tsx:130-150`
- Modify: `src/components/ui/LanguageBanner.tsx:7`

- [ ] **Step 1: Общий ключ и запись в переключателе**

В `src/components/ui/LangSwitcher.tsx` добавить рядом с `VIEWPORT_MARGIN`:

```ts
// Явный выбор языка. Читает его inline-скрипт из <head>
// (scripts/visitor-redirect.js): выбравшего больше не уводит автоматика.
const CHOICE_KEY = 'll_lang_choice';

function rememberChoice(code: string) {
  try {
    localStorage.setItem(CHOICE_KEY, code);
  } catch {
    /* приватный режим — переход всё равно состоится, просто не запомнится */
  }
}
```

И повесить запись на клик по пункту списка — в элементе `<a>` внутри `TRANSLATED_LANGUAGES.map` добавить атрибут:

```tsx
                  onClick={() => rememberChoice(lang.code)}
```

- [ ] **Step 2: То же в баннере**

В `src/components/ui/LanguageBanner.tsx` добавить рядом с `DISMISS_KEY`:

```ts
const CHOICE_KEY = 'll_lang_choice';
```

и в ссылке предложения добавить обработчик:

```tsx
        onClick={() => {
          // Переход по баннеру — такой же явный выбор, как и в переключателе.
          try { localStorage.setItem(CHOICE_KEY, offer.lang.code); } catch { /* приватный режим */ }
        }}
```

- [ ] **Step 3: Проверить типы и сборку**

Run: `pnpm typecheck && pnpm build`
Expected: обе команды без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add src/components/ui/LangSwitcher.tsx src/components/ui/LanguageBanner.tsx
git commit -m "feat(i18n): явный выбор языка отключает авторедирект"
```

## Task 8: Playwright по локалям

**Files:**
- Create: `tests/locale-redirect.spec.ts`

- [ ] **Step 1: Написать тест**

Создать `tests/locale-redirect.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { translatedCodes } from '../scripts/translated-languages.js';

const PUBLISHED = translatedCodes();

/**
 * Проверяем поведение в настоящем браузере с настоящей локалью: playwright
 * ставит navigator.language и navigator.languages из опции locale.
 */
test.describe('авторедирект по локали браузера', () => {
  test('англичанин с корня уезжает на /en/', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await ctx.close();
  });

  test('незнакомая локаль уезжает на английский, а не остаётся на русском', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
    await ctx.close();
  });

  test('русский остаётся на корне', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'ru-RU' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await ctx.close();
  });

  test('явный выбор языка отменяет редирект', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('ll_lang_choice', 'ru'));
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await ctx.close();
  });

  test('краулер видит канонический русский корень', async ({ browser }) => {
    const ctx = await browser.newContext({
      locale: 'en-US',
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await ctx.close();
  });

  test('заход сразу на языковую версию не редиректит и не зацикливается', async ({ browser }) => {
    for (const code of PUBLISHED.filter((c) => c !== 'ru')) {
      const ctx = await browser.newContext({ locale: 'de-DE' });
      const page = await ctx.newPage();
      await page.goto(`/${code}/`);
      await expect(page).toHaveURL(new RegExp(`/${code}/$`));
      await ctx.close();
    }
  });

  test('португалец на /en/ не получает баннер с предложением русского', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
    // Баннер сравнивает язык страницы с языком браузера: если фолбэк остался
    // русским, здесь всплывёт предложение «Русский».
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="lang-banner-link"]')).toHaveCount(0);
    await ctx.close();
  });
});
```

- [ ] **Step 2: Запустить**

Run: `pnpm test tests/locale-redirect.spec.ts`
Expected: PASS все семь. Playwright сам поднимет `pnpm build && pnpm preview --port 4173`.

- [ ] **Step 3: Сломать нарочно**

Временно убрать `visitorLanguageRedirect()` из списка плагинов в `vite.config.ts`, удалить `dist/` и прогнать тот же набор.
Expected: FAIL на первых двух тестах (`/` вместо `/en/`), PASS на «русский остаётся» и «краулер». Именно такое распределение доказывает, что тесты меряют редирект, а не совпадение. Вернуть плагин, убедиться в полном PASS.

- [ ] **Step 4: Прогнать весь набор лендинга**

Run: `pnpm test:unit && pnpm test`
Expected: PASS целиком, включая существующие `tests/i18n.spec.ts` и `tests/smoke.spec.ts`.

- [ ] **Step 5: Коммит**

```bash
git add tests/locale-redirect.spec.ts
git commit -m "test(i18n): сценарии авторедиректа по локали браузера"
```

---

# Часть C. Бэк `spirits_back`

Все команды из `/Users/dmitry/Downloads/spirits_back`.

## Task 9: язык из запроса как подстраховка

**Files:**
- Modify: `src/common/services/language.service.ts:45-58`
- Test: `src/chat/chat.language.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Дописать в конец `src/chat/chat.language.spec.ts`:

```ts
describe('resolveUserLanguage — приоритет профиля и подсказки из запроса', () => {
  const svcWith = (language: string | null) =>
    new LanguageService({ query: async () => ({ rows: [{ language }] }) } as any);

  it('язык профиля побеждает подсказку из запроса', async () => {
    // Профиль — явный выбор пользователя, синхронный между устройствами и
    // мобильным приложением. Запрос не должен его перебивать.
    expect(await svcWith('es').resolveUserLanguage('u1', 'de')).toBe('es');
  });

  it('пустой профиль закрывается подсказкой из запроса', async () => {
    // Ровно случай новорега: AuthContext пишет язык в профиль без await, и
    // первое сообщение успевает уйти раньше записи.
    expect(await svcWith(null).resolveUserLanguage('u2', 'de')).toBe('de');
  });

  it('подсказка схлопывается до корня и проверяется по списку', async () => {
    expect(await svcWith(null).resolveUserLanguage('u3', 'es-MX')).toBe('es');
    expect(await svcWith(null).resolveUserLanguage('u4', 'pt-BR')).toBe('ru');
  });

  it('нет ни профиля, ни подсказки — русский', async () => {
    expect(await svcWith(null).resolveUserLanguage('u5')).toBe('ru');
  });

  it('падение базы не роняет ответ', async () => {
    const svc = new LanguageService({
      query: async () => { throw new Error('db down'); },
    } as any);
    expect(await svc.resolveUserLanguage('u6', 'de')).toBe('ru');
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx jest src/chat/chat.language.spec.ts`
Expected: FAIL на «пустой профиль закрывается подсказкой» — сейчас метод принимает один аргумент и вернёт `ru`.

- [ ] **Step 3: Реализовать**

В `src/common/services/language.service.ts` заменить метод `resolveUserLanguage` на:

```ts
  /**
   * Язык из profile_data. Фолбэк — русский, в том числе при ошибке БД.
   *
   * requestHint — язык интерфейса, который фронт кладёт в тело чат-запроса.
   * Он используется ТОЛЬКО когда в профиле языка нет: профиль это явный выбор
   * пользователя, синхронный между вебом и мобильным приложением, и запрос его
   * не перебивает. Подсказка закрывает две дыры: гонку у новорега (язык
   * пишется в профиль без await) и профили, заведённые до мультиязычности —
   * на 2026-08-09 таких на проде 158 из 174.
   */
  async resolveUserLanguage(userId: string, requestHint?: string | null): Promise<string> {
    try {
      const res = await this.pg.query(
        `SELECT profile_data->>'language' AS language
           FROM ai_profiles_consolidated
          WHERE user_id = $1
          LIMIT 1`,
        [userId],
      );
      const stored = res.rows[0]?.language;
      if (stored) return LanguageService.normalize(stored);
      return LanguageService.normalize(requestHint);
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }
```

- [ ] **Step 4: Запустить, убедиться что проходит**

Run: `npx jest src/chat/chat.language.spec.ts`
Expected: PASS все блоки, включая старые про `buildDirective`.

- [ ] **Step 5: Коммит**

```bash
git add src/common/services/language.service.ts src/chat/chat.language.spec.ts
git commit -m "feat(chat): язык из запроса закрывает пустой профиль"
```

## Task 10: прокинуть `lang` от контроллера до директивы

**Files:**
- Modify: `src/chat/chat.controller.ts:43-49,64-75`
- Modify: `src/chat/chat.service.ts:212-224,337-345,357,600-614,683`

- [ ] **Step 1: Прочитать поле в контроллере**

В `src/chat/chat.controller.ts` после строки `const sessionId = body.sessionId;` добавить:

```ts
    // Язык интерфейса. Фронт шлёт его в каждом чат-запросе
    // (ChatInterface.tsx), но до 2026-08-09 бэк поле не читал вовсе.
    // Используется только как подстраховка при пустом языке в профиле —
    // приоритет разбирается в LanguageService.resolveUserLanguage.
    const requestLang = typeof body.lang === 'string' ? body.lang : undefined;
```

И передать его в вызов `this.chatService.streamChat(...)` последним аргументом, после `fresh`:

```ts
        fresh,
        requestLang,
      );
```

- [ ] **Step 2: Принять параметр в сервисе**

В `src/chat/chat.service.ts` в сигнатуре `streamChat` после `fresh: boolean = false,` добавить:

```ts
    // Язык интерфейса из тела запроса — подсказка на случай пустого профиля.
    requestLang?: string,
```

- [ ] **Step 3: Пробросить в оба пути**

В вызове `this.streamUniversalAgent(...)` (около строки 343) добавить `requestLang` последним аргументом:

```ts
        req, fresh, chatSessionId, requestLang,
      );
```

В строке 357 (путь Маши) заменить вызов на:

```ts
    const userLanguage = await this.language.resolveUserLanguage(userId, requestLang);
```

В сигнатуре `streamUniversalAgent` (около строки 613) после `freshSessionId?: string,` добавить:

```ts
    requestLang?: string,
```

В строке 683 заменить вызов на:

```ts
    const userLanguage = await this.language.resolveUserLanguage(userId, requestLang);
```

- [ ] **Step 4: Проверить, что ничего не забыто**

Run: `grep -n "resolveUserLanguage" src/chat/chat.service.ts`
Expected: три вызова. Два — с `requestLang` (строки в `streamChat` и `streamUniversalAgent`), третий в `generateAgentReply` остаётся без него намеренно: это путь рутин и телеграм-ботов, там запроса от браузера нет.

- [ ] **Step 5: Собрать и прогнать весь набор**

Run: `pnpm build && npx jest`
Expected: сборка без ошибок TypeScript, все существующие spec-файлы зелёные. Особое внимание к `chat.service.speech-marker.spec.ts` и `chat.service.usage-billing.spec.ts` — они мокают `resolveUserLanguage` и падут, если сигнатура разъехалась.

- [ ] **Step 6: Коммит**

```bash
git add src/chat/chat.controller.ts src/chat/chat.service.ts
git commit -m "feat(chat): бэк читает lang из тела запроса"
```

---

# Часть D. Сквозная проверка

## Task 11: e2e-проверка языка ответа ассистента

**Files:**
- Create: `tests/assistant-language.e2e.mjs` (в `spirits_back`)

- [ ] **Step 1: Создать скрипт**

Создать `tests/assistant-language.e2e.mjs`:

```js
/**
 * Отвечает ли ассистент на языке профиля. Запускается вручную:
 *   node tests/assistant-language.e2e.mjs
 *
 * В общий runner не заведён намеренно: каждый прогон это четыре настоящих
 * хода к модели, то есть расход ёмкости подписки.
 *
 * Две вещи, без которых прогон врёт:
 *  1. Реплика НЕЙТРАЛЬНАЯ ("ok"). На реплике по-немецки немецкий ответ ничего
 *     не доказывает: директива и без языка профиля велит отвечать на языке
 *     последнего сообщения.
 *  2. Реплики РАЗНЫЕ в каждом прогоне. Дедупликация ловит одинаковый текст в
 *     течение 12 секунд и отвечает заглушкой по-русски — выглядит в точности
 *     как «ассистент игнорирует язык профиля».
 * Русский прогон в конце — контроль: без него набор не отличает «работает»
 * от «всегда отвечает по-русски». Он же возвращает аккаунт в исходное
 * состояние.
 */
const BASE = process.env.BASE_URL || 'https://my.linkeon.io';
const PHONE = process.env.TEST_PHONE || '70000000000';
const SMS_WH = '898c938d-f094-455c-86af-969617e62f7a';
const CHECK_WH = 'a376a8ed-3bf7-4f23-aaa5-236eea72871b';
const ASSISTANT = '1'; // Миша — обычный путь через r.linkeon.io

const PROBES = { de: 'ok?', zh: 'ok :)', en: 'ok!', ru: 'ok.' };
const EXPECT = {
  de: /\b(ich|dein|dir|und|kann)\b/i,
  zh: /[一-鿿]/,
  en: /\b(the|you|your|and|can)\b/i,
  ru: /[Ѐ-ӿ]/,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  await fetch(`${BASE}/webhook/${SMS_WH}/sms/${PHONE}`);
  await sleep(1200);
  const code = await (await fetch(`${BASE}/webhook/debug/sms-code/${PHONE}`)).json();
  if (!code.code) throw new Error('нет debug-кода: ' + JSON.stringify(code));
  const r = await (await fetch(`${BASE}/webhook/${CHECK_WH}/check-code/${PHONE}/${code.code}`)).json();
  if (!r['access-token']) throw new Error('логин не прошёл: ' + JSON.stringify(r));
  return r['access-token'];
}

async function ask(token, message) {
  const res = await fetch(`${BASE}/webhook/soulmate/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, assistantId: ASSISTANT, fresh: true, freshTs: String(Date.now()) }),
    signal: AbortSignal.timeout(240000),
  });
  let full = '';
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'end' && typeof ev.content === 'string') full = ev.content;
    } catch { /* не-JSON строка стрима */ }
  }
  return full.trim();
}

const token = await login();
let failed = 0;

for (const lang of ['de', 'zh', 'en', 'ru']) {
  await fetch(`${BASE}/webhook/profile-update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: lang }),
  });
  await sleep(500);
  const reply = await ask(token, PROBES[lang]);
  const ok = EXPECT[lang].test(reply);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} профиль=${lang}: ${reply.slice(0, 90).replace(/\s+/g, ' ')}`);
  await sleep(2000);
}

console.log(failed === 0 ? '\nВсе четыре прогона зелёные' : `\n${failed} прогонов красные`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Прогнать**

Run: `node tests/assistant-language.e2e.mjs`
Expected: четыре строки PASS и `Все четыре прогона зелёные`. Прогон занимает 2–4 минуты: каждый ход идёт к настоящей модели.

- [ ] **Step 3: Сломать нарочно**

Временно заменить в `EXPECT` регулярку для `de` на `/[Ѐ-ӿ]/` и прогнать снова.
Expected: FAIL на немецком, PASS на остальных. Вернуть регулярку.

- [ ] **Step 4: Коммит**

```bash
git add tests/assistant-language.e2e.mjs
git commit -m "test(chat): сквозная проверка языка ответа ассистента"
```

---

# Выкатка

Отдельное решение, не часть реализации: **не запускать без явного согласия владельца.**

- `spirits_front` и `spirits_back` — только `bash ~/Downloads/spirits_back/scripts/deploy.sh` без флагов, двухфазно: test → smoke → prod → smoke.
- `land_linkeon` — отдельный репозиторий. На проде развёрнут как git-чекаут ветки `main` в `/home/dvolkov/land_linkeon` с установленными `node_modules`; nginx отдаёт `dist/` (`/etc/nginx/sites-enabled/spirits:59`). Точную процедуру выката подтвердить у владельца перед первым применением — в репозитории её описания нет.
- После выката лендинга проверить вживую: `curl -s -H 'Accept-Language: en-US' https://linkeon.io/ | grep -c data-visitor-redirect` должен вернуть 1, а браузер с английской локалью — уехать на `/en/`.
