# Пересборка экрана входа — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести экран входа к одной визуальной системе и перекомпоновать его так, чтобы форма была рабочей с первой секунды, а вход по почте — приоритетным.

**Architecture:** Вводятся три общих примитива (`controlStyles`, `Button`, `TextField`) и модуль знаков провайдеров; все компоненты онбординга переводятся на них. Вкладки Email/SMS заменяются моделью «одна основная форма + кнопка переключения». Форма уезжает в карточку на градиенте, согласие встаёт вплотную к главной кнопке.

**Tech Stack:** React 18, TypeScript 5, Tailwind CSS 3, lucide-react, react-hot-toast, i18next, Vitest (node-окружение), Playwright (в `spirits_back/tests/`).

**Спека:** `docs/superpowers/specs/2026-08-07-login-screen-redesign-design.md`

---

## Порядок и почему он такой

Сначала характеризующие Playwright-тесты (Задача 1) — они фиксируют поведение ДО правок и должны остаться зелёными после. Потом примитивы снизу вверх (2–4), потом перевод компонентов на них (5–9), потом перекомпоновка (10–11), потом локали и финальная проверка (12–13).

**Важно про окружение тестов.** `vitest.config.ts` задаёт `environment: 'node'` — рендерить React в юнит-тестах нельзя. Поэтому вся логика классов живёт в чистом `controlStyles.ts` и тестируется там, а поведение проверяется Playwright.

## Структура файлов

**Создаются:**

| Файл | Ответственность |
|---|---|
| `src/components/ui/controlStyles.ts` | Чистые функции классов: единственный источник правды про высоту, радиус, фокус, варианты |
| `src/components/ui/controlStyles.test.ts` | Тесты этих функций |
| `src/components/ui/Button.tsx` | Тонкая обёртка: варианты, `loading`, слот значка |
| `src/components/ui/TextField.tsx` | Тонкая обёртка: лейбл, поле, ошибка, слот префикса |
| `src/components/onboarding/providerMarks.tsx` | Знаки Yandex / Google / Taler ID в одинаковых слотах |
| `~/Downloads/spirits_back/tests/playwright/login-ui.spec.js` | Playwright по экрану входа |

**Изменяются:**

| Файл | Что меняется |
|---|---|
| `src/pages/OnboardingPage.tsx` | Шапка, карточка, атмосфера фона, появление, пилюли языка и подарка |
| `src/components/onboarding/LoginTabs.tsx` | Вкладки → основная форма + переключение; место согласия; снятие `opacity-40` |
| `src/components/onboarding/LoginConsentBlock.tsx` | Компактная строка вместо серой карточки |
| `src/components/onboarding/OAuthButton.tsx` | На `Button` + `providerMarks`, `alert()` → `toast` |
| `src/components/onboarding/EmailLoginPane.tsx` | На `TextField` + `Button` |
| `src/components/onboarding/SmsLoginPane.tsx` | `alert()` → `toast`, проброс переключения формы |
| `src/components/onboarding/PhoneInput.tsx` | На `TextField` + `Button`, убрать `ArrowRight` |
| `src/components/onboarding/OTPInput.tsx` | Ячейки и кнопки в систему |
| `src/components/settings/LanguageSelect.tsx` | Пропсы `variant` и `showFlag` |
| `src/i18n/locales/{ru,en,es,de,fr,zh}.json` | Минус `auth.consent.needToAccept`, плюс подписи переключения |
| `src/index.css` | Зерно фона и `prefers-reduced-motion` |

---

### Task 1: Характеризующие Playwright-тесты по экрану входа

Пишутся ПЕРВЫМИ и должны быть зелёными на текущей разметке. Их задача — доказать, что пересборка ничего не сломала.

**Files:**
- Create: `~/Downloads/spirits_back/tests/playwright/login-ui.spec.js`

- [ ] **Step 1: Посмотреть, как устроены существующие спеки**

Read: `~/Downloads/spirits_back/tests/playwright/smoke.spec.js` — оттуда берутся `applyBasicAuth`, `getJwt`, `BASE`, `TEST_PHONE` и конфиг.

Read: `~/Downloads/spirits_back/tests/playwright/playwright.config.js` — базовый URL и как передаётся окружение.

- [ ] **Step 2: Написать характеризующие тесты**

Create `~/Downloads/spirits_back/tests/playwright/login-ui.spec.js`:

