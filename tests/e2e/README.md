# E2E Tests — my.linkeon.io

Playwright E2E-тесты для 10 пользовательских сценариев на продакшне (https://my.linkeon.io).

## Требования

- В исходном коде фронта должны присутствовать `data-testid` атрибуты из ветки `e2e-testing`
- На бэке должен быть включён `DEBUG_SMS_CODES=true`
- Node.js 18+, pnpm

## Установка

```bash
cd spirits_front
pnpm install
npx playwright install chromium
```

## Запуск тестов

```bash
# Полный прогон
npx playwright test

# Один флоу
npx playwright test tests/e2e/flows/01-onboarding.spec.ts

# Конкретный проект
npx playwright test --project=chromium-user

# С UI-режимом
npx playwright test --ui
```

## Тестовые аккаунты

| Роль  | Телефон      |
|-------|--------------|
| User  | 70000000000  |
| Admin | 79030169187  |

OTP-коды: `GET https://my.linkeon.io/webhook/debug/sms-code/:phone`  
(работает только при `DEBUG_SMS_CODES=true` на бэкенде).

## Покрытые сценарии

| #  | Файл                          | Проект          | Описание                              |
|----|-------------------------------|-----------------|---------------------------------------|
| 01 | `01-onboarding.spec.ts`       | chromium-anon   | Вход по телефону + SMS OTP            |
| 02 | `02-chat.spec.ts`             | chromium-user   | Чат с ассистентом                     |
| 03 | `03-assistant-switch.spec.ts` | chromium-user   | Смена ассистента                      |
| 04 | `04-profile.spec.ts`          | chromium-user   | Просмотр и редактирование профиля     |
| 05 | `05-tokens.spec.ts`           | chromium-user   | Покупка токенов (мок YooKassa)        |
| 06 | `06-coupon.spec.ts`           | chromium-user   | Ввод купона                           |
| 07 | `07-search.spec.ts`           | chromium-user   | Поиск + совместимость                 |
| 08 | `08-admin.spec.ts`            | chromium-admin  | Панель администратора                 |
| 09 | `09-referral.spec.ts`         | chromium-admin  | Реферальная система                   |
| 10 | `10-mobile.spec.ts`           | mobile-user     | Мобильный layout (iPhone 13)          |

## Архитектура

```
tests/e2e/
├── flows/               # 10 spec-файлов
├── helpers/
│   ├── testData.ts      # Константы (телефоны, пути, таймауты)
│   ├── guards.ts        # Whitelist тестовых телефонов
│   ├── otp.ts           # Получение OTP через debug-эндпоинт
│   ├── login.ts         # API-логин → storageState
│   ├── cleanup.ts       # Сброс состояния между тестами
│   └── mockYookassa.ts  # Мок платёжных роутов
├── global-setup.ts      # Кеш auth state для user + admin
└── .auth/               # Сохранённые auth state (gitignored)
```

## Деплой и тесты

**ВАЖНО:** тесты используют `data-testid` атрибуты, добавленные в ветке `e2e-testing`.  
Перед запуском убедись что:
1. Изменения из `e2e-testing` смерджены в `main`
2. Сборка задеплоена с основного рабочего дерева (`~/Downloads/spirits_front/`), **не из воркдерева**

```bash
# Деплой (только из основного каталога, не из .worktrees/)
cd ~/Downloads/spirits_front
echo "VITE_BACKEND_URL=https://my.linkeon.io" > .env
pnpm build
rsync -az --delete dist/ dvolkov@212.113.106.202:/home/dvolkov/spirits_front/

# Затем запустить тесты
npx playwright test --reporter=list
```

## Чеклист перед деплоем

```bash
npx playwright test --reporter=list
```

Все тесты должны быть зелёными. При падении любого — разобраться до деплоя.
