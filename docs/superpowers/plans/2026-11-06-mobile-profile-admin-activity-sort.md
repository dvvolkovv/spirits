# Mobile Profile and Admin Activity Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать профиль React/Capacitor удобным на экранах 320–390 px и добавить в мобильный раздел админки «Пользователи» рабочую сортировку по последней активности.

**Architecture:** Изменения ограничиваются существующими `ProfileView` и `AdminUsersView`; отдельной мобильной страницы и изменений API нет. Мобильная сортировка использует общие `SortSelect`, `useTableSort` и то же состояние `sort`, что десктопная таблица. Сначала добавляются красные regression-тесты, затем минимальная реализация.

**Tech Stack:** React 18, TypeScript 5, Tailwind CSS 3, Vitest/jsdom, Playwright, pnpm.

---

## Файлы

- `src/components/profile/ProfileView.tsx` — адаптивная шапка, отступы карточек и переносы длинных значений; модальное окно не меняется после успешной браузерной проверки.
- `src/components/admin/AdminUsersView.tsx` — мобильный `SortSelect` над уже существующими `MobileRecordCard`.
- `src/components/admin/AdminUsersView.test.tsx` — компонентные тесты сортировки по активности и совместной работы с поиском.
- `tests/e2e/flows/10-mobile.spec.ts` — браузерные проверки геометрии профиля и мобильной сортировки админки.
- `docs/superpowers/specs/2026-11-06-mobile-profile-admin-activity-sort-design.md` — согласованная спецификация, не меняется.

## Окружение проверок

Все Vitest, TypeScript, build и Playwright запускаются на `dv@85.192.61.231` в `~/ci/spirits_front`, с `source ~/.nvm/nvm.sh`. CI-клон каждый раз ставится на конкретный SHA после push, а не на имя ветки. Тяжёлые команды на Mac не запускать.

Для Playwright нужен `DEBUG_SECRET` среды `E2E_API_URL`; секрет только в переменной окружения, не в репозитории и не в выводе команд. Локальный Vite использует существующий `.env` с `VITE_BACKEND_URL=https://my.linkeon.io`, поэтому `E2E_API_URL=https://my.linkeon.io` и для локального фронта.

### Task 1: Красный браузерный тест мобильного профиля

**Files:**
- Modify: `tests/e2e/flows/10-mobile.spec.ts`

- [ ] **Step 1: Добавить проверки кнопок, overflow и длинного значения**

Расширить импорт:

```ts
import { test, expect, type Page } from '@playwright/test';
```

Добавить внутрь `test.describe('Flow 10 — Mobile Layout', ...)` перед закрывающей `});`:

```ts
  const expectNoProfileOverflow = async (page: Page) => {
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      profile: document.querySelector<HTMLElement>('[data-testid="profile-root"]')?.scrollWidth ?? 0,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.profile).toBeLessThanOrEqual(dimensions.viewport);
  };

  const expectControlInsideViewport = async (page: Page, testId: string) => {
    const control = page.getByTestId(testId);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  };

  for (const width of [320, 360, 390]) {
    test(`profile controls fit ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/profile');
      await expect(page.getByTestId('profile-root')).toBeVisible();
      await expectControlInsideViewport(page, 'profile-edit-btn');
      await expectNoProfileOverflow(page);

      await page.getByTestId('profile-name').evaluate((element) => {
        element.textContent = 'ОченьДлинноеИмяПользователяБезПробеловКотороеНеДолжноРасширятьКарточку';
      });
      await page.getByTestId('profile-phone').evaluate((element) => {
        element.textContent = 'very-long-email-address-without-spaces@example-with-a-long-domain.invalid';
      });
      await expectNoProfileOverflow(page);

      await page.getByTestId('profile-edit-btn').click();
      await expectControlInsideViewport(page, 'profile-cancel-btn');
      await expectControlInsideViewport(page, 'profile-save-btn');
      await expectNoProfileOverflow(page);
    });
  }