```js
// Тесты САМОГО экрана входа. Существующий smoke.spec.js логинится в обход
// интерфейса (подсаживает токены в localStorage), поэтому до 2026-08-07
// экран входа не был покрыт ничем — и баг с переполненным localStorage,
// из-за которого верный код показывался как «Неверный код», прожил на проде
// незамеченным. Здесь интерфейс проходится по-настоящему.
const { test, expect } = require('@playwright/test');
const axios = require('axios');

// Адрес СТРАНИЦЫ задаётся playwright.config.js через BASE_URL (не SMOKE_BASE_URL).
// Для локального прогона: pnpm build && pnpm preview --port 4173,
// затем BASE_URL=http://localhost:4173 npx playwright test.
//
// Адрес API — всегда прод и НЕ совпадает с адресом страницы: локальная сборка
// собрана с VITE_BACKEND_URL=https://my.linkeon.io и ходит туда же.
const API_BASE = process.env.API_BASE || 'https://my.linkeon.io';
const TEST_PHONE = '79030169187';
const NATIONAL = '9030169187';

/**
 * Basic Auth для test.linkeon.io — ТОЛЬКО через page.route().
 *
 * setExtraHTTPHeaders здесь использовать нельзя: заголовок применяется ко ВСЕМ
 * запросам, включая fetch() из скриптов страницы, и перебивает
 * Authorization: Bearer — API отдаёт 401 и разлогинивает. Это описано в
 * playwright.config.js и уже один раз ломало smoke. Копируем рабочую
 * реализацию из smoke.spec.js, а не пишем свою.
 */
async function applyBasicAuth(page) {
  const user = process.env.TEST_BASIC_USER;
  const pass = process.env.TEST_BASIC_PASS;
  if (!user || !pass) return;
  const basic = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  await page.route('**/*', (route) => {
    const headers = route.request().headers();
    if (headers.authorization) return route.continue();
    return route.continue({ headers: { ...headers, authorization: basic } });
  });
}

/** Свежий код из Redis. На тестовые номера реальная SMS не уходит by design. */
async function debugCode() {
  const r = await axios.get(`${API_BASE}/webhook/debug/sms-code/${TEST_PHONE}`);
  return r.data.code;
}

async function openLogin(page) {
  await applyBasicAuth(page);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('i18nextLng', 'ru');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('onboarding-root')).toBeVisible({ timeout: 20000 });
}

/** Забить localStorage до квоты legacy-ключами истории чатов. */
async function fillStorage(page) {
  await page.evaluate(() => {
    const chunk = 'x'.repeat(256 * 1024);
    try { for (let i = 0; i < 200; i++) localStorage.setItem('chat_messages_assistant_' + i, chunk); } catch {}
    for (const size of [65536, 8192, 1024, 128, 16, 1]) {
      const c = 'y'.repeat(size);
      for (let i = 0; i < 5000; i++) {
        try { localStorage.setItem('chat_messages_assistant_p' + size + '_' + i, c); } catch { break; }
      }
    }
  });
}

test.describe('экран входа', () => {
  test('полный вход по SMS через интерфейс', async ({ page }) => {
    await openLogin(page);
    await page.getByTestId('consent-checkbox').check();
    await page.getByTestId('switch-to-phone').click();
    await page.getByTestId('phone-input').fill(NATIONAL);
    await page.getByTestId('phone-submit-btn').click();
    await expect(page.getByTestId('otp-input-0')).toBeVisible({ timeout: 15000 });

    const code = await debugCode();
    await page.getByTestId('otp-input-0').pressSequentially(code);
    await page.waitForURL('**/chat', { timeout: 20000 });
    expect(page.url()).toContain('/chat');
  });

  test('РЕГРЕССИЯ: вход проходит при забитом localStorage', async ({ page }) => {
    // Инцидент 2026-08-07: QuotaExceededError на записи authToken выдавался
    // за «Неверный код», сервер код при этом уже гасил.
    await openLogin(page);
    await page.getByTestId('consent-checkbox').check();
    await page.getByTestId('switch-to-phone').click();
    await page.getByTestId('phone-input').fill(NATIONAL);
    await page.getByTestId('phone-submit-btn').click();
    await expect(page.getByTestId('otp-input-0')).toBeVisible({ timeout: 15000 });

    await fillStorage(page);

    const code = await debugCode();
    await page.getByTestId('otp-input-0').pressSequentially(code);
    await page.waitForURL('**/chat', { timeout: 20000 });
    expect(await page.evaluate(() => !!localStorage.getItem('jwt_access_token'))).toBe(true);
  });

  test('запрос ссылки на почту доходит до экрана «проверь почту»', async ({ page }) => {
    await openLogin(page);
    await page.getByTestId('consent-checkbox').check();
    await page.getByTestId('email-input').fill(`claude.link+${Date.now()}@linkeon.io`);
    await page.getByTestId('email-submit-btn').click();
    await expect(page.locator('body')).toContainText(/Проверь почту|Проверьте почту/, { timeout: 15000 });
  });
});
```

- [ ] **Step 3: Добавить недостающие testid в текущую разметку, чтобы тесты стали проходимы**

Тесты используют `switch-to-phone`, `email-input`, `email-submit-btn`, которых на текущем экране нет. Добавить их к СУЩЕСТВУЮЩИМ элементам, ничего не переставляя:

В `src/components/onboarding/LoginTabs.tsx` на кнопку вкладки SMS:

```tsx
<button
  key={tabDef.key}
  data-testid={tabDef.key === 'sms' ? 'switch-to-phone' : 'switch-to-email'}
  onClick={() => setTab(tabDef.key)}
```

В `src/components/onboarding/EmailLoginPane.tsx` на поле и кнопку:

```tsx
<input
  type="email"
  data-testid="email-input"
  ...
/>
...
<button type="submit" data-testid="email-submit-btn" ...>
```

- [ ] **Step 4: Прогнать против ЛОКАЛЬНОЙ сборки — все три должны быть зелёными**

Playwright ходит по сети, а не по файлам, поэтому проверять правки надо на локальной сборке, иначе тест увидит прод, где их ещё нет.

Терминал 1:

```bash
cd ~/Downloads/spirits_front/.worktrees/login-redesign && pnpm build && pnpm preview --port 4173
```

Терминал 2:

```bash
cd ~/Downloads/spirits_back/.worktrees/login-redesign/tests
BASE_URL=http://localhost:4173 npx playwright test playwright/login-ui.spec.js --reporter=list
```

Ожидается: `3 passed`. Если что-то красное — чинить тест, а не продукт: они описывают поведение, которое уже есть.

> Тесты логинятся тестовым номером `79030169187` в БОЕВОЙ бэкенд: локально поднимается только статика фронта, API всегда прод. Это тот же номер, которым ходит smoke, реальная SMS на него не уходит.

- [ ] **Step 5: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/components/onboarding/LoginTabs.tsx src/components/onboarding/EmailLoginPane.tsx
git commit -m "test(auth): testid для экрана входа под Playwright"
cd ~/Downloads/spirits_back
git add tests/playwright/login-ui.spec.js
git commit -m "test(auth): Playwright по самому экрану входа, а не в обход него"
```

---

### Task 2: Модуль классов `controlStyles`

**Files:**
- Create: `src/components/ui/controlStyles.ts`
- Test: `src/components/ui/controlStyles.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `src/components/ui/controlStyles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buttonClasses, fieldClasses, CONTROL_HEIGHT, CONTROL_RADIUS } from './controlStyles';

describe('buttonClasses', () => {
  it('все варианты одного роста и радиуса', () => {
    for (const v of ['primary', 'secondary', 'ghost'] as const) {
      expect(buttonClasses(v)).toContain(CONTROL_HEIGHT);
      expect(buttonClasses(v)).toContain(CONTROL_RADIUS);
    }
  });

  it('РЕГРЕССИЯ: ни у одного варианта нет собственной тени', () => {
    // Раньше тень висела ровно на одной кнопке из трёх — на отправке кода.
    for (const v of ['primary', 'secondary', 'ghost'] as const) {
      expect(buttonClasses(v)).not.toMatch(/\bshadow-(sm|md|lg|xl)\b/);
    }
  });

  it('варианты различимы по заливке', () => {
    expect(buttonClasses('primary')).toContain('bg-forest-800');
    expect(buttonClasses('secondary')).toContain('bg-white');
    expect(buttonClasses('ghost')).toContain('text-forest-800');
  });

  it('дополнительные классы приклеиваются в конец', () => {
    expect(buttonClasses('primary', 'mt-4')).toMatch(/mt-4$/);
  });
});

describe('fieldClasses', () => {
  it('совпадает с кнопкой по росту и радиусу', () => {
    expect(fieldClasses(false)).toContain(CONTROL_HEIGHT);
    expect(fieldClasses(false)).toContain(CONTROL_RADIUS);
  });

  it('ошибка меняет только цвет рамки', () => {
    expect(fieldClasses(true)).toContain('border-red-400');
    expect(fieldClasses(false)).toContain('border-gray-200');
  });
});
```

- [ ] **Step 2: Прогнать — должно упасть**

```bash
pnpm vitest run src/components/ui/controlStyles.test.ts
```

Ожидается: `Failed to load url ./controlStyles`.

- [ ] **Step 3: Написать модуль**

Create `src/components/ui/controlStyles.ts`:

```ts
/**
 * Единственный источник правды про геометрию элементов управления.
 *
 * Вынесено в чистый модуль, а не спрятано внутрь компонентов, потому что
 * vitest в проекте настроен на environment: 'node' — отрендерить React в
 * тесте нельзя. Так вся логика системы остаётся под тестами, а компоненты
 * остаются тонкими обёртками.
 *
 * До этого на экране входа сосуществовали три роста кнопок (py-2, py-3,
 * py-3 с тенью) и два роста полей с разным кеглем и разной толщиной
 * фокус-кольца.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** 44 px — минимальная комфортная цель нажатия на мобильном. */
export const CONTROL_HEIGHT = 'h-11';
export const CONTROL_RADIUS = 'rounded-xl';

const BUTTON_BASE = [
  'w-full inline-flex items-center justify-center gap-2',
  CONTROL_HEIGHT,
  CONTROL_RADIUS,
  'px-4 text-sm font-medium',
  'transition-colors duration-150',
  'active:scale-[0.99] motion-reduce:active:scale-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-700/40',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
].join(' ');

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-forest-800 text-white hover:bg-forest-900',
  secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
  ghost: 'bg-white border border-forest-200 text-forest-800 hover:bg-forest-50',
};

export function buttonClasses(variant: ButtonVariant, extra?: string): string {
  return [BUTTON_BASE, BUTTON_VARIANT[variant], extra].filter(Boolean).join(' ');
}

const FIELD_BASE = [
  'w-full bg-white',
  CONTROL_HEIGHT,
  CONTROL_RADIUS,
  'px-3.5 text-[15px] text-gray-900 placeholder:text-gray-400',
  'border transition-colors duration-150',
  'focus:outline-none focus:ring-2',
].join(' ');

export function fieldClasses(hasError: boolean, extra?: string): string {
  const state = hasError
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
    : 'border-gray-200 focus:border-forest-700 focus:ring-forest-700/20';
  return [FIELD_BASE, state, extra].filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Прогнать — должно пройти**

```bash
pnpm vitest run src/components/ui/controlStyles.test.ts
```

Ожидается: `8 passed`.

- [ ] **Step 5: Проверить, что тест не ложно-зелёный**

Временно добавить `shadow-md` в `BUTTON_VARIANT.primary`, прогнать снова — тест про тени обязан упасть. Вернуть как было.

- [ ] **Step 6: Коммит**

```bash
git add src/components/ui/controlStyles.ts src/components/ui/controlStyles.test.ts
git commit -m "feat(ui): единая геометрия кнопок и полей"
```

---

### Task 3: Компоненты `Button` и `TextField`

**Files:**
- Create: `src/components/ui/Button.tsx`, `src/components/ui/TextField.tsx`

- [ ] **Step 1: Написать `Button`**

Create `src/components/ui/Button.tsx`:

```tsx
import React from 'react';
import { Loader } from 'lucide-react';
import { buttonClasses, type ButtonVariant } from './controlStyles';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Значок слева в слоте фиксированного размера — чтобы подписи стояли по одной линии. */
  leading?: React.ReactNode;
}

/**
 * Тонкая обёртка над buttonClasses: своей логики нет, вся геометрия и
 * состояния — в controlStyles, где они покрыты тестами.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading = false,
  leading,
  disabled,
  className,
  children,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={buttonClasses(variant, className)}
  >
    {loading ? (
      <Loader className="w-4 h-4 animate-spin" aria-hidden />
    ) : (
      leading && <span className="w-[18px] h-[18px] shrink-0 flex items-center justify-center">{leading}</span>
    )}
    {children}
  </button>
);

export default Button;
```

- [ ] **Step 2: Написать `TextField`**

Create `src/components/ui/TextField.tsx`:

```tsx
import React, { useId } from 'react';
import { fieldClasses, CONTROL_HEIGHT, CONTROL_RADIUS } from './controlStyles';

// Omit<'prefix'> обязателен: в InputHTMLAttributes уже есть HTML-атрибут
// prefix?: string, и наш ReactNode с ним не сходится (TS2430).
interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  error?: string | null;
  /** Слот слева ВНУТРИ рамки — под выбор страны в поле телефона. */
  prefix?: React.ReactNode;
}

/**
 * Поле с лейблом и ошибкой. Ошибка всегда под полем и всегда одного цвета:
 * до этого на экране входа соседствовали text-red-500 и text-red-600, а часть
 * ошибок вообще уходила в системный alert().
 */
export const TextField: React.FC<TextFieldProps> = ({
  label, error, prefix, className, id, ...rest
}) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm text-gray-600 mb-1.5">
        {label}
      </label>

      {prefix ? (
        <div className={`flex items-stretch bg-white border ${CONTROL_RADIUS} ${CONTROL_HEIGHT} ${
          error ? 'border-red-400' : 'border-gray-200'
        } focus-within:ring-2 ${
          error ? 'focus-within:ring-red-500/20 focus-within:border-red-500'
                : 'focus-within:ring-forest-700/20 focus-within:border-forest-700'
        } transition-colors duration-150`}>
          {prefix}
          <input
            {...rest}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={`flex-1 min-w-0 bg-transparent px-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none ${className ?? ''}`}
          />
        </div>
      ) : (
        <input
          {...rest}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={fieldClasses(!!error, className)}
        />
      )}

      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
};