```

- [ ] **Step 2: Закоммитить красный тест и поставить CI-клон на его SHA**

```bash
git add tests/e2e/flows/10-mobile.spec.ts
git commit -m "test(mobile): профиль — кнопки и переполнение 320–390 px (красный)" -m "Co-Authored-By: Kimi <noreply@moonshot.cn>"
git push -u origin feat/mobile-profile-admin-activity-sort
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front checkout -q $SHA"
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm install'
```

Expected: тест закоммичен, CI-клон находится на том же SHA.

- [ ] **Step 3: Запустить тест против текущего прода и убедиться в воспроизведении**

Run on the test node from `~/ci/spirits_front`:

```bash
E2E_BASE_URL=https://my.linkeon.io E2E_API_URL=https://my.linkeon.io DEBUG_SECRET="$DEBUG_SECRET" pnpm exec playwright test tests/e2e/flows/10-mobile.spec.ts --project=mobile-user --grep "profile controls fit"
```

Expected: FAIL как минимум на 320 px: `profile-edit-btn` выходит за viewport и/или `profile`/`document` имеет `scrollWidth > viewport`. Если тест зелёный на текущем коде, не править вёрстку: сначала заново воспроизвести проблему и уточнить тест.

### Task 2: Адаптивная вёрстка профиля

**Files:**
- Modify: `src/components/profile/ProfileView.tsx:381-435,446-520,547-656,658-705,891-997`
- Test: `tests/e2e/flows/10-mobile.spec.ts`

- [ ] **Step 1: Перестроить шапку без дублирования выбора языка**

Заменить блок от `<div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">` до закрытия header на:

```tsx
      <div className="bg-white shadow-sm px-3 sm:px-4 py-3 sm:py-4 border-b flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto min-w-0 text-lg sm:text-xl font-bold text-gray-900">
            {t('profile.title')}
          </h1>
          {/* Язык остаётся в шапке; на мобильном действия уходят следующей строкой. */}
          <LanguageSelect className="max-w-[10rem] px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-forest-500" />
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <button
              onClick={loadProfileFromServer}
              disabled={isLoadingProfile}
              className="w-full sm:w-auto flex items-center justify-center px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isLoadingProfile ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                t('profile.refresh')
              )}
            </button>
            {isEditing && (
              <button
                onClick={handleCancel}
                data-testid="profile-cancel-btn"
                className="w-full sm:w-auto px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('profile.cancel')}
              </button>
            )}
            <button
              onClick={isEditing ? handleSave : handleEdit}
              data-testid={isEditing ? 'profile-save-btn' : 'profile-edit-btn'}
              className={clsx(
                'w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors',
                isEditing && 'col-span-2',
                isEditing
                  ? 'bg-forest-600 hover:bg-forest-700 text-white'
                  : 'bg-warm-600 hover:bg-warm-700 text-white'
              )}
            >
              {isEditing ? t('profile.save') : t('profile.edit')}
            </button>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Уменьшить мобильные отступы контента и карточек**

Заменить класс контейнера контента:

```tsx
className="ym-hide-content flex-1 p-3 sm:p-4 pb-20 md:pb-4 space-y-4 sm:space-y-6 overflow-y-auto"
```

Применить следующие точные замены только в `ProfileView.tsx`:

```diff
- className="bg-white rounded-lg shadow-sm p-6"
+ className="bg-white rounded-lg shadow-sm p-4 sm:p-6"

- className="bg-gradient-to-br from-forest-50 to-warm-50 rounded-lg shadow-sm p-6 border border-forest-200"
+ className="bg-gradient-to-br from-forest-50 to-warm-50 rounded-lg shadow-sm p-4 sm:p-6 border border-forest-200"

- className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 scroll-mt-4"
+ className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-gray-200 scroll-mt-4"

- className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
+ className="w-full flex items-center justify-between px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors"

- className="px-6 py-4 border-b border-gray-200"
+ className="px-4 sm:px-6 py-4 border-b border-gray-200"