export default TextField;
```

- [ ] **Step 3: Проверить, что собирается**

```bash
pnpm typecheck && pnpm build
```

Ожидается: `pnpm typecheck` молча завершается с кодом 0, затем `✓ built in …`.

> **Только `pnpm typecheck`** (`tsc --noEmit -p tsconfig.app.json`). Голый `tsc --noEmit` в этом проекте — пустышка: корневой `tsconfig.json` это заглушка с `"files": []`, команда всегда возвращает 0 и не смотрит ни на один файл. `pnpm build` (vite) типы тоже не проверяет — он их просто стирает.
>
> В проекте есть 48 унаследованных ошибок типов (`ChatInterface`, `pushClient`, `VideoJobCard` и др.). Ориентир — не «ноль ошибок», а «мои файлы не добавили ни одной»: сравнивай вывод до и после своих правок.

- [ ] **Step 4: Коммит**

```bash
git add src/components/ui/Button.tsx src/components/ui/TextField.tsx
git commit -m "feat(ui): Button и TextField поверх общей геометрии"
```

---

### Task 4: Знаки провайдеров

**Files:**
- Create: `src/components/onboarding/providerMarks.tsx`

- [ ] **Step 1: Написать модуль**

Create `src/components/onboarding/providerMarks.tsx`:

```tsx
import React from 'react';
import type { OAuthProviderId } from '../../types/auth';

/**
 * Знаки провайдеров в ОДИНАКОВЫХ слотах 18×18.
 *
 * Единообразие даётся слотом, а не приведением самих знаков к одному виду:
 * логотип Google перекрашивать нельзя по его брендбуку. Раньше здесь
 * соседствовали красный квадрат с буквой «Я», белый квадрат с рамкой и
 * буквой «G» и растровый PNG — три разные природы значка в трёх соседних
 * кнопках.
 */

const SLOT = 'w-[18px] h-[18px] shrink-0';

const GOOGLE = (
  <svg viewBox="0 0 48 48" className={SLOT} aria-hidden focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 14 17.6 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
    <path fill="#FBBC05" d="M10.4 28.2c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16 0 19.9 0 23.5s.9 7.5 2.6 10.8l7.8-6.1z"/>
    <path fill="#34A853" d="M24 47c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.8 2.2-7.7 2.2-6.4 0-11.7-4.5-13.6-10.7l-7.8 6.1C6.5 41.1 14.6 47 24 47z"/>
  </svg>
);

const YANDEX = (
  <svg viewBox="0 0 24 24" className={SLOT} aria-hidden focusable="false">
    <rect width="24" height="24" rx="5" fill="#FC3F1D"/>
    <path fill="#fff" d="M13.1 19h2.2V5h-3.2c-3.2 0-5.1 1.7-5.1 4.4 0 2.1 1 3.3 2.8 4.6L6.7 19h2.4l3.4-5.2-1.1-.8C10 12 9.2 11.2 9.2 9.3c0-1.7 1.1-2.7 2.9-2.7h1v12.4z"/>
  </svg>
);

const TALERID = (
  <img src="/talerid-logo.png" alt="" loading="lazy" className={`${SLOT} rounded-[4px] object-contain`} />
);

const MARKS: Record<OAuthProviderId, React.ReactNode> = {
  google: GOOGLE,
  yandex: YANDEX,
  talerid: TALERID,
};

export function providerMark(provider: OAuthProviderId): React.ReactNode {
  return MARKS[provider];
}
```

- [ ] **Step 2: Проверить сборку**

```bash
pnpm typecheck && pnpm build
```

Ожидается: успешная сборка.

- [ ] **Step 3: Коммит**

```bash
git add src/components/onboarding/providerMarks.tsx
git commit -m "feat(auth): знаки провайдеров в одинаковых слотах"
```

---

### Task 5: `LanguageSelect` — вариант «пилюля»

**Files:**
- Modify: `src/components/settings/LanguageSelect.tsx`

- [ ] **Step 1: Добавить пропсы и разметку пилюли**

В `src/components/settings/LanguageSelect.tsx` заменить интерфейс и `return`:

```tsx
interface LanguageSelectProps {
  onChange?: (lang: string) => void;
  className?: string;
  /** 'pill' — компактный вид для экрана входа: поверх фона, со значком глобуса. */
  variant?: 'default' | 'pill';
  /** Флаг-эмодзи в подписях. На экране входа выключается: эмодзи выведены из системы иконок. */
  showFlag?: boolean;
}
```

В теле компонента, после `const current = ...`:

```tsx
  const options = SUPPORTED_LANGUAGES.map((lang) => (
    <option key={lang.code} value={lang.code}>
      {showFlag ? `${lang.flag} ${lang.nativeName}` : lang.nativeName}
    </option>
  ));

  if (variant === 'pill') {
    // Нативный <select> сохраняется намеренно: на мобильном он даёт системный
    // пикер, который лучше любого самодельного дропдауна.
    return (
      <span className={`relative inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/85 backdrop-blur-sm pl-2.5 pr-2 py-1 ${className ?? ''}`}>
        <Globe className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden />
        <select
          value={current}
          onChange={handleChange}
          aria-label={i18n.t('settings.language_title')}
          className="appearance-none bg-transparent pr-4 text-xs text-gray-600 focus:outline-none cursor-pointer"
        >
          {options}
        </select>
        <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 pointer-events-none" aria-hidden />
      </span>
    );
  }
```

Сигнатуру компонента поменять на:

```tsx
export const LanguageSelect: React.FC<LanguageSelectProps> = ({
  onChange, className, variant = 'default', showFlag = true,
}) => {
```

Существующий `return` со `<select>` оставить как ветку по умолчанию, заменив тело `{SUPPORTED_LANGUAGES.map(...)}` на `{options}`.

Добавить импорт:

```tsx
import { Globe, ChevronDown } from 'lucide-react';
```

- [ ] **Step 2: Убедиться, что вызовы в настройках и профиле не сломаны**

```bash
grep -rn "LanguageSelect" src --include="*.tsx"
```

Ожидается: вызовы в `SettingsView.tsx:317` и `ProfileView.tsx:356` без новых пропсов — они работают по-старому, потому что у обоих пропсов есть значения по умолчанию.

- [ ] **Step 3: Сборка**

```bash
pnpm build && pnpm vitest run
```

Ожидается: сборка успешна, `45 passed`.

- [ ] **Step 4: Коммит**

```bash
git add src/components/settings/LanguageSelect.tsx
git commit -m "feat(i18n): компактный вид переключателя языка для экрана входа"
```

---

### Task 6: `OAuthButton` на общую систему

**Files:**
- Modify: `src/components/onboarding/OAuthButton.tsx`

- [ ] **Step 1: Переписать компонент**

Заменить содержимое `src/components/onboarding/OAuthButton.tsx`:

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { authService } from '../../services/authService';
import { Button } from '../ui/Button';
import { providerMark } from './providerMarks';
import type { OAuthProviderId } from '../../types/auth';

interface Props {
  provider: OAuthProviderId;
  disabled?: boolean;
}

// i18n-ignore: только defaultValue для t('auth.oauth.*'), ключи есть во всех локалях.
const LABELS: Record<OAuthProviderId, { label: string; providerName: string }> = {
  google:  { label: 'Продолжить с Google',   providerName: 'Google' },
  yandex:  { label: 'Продолжить с Yandex',   providerName: 'Yandex' },
  talerid: { label: 'Продолжить с Taler ID', providerName: 'Taler ID' },
};

const OAuthButton: React.FC<Props> = ({ provider, disabled }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const look = LABELS[provider];

  const handleClick = async () => {
    setLoading(true);
    try {
      const { authorizeUrl } =
        provider === 'talerid'
          ? await authService.taleridLoginStart()
          : await authService.oauthInit(provider, 'login');
      window.location.href = authorizeUrl;
    } catch (e) {
      setLoading(false);
      const notConfigured = e instanceof Error && e.message === 'oauth provider not configured';
      // Системный alert() заменён на toast: он не блокирует страницу и выглядит
      // как остальной продукт. Toaster уже смонтирован в App.tsx.
      toast.error(
        notConfigured
          // i18n-ignore: defaultValue многострочного t(), ключ есть во всех локалях
          ? t('auth.oauth.notConfigured', 'Вход через {{provider}} пока не настроен на сервере', {
              provider: look.providerName,
            })
          : t('auth.oauth.initFailed', 'Не удалось начать вход через провайдер'),
      );
    }
  };

  return (
    <Button
      variant="secondary"
      onClick={handleClick}
      loading={loading}
      disabled={disabled}
      data-testid={`oauth-${provider}`}
      leading={providerMark(provider)}
    >
      {t(`auth.oauth.${provider}`, look.label)}
    </Button>
  );
};

export default OAuthButton;
```

- [ ] **Step 2: Сборка**

```bash
pnpm typecheck && pnpm build
```

Ожидается: успешно.

- [ ] **Step 3: Коммит**

```bash
git add src/components/onboarding/OAuthButton.tsx
git commit -m "refactor(auth): кнопки провайдеров на общую систему, alert → toast"
```

---

### Task 7: `EmailLoginPane` на `TextField` и `Button`

**Files:**
- Modify: `src/components/onboarding/EmailLoginPane.tsx`

- [ ] **Step 1: Переписать компонент**

Заменить содержимое `src/components/onboarding/EmailLoginPane.tsx`:

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailCheck, ArrowLeft } from 'lucide-react';
import { authService } from '../../services/authService';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';

interface Props {
  /** Согласие ещё не отмечено — отправлять нельзя. */
  blocked?: boolean;
  /** Рисуется под кнопкой: переключение на вход по телефону. */
  footer?: React.ReactNode;
}