- className="p-6 space-y-4"
+ className="p-4 sm:p-6 space-y-4"
```

Первую замену применить ко всем одноимённым карточкам профиля; замену заголовка аккордеона — к «Настройкам» и «Партнёрам». Не менять классы `ym-hide-content`, `data-testid`, якоря и обработчики.

- [ ] **Step 3: Разрешить перенос имени, контактов и личной информации**

Заменить классы в карточке фотографии:

```tsx
<h2 data-testid="profile-name" className="text-xl font-bold text-gray-900 break-words">
```

```tsx
<p className="text-sm text-gray-500 break-all">@{profileData.user_nickname}</p>
```

```tsx
<p data-testid="profile-phone" className="text-sm text-gray-600 break-all">{user?.phone || user?.email}</p>
```

В view-режиме личной информации заменить четыре строки с `flex items-center justify-between` на:

```tsx
<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
```

Для значений имени, фамилии и nickname использовать:

```tsx
<span className="text-sm text-gray-900 min-w-0 break-words sm:text-right">
```

Для телефона/email использовать:

```tsx
<span className="text-sm text-gray-900 min-w-0 break-all sm:text-right">{user?.phone || user?.email}</span>
```

В Telegram-блоке использовать переносы и мобильную вертикальную группу:

```tsx
<div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
```

```tsx
<span className="text-blue-600 font-medium break-all">@{tgIdentity.tgUsername}</span>
```

```tsx
<div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
```

- [ ] **Step 4: Оставить модальное окно без production-изменений**

Красный тест на 320×568 не воспроизвёл дефект: после `scrollIntoViewIfNeeded()` кнопка «Отмена» полностью попадает в viewport и закрывает окно. Не добавлять `max-height` без подтверждённой причины. Сохранить сценарий `profile delete dialog fits short mobile viewport` как зелёный regression guard и убедиться, что после адаптивных правок он по-прежнему проходит.

- [ ] **Step 5: Запустить существующие компонентные тесты профиля**

```bash
git add src/components/profile/ProfileView.tsx
git commit -m "fix(profile): адаптировать шапку и карточки под мобильный экран" -m "Co-Authored-By: Kimi <noreply@moonshot.cn>"
git push origin feat/mobile-profile-admin-activity-sort
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front checkout -q $SHA"
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/profile/ProfileView.deeplink.test.tsx'
```

Expected: все существующие тесты `ProfileView.deeplink.test.tsx` PASS.

- [ ] **Step 6: Прогнать мобильный браузерный тест против локальной правки**

На ноде запустить Vite отдельным background Bash-вызовом (`run_in_background=true`):

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm dev --host 127.0.0.1 --port 5173'
```

После готовности Vite выполнить на ноде:

```bash
E2E_BASE_URL=http://127.0.0.1:5173 E2E_API_URL=https://my.linkeon.io DEBUG_SECRET="$DEBUG_SECRET" pnpm exec playwright test tests/e2e/flows/10-mobile.spec.ts --project=mobile-user --grep "profile controls fit"
```

Expected: 3/3 PASS для 320, 360 и 390 px; кнопки редактирования, отмены и сохранения находятся внутри viewport, overflow отсутствует.

### Task 3: Красные тесты мобильной сортировки пользователей

**Files:**
- Modify: `src/components/admin/AdminUsersView.test.tsx`
- Modify: `tests/e2e/flows/10-mobile.spec.ts`

- [ ] **Step 1: Подготовить строки с разной активностью в компонентном тесте**

Заменить `ACTIVE`, `mkUser` и `USERS` на:

```tsx
const ACTIVE = {
  days: 30,
  bucket: 'day' as const,
  series: [],
  totals: { total_users: 3, new_30d: 0, new_7d: 0, new_today: 0, dau: 0, wau: 0, mau: 0 },
};

const mkUser = (phone: string, last_active: string | null = null) => ({
  phone,
  registered_at: '2026-01-01T00:00:00Z',
  balance: 1000,
  spent_total: 0,
  spent_period: 0,
  last_active,
  paid_count: 0,
  paid_rub: 0,
  referral_leader_name: null,
});

const USERS = {
  hours: 720,
  users: [
    mkUser('70000000001', '2026-01-01T00:00:00Z'),
    mkUser('70000000002', '2026-01-03T00:00:00Z'),
    mkUser('70000000003'),
  ],
  totals: { users_with_balance: 3, users_total: 3, total_balance: 3000 },
};
```

- [ ] **Step 2: Добавить компонентные проверки направления и поиска**

Добавить helpers рядом с `click`:

```tsx
const chooseMobileSort = async (value: string) => {
  const select = q('admin-users-mobile-sort')?.querySelector('select') as HTMLSelectElement | null;
  expect(select).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select!, value);
    select!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
};

const mobileCardPhones = () => Array.from(
  container.querySelectorAll<HTMLElement>('[data-testid^="admin-user-mobile-card-"]'),
  (card) => card.dataset.testid!.replace('admin-user-mobile-card-', ''),
);
```

В существующий describe с `beforeEach` добавить вложенный describe:

```tsx
  describe('мобильная сортировка по последней активности', () => {
    it('сначала новые: свежая активность первая, отсутствующая дата — в конце', async () => {
      await chooseMobileSort('last_active|desc');
      expect(mobileCardPhones()).toEqual(['70000000002', '70000000001', '70000000003']);
    });

    it('сначала давние: порядок дат меняется на возрастание', async () => {
      await chooseMobileSort('last_active|asc');
      expect(mobileCardPhones()).toEqual(['70000000003', '70000000001', '70000000002']);
    });

    it('сортировка применяется к результату поиска', async () => {
      await typeSearch('70000000002');
      await chooseMobileSort('last_active|desc');
      expect(mobileCardPhones()).toEqual(['70000000002']);
    });
  });
```

- [ ] **Step 3: Добавить браузерную проверку мобильной сортировки админки**

Добавить в `Flow 10 — Mobile Layout` после profile-тестов:

```tsx
  test.describe('mobile admin users sorting', () => {
    test.use({ storageState: './tests/e2e/.auth/test-admin.json' });

    test('last activity sorts mobile cards in both directions', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 844 });
      let activityByPhone = new Map<string, number>();
      await page.route('**/webhook/admin/users/tokens?*', async (route) => {
        const response = await route.fetch();
        const body = await response.json() as {
          users: { phone: string; last_active: string | null }[];
        };
        activityByPhone = new Map(body.users.map((user) => {
          const parsed = user.last_active ? Date.parse(user.last_active) : Number.NEGATIVE_INFINITY;
          const timestamp = Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
          return [user.phone, timestamp] as const;
        }));
        await route.fulfill({ response, json: body });
      });
      await page.goto('/admin?tab=users');
      await expect(page.getByTestId('admin-root')).toBeVisible();

      const sort = page.getByTestId('admin-users-mobile-sort').locator('select');
      const cards = page.locator('[data-testid^="admin-user-mobile-card-"]');
      await expect(sort).toBeVisible();
      await expect(cards.first()).toBeVisible();

      const readPhones = () => cards.evaluateAll((elements) => elements.map(
        (element) => element.getAttribute('data-testid')!.replace('admin-user-mobile-card-', ''),
      ));
      const expectActivityOrder = async (direction: 'asc' | 'desc') => {
        await expect.poll(async () => {
          const phones = await readPhones();
          if (phones.length !== activityByPhone.size) return false;
          const values = phones.map((phone) => activityByPhone.get(phone) ?? Number.NEGATIVE_INFINITY);
          return values.every((value, index) => index === 0 || (
            direction === 'desc' ? values[index - 1] >= value : values[index - 1] <= value
          ));
        }).toBe(true);
      };

      await sort.selectOption('last_active|desc');
      await expectActivityOrder('desc');
      await sort.selectOption('last_active|asc');
      await expectActivityOrder('asc');
    });

    test('empty and error states fit mobile', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 844 });
      await page.route('**/webhook/admin/users/active?*', (route) => route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'test error',
      }));
      await page.goto('/admin?tab=users');
      await expect(page.getByText('Активность: 500')).toBeVisible();

      const expectNoOverflow = async () => {
        const dimensions = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          admin: document.querySelector<HTMLElement>('[data-testid="admin-root"]')?.scrollWidth ?? 0,
        }));
        expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
        expect(dimensions.admin).toBeLessThanOrEqual(dimensions.viewport);
      };

      await expectNoOverflow();
      await page.getByPlaceholder('Поиск по телефону...').fill('000');
      await expect(page.getByText('Нет пользователей')).toBeVisible();
      await expectNoOverflow();
    });
  });
```

- [ ] **Step 4: Запустить компонентный тест и подтвердить красный результат**

```bash
git add src/components/admin/AdminUsersView.test.tsx tests/e2e/flows/10-mobile.spec.ts
git commit -m "test(admin): мобильная сортировка пользователей по активности (красный)" -m "Co-Authored-By: Kimi <noreply@moonshot.cn>"
git push origin feat/mobile-profile-admin-activity-sort
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front checkout -q $SHA"
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/AdminUsersView.test.tsx'
```

Expected: три новых компонентных теста FAIL, потому что `admin-users-mobile-sort` ещё отсутствует; уже существующие мобильные карточки и прежние проверки поиска остаются зелёными.

### Task 4: Мобильный контрол сортировки на общем состоянии

**Files:**
- Modify: `src/components/admin/AdminUsersView.tsx:1-6,380-485`
- Test: `src/components/admin/AdminUsersView.test.tsx`
- Test: `tests/e2e/flows/10-mobile.spec.ts`

- [ ] **Step 1: Подключить SortSelect**

Изменить импорт:

```tsx
import { SortableTh, SortSelect, useTableSort, cmp, SortState } from './shared/sortableTable';
```

- [ ] **Step 2: Добавить мобильный список рядом с поиском**

В блок `{/* Search + sort */}` сразу после закрытия контейнера поиска и перед `<span className="text-xs text-gray-400 sm:ml-auto">` вставить:

```tsx
          <div data-testid="admin-users-mobile-sort" className="w-full sm:hidden">
            <SortSelect
              state={sort}
              onSort={setSort}
              className="w-full px-3 py-2"
              options={[
                { key: 'spent_period', dir: 'desc', label: 'Списано за 30 дн: по убыванию' },
                { key: 'spent_period', dir: 'asc', label: 'Списано за 30 дн: по возрастанию' },
                { key: 'last_active', dir: 'desc', label: 'Последняя активность: сначала новые' },
                { key: 'last_active', dir: 'asc', label: 'Последняя активность: сначала давние' },
                { key: 'registered_at', dir: 'desc', label: 'Регистрация: сначала новые' },
                { key: 'registered_at', dir: 'asc', label: 'Регистрация: сначала давние' },
                { key: 'balance', dir: 'desc', label: 'Баланс: по убыванию' },
                { key: 'balance', dir: 'asc', label: 'Баланс: по возрастанию' },
                { key: 'paid_count', dir: 'desc', label: 'Платежи: по убыванию' },
                { key: 'paid_count', dir: 'asc', label: 'Платежи: по возрастанию' },
              ]}
            />
          </div>
```

Не менять начальное `useState<SortState<UserSortKey>>({ key: 'spent_period', dir: 'desc' })` и десктопные `SortableTh`.

- [ ] **Step 3: Запустить компонентные тесты**

```bash
git add src/components/admin/AdminUsersView.tsx
git commit -m "feat(admin): сортировка пользователей по активности на мобильном" -m "Co-Authored-By: Kimi <noreply@moonshot.cn>"
git push origin feat/mobile-profile-admin-activity-sort
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front checkout -q $SHA"
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/AdminUsersView.test.tsx'
```

Expected: все тесты `AdminUsersView.test.tsx` PASS, включая оба направления активности и поиск.

- [ ] **Step 4: Запустить обе мобильные браузерные проверки**

На ноде, при запущенном Vite на `127.0.0.1:5173`:

```bash
E2E_BASE_URL=http://127.0.0.1:5173 E2E_API_URL=https://my.linkeon.io DEBUG_SECRET="$DEBUG_SECRET" pnpm exec playwright test tests/e2e/flows/10-mobile.spec.ts --project=mobile-user --grep "profile controls fit|last activity sorts mobile cards|empty and error states fit"
```

Expected: 5/5 PASS — три ширины профиля, сортировка админки в обоих направлениях и мобильные состояния ошибки/пустого списка.

### Task 5: Финальная регрессия и сборка

**Files:**
- Verify: `src/components/profile/ProfileView.tsx`
- Verify: `src/components/admin/AdminUsersView.tsx`
- Verify: `src/components/admin/AdminUsersView.test.tsx`
- Verify: `tests/e2e/flows/10-mobile.spec.ts`

- [ ] **Step 1: Запустить целевые компонентные тесты**

Run on the test node from `~/ci/spirits_front`:

```bash
pnpm exec vitest run src/components/admin/AdminUsersView.test.tsx src/components/profile/ProfileView.deeplink.test.tsx
```

Expected: все тесты PASS.

- [ ] **Step 2: Проверить TypeScript без увеличения существующей базы ошибок**

```bash
pnpm typecheck
```

Expected: команда может сохранить известную базу ошибок main, но не должна содержать новых ошибок в `ProfileView.tsx`, `AdminUsersView.tsx`, их тестах или `10-mobile.spec.ts`. При новой ошибке сравнить с чистым базовым SHA и исправить только свой regress.

- [ ] **Step 3: Проверить production build**

```bash
pnpm build
```

Expected: PASS, сборка завершается без ошибок.

- [ ] **Step 4: Проверить чистоту ветки и остановить Vite**

```bash
git status --short
git log --oneline main..HEAD
```

Expected: рабочее дерево чистое; в списке только коммиты этой задачи. Остановить background Bash-задачу Vite через `TaskStop` по её фактическому ID. Не выполнять deploy: выкат только отдельно после подтверждения владельца через `~/Downloads/spirits_back/scripts/deploy.sh`.