const EmailLoginPane: React.FC<Props> = ({ blocked, footer }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'input' | 'sent'>('input');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.requestMagicLink(email.trim().toLowerCase());
      setStep('sent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'failed';
      if (msg === 'tempmail_blocked') setError(t('auth.email.tempmailBlocked', 'Используйте постоянную почту'));
      else if (msg === 'rate_limit') setError(t('auth.email.rateLimit', 'Слишком частые запросы, подожди минуту'));
      else setError(t('auth.email.requestError', 'Не удалось отправить ссылку'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="text-center py-4">
        <MailCheck className="w-10 h-10 text-forest-700 mx-auto mb-3" aria-hidden />
        <h3 className="text-base font-medium text-gray-900">{t('auth.email.sentTitle', 'Проверь почту')}</h3>
        <p className="text-sm text-gray-600 mt-1.5">
          {t('auth.email.sentBody', 'Мы отправили ссылку для входа на')}{' '}
          <span className="font-medium text-gray-900">{email}</span>
        </p>
        <button
          onClick={() => setStep('input')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          {t('common.back', 'Назад')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <TextField
        label={t('auth.email.label', 'Электронная почта')}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@example.com"
        data-testid="email-input"
        error={error}
      />
      <div className="mt-3">{/* место под блок согласия — вставляет LoginTabs */}</div>
      <Button
        type="submit"
        loading={loading}
        disabled={!email || blocked}
        data-testid="email-submit-btn"
      >
        {t('auth.email.submit', 'Получить ссылку для входа')}
      </Button>
      {footer}
    </form>
  );
};

export default EmailLoginPane;
```

> Блок согласия физически рендерит `LoginTabs` (Задача 10) — он общий для обеих форм и не должен дублироваться в каждой. Пустой `div` выше удаляется в Задаче 10, когда согласие встанет на своё место через `children`.

- [ ] **Step 2: Заменить заглушку на проброс `children`**

Убрать `<div className="mt-3">…</div>` и добавить в пропсы `consent?: React.ReactNode`, рендерить его между полем и кнопкой:

```tsx
interface Props {
  blocked?: boolean;
  consent?: React.ReactNode;
  footer?: React.ReactNode;
}
```

```tsx
      {consent}
      <Button type="submit" ... >
```

- [ ] **Step 3: Сборка**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 4: Коммит**

```bash
git add src/components/onboarding/EmailLoginPane.tsx
git commit -m "refactor(auth): форма почты на общие TextField и Button"
```

---

### Task 8: `PhoneInput` на `TextField` и `Button`

**Files:**
- Modify: `src/components/onboarding/PhoneInput.tsx`

- [ ] **Step 1: Переписать разметку, логику номера не трогая**

В `src/components/onboarding/PhoneInput.tsx` заменить пропсы и `return` (весь блок с `parsed`, `isValidPhone`, `handleChange`, `handleSubmit` оставить БЕЗ изменений — это разбор номера через libphonenumber-js):

```tsx
interface PhoneInputProps {
  onSubmit: (phone: string) => void;
  onDemoClick?: () => void;
  isLoading: boolean;
  blocked?: boolean;
  consent?: React.ReactNode;
  footer?: React.ReactNode;
}
```

```tsx
  return (
    <form onSubmit={handleSubmit}>
      <TextField
        label={t('onboarding.enter_phone')}
        type="tel"
        value={national}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        data-testid="phone-input"
        placeholder={new AsYouType(country).input('0'.repeat(9))}
        autoFocus
        error={touched && national && !isValidPhone ? t('onboarding.phone_invalid') : null}
        prefix={
          <div className="flex items-center border-r border-gray-200 pl-1">
            <CountrySelect value={country} onChange={setCountry} disabled={isLoading} />
          </div>
        }
      />
      {consent}
      <Button
        type="submit"
        data-testid="phone-submit-btn"
        loading={isLoading}
        disabled={!canSubmit || blocked}
      >
        {t('onboarding.send_code')}
      </Button>
      {footer}
    </form>
  );
```

Импорты: убрать `ArrowRight` и `clsx`, добавить:

```tsx
import { CountrySelect } from './CountrySelect';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
```

> `ArrowRight` убирается сознательно: у кнопки почты стрелки нет, значит на кнопке телефона это украшение одного экземпляра.

- [ ] **Step 2: Привести `CountrySelect` к прозрачному фону внутри рамки**

В `src/components/onboarding/CountrySelect.tsx` заменить классы `<select>` на:

```tsx
className="h-full bg-transparent pl-2 pr-1 text-sm text-gray-700 focus:outline-none cursor-pointer appearance-none"
```

- [ ] **Step 3: Сборка**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 4: Проверить руками, что валидация номера жива**

```bash
pnpm dev
```

Ввести `903016918` (на цифру короче) — под полем должна появиться ошибка, кнопка неактивна. Дописать `7` — ошибка уходит, кнопка активна.

- [ ] **Step 5: Коммит**

```bash
git add src/components/onboarding/PhoneInput.tsx src/components/onboarding/CountrySelect.tsx
git commit -m "refactor(auth): форма телефона на общие TextField и Button"
```

---

### Task 9: `OTPInput` и `SmsLoginPane`

**Files:**
- Modify: `src/components/onboarding/OTPInput.tsx`, `src/components/onboarding/SmsLoginPane.tsx`

- [ ] **Step 1: Ячейки кода в систему**

В `src/components/onboarding/OTPInput.tsx` привести классы ячейки к:

```tsx
className={`w-11 h-12 text-center text-xl font-semibold tabular-nums rounded-xl border bg-white transition-colors duration-150 focus:outline-none focus:ring-2 ${
  error
    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
    : 'border-gray-200 focus:border-forest-700 focus:ring-forest-700/20'
}`}
```

Кнопки «Назад» и «Отправить повторно» перевести на `<Button variant="ghost">`. Текст ошибки — `text-sm text-red-600`.

`tabular-nums` — чтобы цифры не прыгали по ширине при вводе.

- [ ] **Step 2: `alert()` в `SmsLoginPane` заменить на toast**

В `src/components/onboarding/SmsLoginPane.tsx` заменить три вызова `alert(...)` на `toast.error(...)`, добавив импорт:

```tsx
import toast from 'react-hot-toast';
```

Ветку обработки ошибок OTP (включая `STORAGE_FULL`) НЕ трогать — она разбиралась отдельно и покрыта Playwright-тестом из Задачи 1.

- [ ] **Step 3: Пробросить `consent` и `footer`**

Добавить в `SmsLoginPane` пропсы `blocked`, `consent`, `footer` и передать их в `PhoneInput`:

```tsx
interface Props {
  blocked?: boolean;
  consent?: React.ReactNode;
  footer?: React.ReactNode;
}
```

```tsx
  if (step === 'phone') {
    return (
      <PhoneInput
        onSubmit={handlePhoneSubmit}
        isLoading={isLoading}
        onDemoClick={() => {}}
        blocked={blocked}
        consent={consent}
        footer={footer}
      />
    );
  }
```

- [ ] **Step 4: Сборка**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 5: Коммит**

```bash
git add src/components/onboarding/OTPInput.tsx src/components/onboarding/SmsLoginPane.tsx
git commit -m "refactor(auth): ввод кода и ошибки SMS в общую систему"
```

---

### Task 10: `LoginConsentBlock` и `LoginTabs` — новая компоновка

Это ядро перекомпоновки: здесь исчезают вкладки и `opacity-40`.

**Files:**
- Modify: `src/components/onboarding/LoginConsentBlock.tsx`, `src/components/onboarding/LoginTabs.tsx`

- [ ] **Step 1: Компактное согласие**

Заменить `return` в `src/components/onboarding/LoginConsentBlock.tsx`:

```tsx
  return (
    <div className="my-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          data-testid="consent-checkbox"
          className="mt-0.5 w-4 h-4 shrink-0 text-forest-800 border-gray-300 rounded focus:ring-forest-700"
        />
        <span className="text-xs text-gray-600 leading-relaxed">
          {t('auth.consent.ageAndPrefix', 'Мне больше 18 лет, я ознакомлен(а) с ')}
          <button type="button" onClick={openTerms} className="text-forest-800 hover:underline font-medium">
            {t('auth.consent.servicesLink', 'описанием услуг')}
          </button>
          {t('auth.consent.and', ' и ')}
          <button type="button" onClick={() => setPaymentOpen(true)} className="text-forest-800 hover:underline font-medium">
            {t('auth.consent.paymentLink', 'порядком оплаты')}
          </button>
          {t('auth.consent.suffix', ' и принимаю их.')}
        </span>
      </label>
      <LegalModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} type={legalType} />
      <PaymentInfoModal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} />
    </div>
  );
```

> Серая карточка `bg-gray-50 rounded-lg p-4` убрана: блок больше не самостоятельная секция наверху, а строка внутри формы.

- [ ] **Step 2: Переписать `LoginTabs`**

Заменить содержимое `src/components/onboarding/LoginTabs.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail } from 'lucide-react';
import SmsLoginPane from './SmsLoginPane';
import EmailLoginPane from './EmailLoginPane';
import OAuthButton from './OAuthButton';
import LoginConsentBlock from './LoginConsentBlock';
import { Button } from '../ui/Button';

type Method = 'sms' | 'email';

/**
 * Вкладок больше нет: в карточке всегда ровно ОДНА основная форма, переключение
 * между почтой и телефоном идёт кнопкой на месте.
 *
 * Приоритет отдан почте — решение владельца продукта от 2026-08-07. Наблюдения
 * по регистрациям за 30 дней говорят в пользу телефона (11 против 5), но
 * стоимость SMS на каждой попытке в этих цифрах не отражена.
 *
 * Форма БОЛЬШЕ НЕ ГАСИТСЯ до галочки согласия. Раньше весь блок шёл под
 * opacity-40 pointer-events-none, и первое, что видел человек, — серая
 * нерабочая форма. Теперь неактивны только кнопки отправки.
 */
const LoginTabs: React.FC = () => {
  const { t } = useTranslation();

  const [method, setMethod] = useState<Method>(() =>
    localStorage.getItem('lastLoginTab') === 'sms' ? 'sms' : 'email',
  );
  useEffect(() => {
    try { localStorage.setItem('lastLoginTab', method); } catch { /* приватный режим */ }
  }, [method]);

  const [consentGiven, setConsentGiven] = useState<boolean>(
    () => localStorage.getItem('loginConsent') === 'true',
  );
  useEffect(() => {
    try { localStorage.setItem('loginConsent', consentGiven ? 'true' : 'false'); } catch { /* приватный режим */ }
  }, [consentGiven]);

  const consent = <LoginConsentBlock checked={consentGiven} onChange={setConsentGiven} />;

  const switchTo = (next: Method) => (
    <Button
      variant="ghost"
      className="mt-2.5"
      onClick={() => setMethod(next)}
      data-testid={next === 'sms' ? 'switch-to-phone' : 'switch-to-email'}
      leading={next === 'sms'
        ? <Smartphone className="w-[18px] h-[18px]" aria-hidden />
        : <Mail className="w-[18px] h-[18px]" aria-hidden />}
    >
      {next === 'sms'
        ? t('auth.switch.toPhone', 'Войти по номеру телефона')
        : t('auth.switch.toEmail', 'Войти по почте')}
    </Button>
  );

  return (
    <div className="w-full">
      {method === 'email' ? (
        <EmailLoginPane blocked={!consentGiven} consent={consent} footer={null} />
      ) : (
        <SmsLoginPane blocked={!consentGiven} consent={consent} footer={null} />
      )}

      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-gray-100" />
        <span className="text-xs text-gray-400">{t('auth.or', 'или')}</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>

      <div className="space-y-2">
        <OAuthButton provider="yandex"  disabled={!consentGiven} />
        <OAuthButton provider="google"  disabled={!consentGiven} />
        <OAuthButton provider="talerid" disabled={!consentGiven} />
      </div>

      {switchTo(method === 'email' ? 'sms' : 'email')}
    </div>
  );
};

export default LoginTabs;
```

- [ ] **Step 3: Сборка**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 4: Проверить новое поведение руками**

```bash
pnpm dev
```

Открыть `/`, НЕ ставя галочку:
- поле почты кликается и принимает ввод (раньше было `pointer-events-none`);
- кнопка «Получить ссылку» неактивна;
- кнопки провайдеров неактивны;
- подписи «Сначала примите условия выше» нет;
- кнопка «Войти по номеру телефона» переключает форму на месте.

- [ ] **Step 5: Коммит**

```bash
git add src/components/onboarding/LoginConsentBlock.tsx src/components/onboarding/LoginTabs.tsx
git commit -m "feat(auth): одна основная форма вместо вкладок, форма живая без согласия"
```

---

### Task 11: `OnboardingPage` — карточка, атмосфера, появление

**Files:**
- Modify: `src/pages/OnboardingPage.tsx`, `src/index.css`

- [ ] **Step 1: Добавить зерно и уважение к reduced-motion**

В конец `src/index.css`:

```css
/* Зерно поверх градиента экрана входа: тончайший шум даёт фону глубину и
   убирает «пластиковость» плоской заливки. SVG инлайном — без сетевого
   запроса и без ассета в репозитории. */
.grain-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
}

/* Ступенчатое появление экрана входа. Ключевые кадры fade-in и slide-up уже
   есть в tailwind.config.js — здесь только задержки. */
@media (prefers-reduced-motion: reduce) {
  .stagger-1, .stagger-2, .stagger-3 { animation: none !important; opacity: 1 !important; }
}
```

- [ ] **Step 2: Переписать страницу**

Заменить `return` в `src/pages/OnboardingPage.tsx`:

```tsx
  return (
    <div
      data-testid="onboarding-root"
      className="relative min-h-screen overflow-hidden grain-overlay bg-gradient-to-br from-warm-50 via-white to-forest-50 py-10 px-4 flex items-center justify-center"
    >
      {/* Мягкое свечение за карточкой: даёт фону глубину, которой не было —
          градиент существовал и раньше, но не читался, потому что форму
          от него ничто не отделяло. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-3xl opacity-40 bg-forest-200"
      />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSelect variant="pill" showFlag={false} />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="text-center mb-6 animate-fade-in stagger-1">
          <img
            src="/logo-Photoroom.png"
            alt=""
            className="w-14 h-14 mx-auto mb-3 object-contain"
          />
          <h1 className="text-lg font-bold tracking-[0.02em] text-gray-900">
            {t('onboarding.welcome')}
          </h1>
          <p className="mt-1.5 text-sm text-gray-600">{segSubtitle}</p>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-[0_10px_30px_-14px_rgba(15,118,110,0.4)] animate-slide-up stagger-2">
          <LoginTabs />
        </div>

        <p className="text-center mt-4 animate-fade-in stagger-3">
          <span className="inline-block rounded-full bg-forest-50 text-forest-800 text-xs font-medium px-3.5 py-1.5">
            {t('onboarding.trust')}
          </span>
        </p>
      </div>
    </div>
  );
```

- [ ] **Step 3: Задержки появления**

В `src/index.css` дописать:

```css
.stagger-1 { animation-delay: 0ms;   animation-fill-mode: both; }
.stagger-2 { animation-delay: 80ms;  animation-fill-mode: both; }
.stagger-3 { animation-delay: 160ms; animation-fill-mode: both; }
```

- [ ] **Step 4: Убрать эмодзи из строки про подарок**

В шести локалях у ключа `onboarding.trust` убрать ведущий символ `🎁` и пробел после него, оставив текст. Проверить, что символа не осталось:

```bash
grep -n '"trust"' src/i18n/locales/*.json
```

Ожидается: ни в одной строке нет `🎁`.

- [ ] **Step 5: Сборка и тесты локалей**

```bash
pnpm build && pnpm vitest run && pnpm check-locales
```

Ожидается: сборка успешна, все тесты зелёные, `check-locales` даёт `✅` по каждому языку.

- [ ] **Step 6: Коммит**

```bash
git add src/pages/OnboardingPage.tsx src/index.css src/i18n/locales/
git commit -m "feat(auth): экран входа — карточка на градиенте, атмосфера и появление"
```

---

### Task 12: Локали — убрать лишний ключ, добавить подписи переключения

**Files:**
- Modify: `src/i18n/locales/{ru,en,es,de,fr,zh}.json`

- [ ] **Step 1: Добавить ключи `auth.switch.*` и `auth.or`, удалить `auth.consent.needToAccept`**

Значения по языкам:

| ключ | ru | en | es | de | fr | zh |
|---|---|---|---|---|---|---|
| `auth.switch.toPhone` | Войти по номеру телефона | Sign in with phone number | Entrar con el número de teléfono | Mit Telefonnummer anmelden | Se connecter avec un numéro | 使用手机号登录 |
| `auth.switch.toEmail` | Войти по почте | Sign in with email | Entrar con el correo | Mit E-Mail anmelden | Se connecter par e-mail | 使用邮箱登录 |
| `auth.or` | или | or | o | oder | ou | 或 |

Удалить из всех шести: `auth.consent.needToAccept`. Также больше не используется `auth.orPhoneEmail` — удалить и его.

- [ ] **Step 2: Проверить согласованность локалей**

Паритет ключей проверяет отдельный скрипт, а НЕ vitest (`check-locales.test.mjs` сверяет только продублированный список языков с реестром):

```bash
pnpm check-locales
```

Ожидается: по строке `✅ <lang>: N/N ключей` на каждый из пяти нерусских языков. Скрипт падает, если в какой-то локали нет ключа из `ru.json` — то есть ловит «добавил в ru, забыл в остальных». Обратный случай (ключ удалён из `ru`, но остался в других) он НЕ ловит, поэтому удаление `needToAccept` и `orPhoneEmail` надо сверить руками:

```bash
grep -rn "needToAccept\|orPhoneEmail" src/i18n/locales/
```

Ожидается: пусто.

> В `deploy.sh` эта проверка не подключена — гонять её надо руками.

- [ ] **Step 3: Проверить, что удалённые ключи нигде не используются**

```bash
grep -rn "needToAccept\|orPhoneEmail" src/
```

Ожидается: пусто.

- [ ] **Step 4: Коммит**

```bash
git add src/i18n/locales/
git commit -m "i18n(auth): подписи переключения формы, минус ключи прежней раскладки"
```

---

### Task 13: Финальная проверка

- [ ] **Step 1: Playwright из Задачи 1 — должен остаться зелёным**

```bash
cd ~/Downloads/spirits_back/tests && npx playwright test playwright/login-ui.spec.js --reporter=list
```

Ожидается: `3 passed`. Это главная проверка всей пересборки: те же сценарии, что работали до неё, работают после.

- [ ] **Step 2: Дописать тесты нового поведения**

Дописать в `login-ui.spec.js`:

```js
test('форма кликабельна без согласия, неактивна только кнопка', async ({ page }) => {
  // До пересборки весь блок шёл под opacity-40 pointer-events-none —
  // этот тест на старой разметке падал.
  await openLogin(page);
  await page.getByTestId('email-input').fill('someone@example.com');
  await expect(page.getByTestId('email-input')).toHaveValue('someone@example.com');
  await expect(page.getByTestId('email-submit-btn')).toBeDisabled();
  await expect(page.getByTestId('oauth-yandex')).toBeDisabled();
  await expect(page.locator('body')).not.toContainText('Сначала примите условия');

  await page.getByTestId('consent-checkbox').check();
  await expect(page.getByTestId('email-submit-btn')).toBeEnabled();
  await expect(page.getByTestId('oauth-yandex')).toBeEnabled();
});

test('переключение формы работает в обе стороны', async ({ page }) => {
  await openLogin(page);
  await page.getByTestId('switch-to-phone').click();
  await expect(page.getByTestId('phone-input')).toBeVisible();
  await page.getByTestId('switch-to-email').click();
  await expect(page.getByTestId('email-input')).toBeVisible();
});
```

```bash
cd ~/Downloads/spirits_back/tests && npx playwright test playwright/login-ui.spec.js --reporter=list
```

Ожидается: `5 passed`.

- [ ] **Step 3: Ширины**

```bash
pnpm build && pnpm preview --port 4173
```

Снять экран на 320, 375, 420, 768, 1280. Проверить: горизонтальной прокрутки нет, карточка не прилипает к краям, пилюля языка не наезжает на логотип.

- [ ] **Step 4: Локали**

На каждом из шести языков открыть `/` и проверить, что подписи кнопок не переносятся в две строки и не обрезаются. Немецкий — самый длинный, на нём же проверить кнопку «Mit Telefonnummer anmelden».

- [ ] **Step 5: Полный набор тестов фронта**

```bash
pnpm vitest run && pnpm build
```

Ожидается: все тесты зелёные, сборка успешна.

- [ ] **Step 6: Финальный коммит и деплой**

```bash
git add -A && git commit -m "test(auth): тесты нового поведения экрана входа"
git push origin HEAD:main
```

Деплой — только после явного согласия владельца:

```bash
FRONT_ONLY=1 bash ~/Downloads/spirits_back/scripts/deploy.sh
```

---

## Самопроверка плана

**Покрытие спеки.** Все разделы имеют задачу: `controlStyles` — Задача 2; `Button`/`TextField` — 3; `providerMarks` — 4; `LanguageSelect` — 5; `OAuthButton` — 6; `EmailLoginPane` — 7; `PhoneInput` — 8; `OTPInput`/`SmsLoginPane` — 9; `LoginConsentBlock`/`LoginTabs` — 10; `OnboardingPage` — 11; локали — 12; тестирование — 1 и 13.

**Согласованность имён.** `buttonClasses`/`fieldClasses`/`CONTROL_HEIGHT`/`CONTROL_RADIUS` объявлены в Задаче 2 и используются в 3, 8, 9 в том же написании. Пропсы `blocked`/`consent`/`footer` объявлены в 7 и 9, передаются из 10 одинаково. `providerMark` объявлен в 4, вызывается в 6. Testid `switch-to-phone`, `email-input`, `email-submit-btn` вводятся в Задаче 1 на старой разметке и переносятся на новую в 6 и 10.

**Известное расхождение.** В Задаче 7 сначала ставится заглушка под согласие, а следующим шагом заменяется на проброс `consent` — сделано намеренно, чтобы шаг оставался мелким; итоговый вид описан полностью.
