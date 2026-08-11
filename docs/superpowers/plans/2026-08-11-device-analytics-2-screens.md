# Аналитика устройств — план 2 из 2: экраны в админке

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать в админке, с чего люди пользуются продуктом: сводку по активным и список устройств конкретного человека.

**Architecture:** Два самостоятельных компонента в новом каталоге `src/components/admin/devices/`, встраиваемые в существующие экраны. Вся человекочитаемая подача — в отдельном модуле подписей, потому что только он и тестируется: vitest здесь с `environment: 'node'`, React не рендерится.

**Tech Stack:** React 18, TypeScript, Tailwind, vitest.

**Спека:** `docs/superpowers/specs/2026-08-11-device-analytics-design.md`

**Все команды — из `/Users/dmitry/Downloads/spirits_front`.**

---

## Что уже готово

План 1 выкачен: бэкенд собирает устройства и отдаёт два эндпоинта.

**`GET /webhook/admin/devices/stats`** — сводка по активным за 30 дней:

```json
{
  "windowDays": 30,
  "totalUsers": 64,
  "byPlatform": [{ "key": "desktop", "users": 41 }],
  "byOs":       [{ "key": "Windows", "users": 22 }],
  "byBrowser":  [{ "key": "Chrome",  "users": 34 }],
  "mobileTouched": 7,
  "mobileOnly": 3,
  "unknownUsers": 2
}
```

**`GET /webhook/admin/devices?userId=79088644408`** — устройства одного человека:

```json
[{ "signature": "desktop|Windows|Chrome|141", "platform": "desktop",
   "os": "Windows 10.0", "browser": "Chrome 141.0.0.0",
   "first_seen": "...", "last_seen": "...", "seen_count": 12 }]
```

Оба под `@UseGuards(JwtGuard, AdminGuard)`.

Таблица наполняется с момента выката плана 1, поэтому **первое время цифры будут маленькими или нулевыми**. Это не повод считать экран сломанным — пустое состояние должно выглядеть осмысленно.

## Три вещи, которые нельзя перепутать

**Проценты не сходятся к 100%.** Человек с ноутбуком и телефоном попадает в обе корзины. Это надо подписать прямо в интерфейсе, иначе первый же вопрос будет «почему в сумме 120».

**Два разных «unknown».** `unknownUsers` — клиент, которого классификатор не узнал вовсе; рост означает, что процентам верить нельзя. А `unknown` в разбивке по ОС — это ещё и Flutter: он сообщает платформу, но операционную систему из его строки не достать, и это норма. Называть их одинаково нельзя: нормальная работа мобилки выглядела бы как поломка разбора.

**Админка не локализуется.** По решению из спеки она остаётся русской, и `scripts/check-no-hardcoded.mjs` намеренно её не проверяет. Ключи i18n заводить не надо, пишем текст прямо в разметке.

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/components/admin/devices/deviceLabels.ts` | **создать** — подписи платформ и разбор смысла. Чистые функции, без React |
| `src/components/admin/devices/deviceLabels.test.ts` | **создать** — единственное, что здесь вообще тестируется |
| `src/components/admin/devices/DeviceStatsPanel.tsx` | **создать** — блок сводки |
| `src/components/admin/devices/UserDevicesList.tsx` | **создать** — список устройств человека |
| `src/components/admin/AdminUsageView.tsx` | встроить блок сводки |
| `src/components/admin/UserActivityDrawer.tsx` | встроить список устройств |

Компоненты вынесены отдельными файлами намеренно. `UserActivityDrawer.tsx` уже 817 строк, `AdminUsageView.tsx` — 387; дописывать в них ещё по сотне значит делать плохое хуже. Отдельные файлы к тому же можно читать целиком, не держа в голове чужой экран.

---

## Задача 1: Подписи и смысл

**Files:**
- Create: `src/components/admin/devices/deviceLabels.ts`
- Create: `src/components/admin/devices/deviceLabels.test.ts`

Это единственная часть плана, которую можно проверить автоматически: vitest здесь настроен на `environment: 'node'`, React не рендерится, разметка не проверяется ничем.

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/components/admin/devices/deviceLabels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { platformLabel, osLabel, sharePct, MOBILE_PLATFORMS } from './deviceLabels';

describe('подписи платформ', () => {
  it('переводит идентификаторы в человеческие названия', () => {
    expect(platformLabel('desktop')).toBe('Веб, десктоп');
    expect(platformLabel('mobile')).toBe('Веб, телефон');
    expect(platformLabel('tablet')).toBe('Веб, планшет');
    expect(platformLabel('app_flutter')).toBe('Мобильное приложение');
    expect(platformLabel('app_webview')).toBe('Мобильное приложение (обёртка)');
  });

  /**
   * «Не удалось определить» — это про сломанный разбор, и подпись обязана
   * звучать тревожно: рост этой доли означает, что остальным процентам
   * верить нельзя.
   */
  it('неузнанную платформу называет прямо, без эвфемизма «прочие»', () => {
    expect(platformLabel('unknown')).toBe('Не удалось определить');
  });

  it('незнакомый идентификатор отдаёт как есть, а не прячет', () => {
    expect(platformLabel('app_watch')).toBe('app_watch');
  });
});

describe('подписи операционных систем', () => {
  /**
   * Тот же ключ `unknown`, но смысл другой: у мобильного приложения на
   * Flutter платформа известна, а операционной системы в его строке нет.
   * Назвать это «не удалось определить» — значит выдать норму за поломку.
   */
  it('пустую ОС называет иначе, чем неузнанную платформу', () => {
    expect(osLabel('unknown')).toBe('Не сообщается');
    expect(osLabel('unknown')).not.toBe(platformLabel('unknown'));
  });

  it('известные системы отдаёт как есть', () => {
    expect(osLabel('Windows')).toBe('Windows');
    expect(osLabel('iOS')).toBe('iOS');
  });
});

describe('доля в процентах', () => {
  it('считает от числа активных, а не от суммы корзин', () => {
    expect(sharePct(41, 64)).toBe(64);
    expect(sharePct(18, 64)).toBe(28);
  });

  // Сумма долей заведомо больше 100: человек с двумя устройствами в двух
  // корзинах. Функция не должна пытаться это «исправить».
  it('не нормирует доли к сотне', () => {
    const total = 10;
    const sum = sharePct(8, total) + sharePct(7, total);
    expect(sum).toBeGreaterThan(100);
  });

  it('на пустой выборке отдаёт ноль, а не деление на ноль', () => {
    expect(sharePct(0, 0)).toBe(0);
    expect(Number.isFinite(sharePct(5, 0))).toBe(true);
  });
});

describe('какие платформы считаются мобильными', () => {
  // От этого списка зависят числа «трогали мобилку» и «только мобилка»,
  // которые бэкенд считает по такому же перечню. Разъедутся — цифры
  // в интерфейсе перестанут сходиться с подписью под ними.
  it('совпадает с перечнем бэкенда', () => {
    expect([...MOBILE_PLATFORMS].sort()).toEqual(['app_flutter', 'app_webview', 'mobile']);
  });
});
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

Run: `pnpm test src/components/admin/devices/deviceLabels.test.ts`
Expected: FAIL — `Failed to resolve import "./deviceLabels"`.

- [ ] **Шаг 3: Написать модуль**

Создать `src/components/admin/devices/deviceLabels.ts`:

```ts
/**
 * Человекочитаемая подача аналитики устройств.
 *
 * Вынесено из компонентов, потому что это единственное, что здесь можно
 * проверить автоматически: vitest в этом проекте настроен на
 * `environment: 'node'`, React не рендерится, и разметку не покрывает ничто.
 *
 * Админка не локализуется — по решению из спеки она остаётся русской, и
 * check-no-hardcoded намеренно её не проверяет. Поэтому текст здесь прямой,
 * без ключей i18n.
 */

/** Платформы, которые считаются мобильными. Тот же перечень, что на бэкенде. */
export const MOBILE_PLATFORMS = ['mobile', 'app_flutter', 'app_webview'] as const;

const PLATFORM_LABELS: Record<string, string> = {
  desktop: 'Веб, десктоп',
  mobile: 'Веб, телефон',
  tablet: 'Веб, планшет',
  app_flutter: 'Мобильное приложение',
  app_webview: 'Мобильное приложение (обёртка)',
  // Намеренно тревожная формулировка. «Прочие» звучали бы безобидно, а это
  // не остаток, а признак того, что классификатор чего-то не узнаёт, — и
  // тогда остальным процентам верить нельзя.
  unknown: 'Не удалось определить',
};

/** Незнакомый идентификатор отдаём как есть: спрятать его хуже, чем показать. */
export function platformLabel(key: string): string {
  return PLATFORM_LABELS[key] ?? key;
}

/**
 * Подпись операционной системы.
 *
 * Ключ `unknown` здесь значит НЕ то же, что у платформы. Мобильное приложение
 * на Flutter сообщает платформу, но операционной системы в его строке нет —
 * это норма, а не сбой разбора. Поэтому формулировка нейтральная.
 */
export function osLabel(key: string): string {
  return key === 'unknown' ? 'Не сообщается' : key;
}

/**
 * Доля в процентах от числа активных людей.
 *
 * Суммы по корзинам заведомо превышают 100%: человек с ноутбуком и телефоном
 * попадает в обе. Нормировать нельзя — это не ошибка, а устройство данных.
 */
export function sharePct(users: number, totalUsers: number): number {
  if (!totalUsers) return 0;
  return Math.round((users / totalUsers) * 100);
}
```

- [ ] **Шаг 4: Запустить и убедиться, что проходит**

Run: `pnpm test src/components/admin/devices/deviceLabels.test.ts`
Expected: PASS, 9 тестов.

- [ ] **Шаг 5: Сломать нарочно**

Временно поменять `unknown: 'Не удалось определить'` на `unknown: 'Прочие'`.

Run: `pnpm test src/components/admin/devices/deviceLabels.test.ts`
Expected: FAIL — «неузнанную платформу называет прямо, без эвфемизма „прочие“».

Вернуть, прогнать — PASS. Приведи вывод обеих команд. Этот излом сторожит смысл, а не текст: подпись «прочие» превратила бы сигнал о поломке в безобидный остаток.

- [ ] **Шаг 6: Коммит**

```bash
git add src/components/admin/devices/deviceLabels.ts src/components/admin/devices/deviceLabels.test.ts
git commit -m "feat(admin): подписи и доли для аналитики устройств

Вынесено отдельно от компонентов: vitest здесь с environment node, React не
рендерится, и это единственная часть экранов, которую можно проверить."
```

---

## Задача 2: Блок сводки

**Files:**
- Create: `src/components/admin/devices/DeviceStatsPanel.tsx`

- [ ] **Шаг 1: Написать компонент**

Создать `src/components/admin/devices/DeviceStatsPanel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Loader, AlertCircle, Smartphone } from 'lucide-react';
import { apiClient } from '../../../services/apiClient';
import { platformLabel, osLabel, sharePct } from './deviceLabels';

interface Bucket {
  key: string;
  users: number;
}

interface DeviceStats {
  windowDays: number;
  totalUsers: number;
  byPlatform: Bucket[];
  byOs: Bucket[];
  byBrowser: Bucket[];
  mobileTouched: number;
  mobileOnly: number;
  unknownUsers: number;
}

/** Столбик разбивки: подпись, число людей и доля. */
const BucketList: React.FC<{
  title: string;
  items: Bucket[];
  total: number;
  label?: (key: string) => string;
}> = ({ title, items, total, label }) => (
  <div>
    <h3 className="text-xs uppercase text-gray-500 mb-2">{title}</h3>
    {items.length === 0 ? (
      <p className="text-sm text-gray-400">пока пусто</p>
    ) : (
      <div className="space-y-1.5">
        {items.map((b) => (
          <div key={b.key} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-gray-800 truncate">{(label ?? ((k) => k))(b.key)}</span>
            <span className="text-gray-500 tabular-nums">{b.users}</span>
            <span className="w-10 text-right text-gray-400 tabular-nums">{sharePct(b.users, total)}%</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const DeviceStatsPanel: React.FC = () => {
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiClient.get('/webhook/admin/devices/stats');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setStats(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'не удалось загрузить');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex justify-center">
        <Loader className="w-5 h-5 animate-spin text-forest-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 text-red-600 text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>Устройства: {error}</span>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-forest-600" />
        <h2 className="text-sm font-medium text-gray-900">С чего заходят</h2>
        <span className="text-xs text-gray-400">
          {stats.totalUsers} активных за {stats.windowDays} дней
        </span>
      </div>

      {stats.totalUsers === 0 ? (
        <p className="text-sm text-gray-500">
          Данных пока нет. Сбор начался с выката, записи появляются при входе и продлении сессии —
          первые цифры будут в течение суток.
        </p>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <BucketList title="Платформы" items={stats.byPlatform} total={stats.totalUsers} label={platformLabel} />
            <BucketList title="Операционные системы" items={stats.byOs} total={stats.totalUsers} label={osLabel} />
            <BucketList title="Браузеры" items={stats.byBrowser} total={stats.totalUsers} label={osLabel} />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700 border-t border-gray-100 pt-3">
            <span>
              Трогали мобилку хоть раз: <strong>{stats.mobileTouched}</strong>
            </span>
            <span>
              Сидят только на мобилке: <strong>{stats.mobileOnly}</strong>
            </span>
            {stats.unknownUsers > 0 && (
              <span className="text-amber-700">
                Не удалось определить: <strong>{stats.unknownUsers}</strong>
              </span>
            )}
          </div>

          {/*
            Без этой подписи первый же вопрос будет «почему в сумме 120».
            Суммы больше ста — устройство данных, а не ошибка счёта.
          */}
          <p className="text-xs text-gray-400">
            Считаются люди, а не визиты. Один человек попадает в несколько строк, если заходит с
            разных устройств, — поэтому доли в сумме дают больше 100%.
          </p>
        </>
      )}
    </div>
  );
};

export default DeviceStatsPanel;
```

Обрати внимание на `cancelled` в эффекте: экран админки легко закрыть до ответа, и запись в состояние размонтированного компонента — предупреждение в консоли на ровном месте.

- [ ] **Шаг 2: Встроить в экран «Использование»**

В `src/components/admin/AdminUsageView.tsx` добавить импорт:

```ts
import DeviceStatsPanel from './devices/DeviceStatsPanel';
```

И отрисовать блок первым содержательным элементом — сразу после заголовка экрана, до графика по ассистентам. Найди в разметке корневой контейнер с содержимым (там, где начинаются карточки и график) и поставь `<DeviceStatsPanel />` в начало.

- [ ] **Шаг 3: Проверки**

Run: `pnpm build`
Expected: успех.

Run: `pnpm typecheck 2>&1 | grep -E "devices/DeviceStatsPanel|AdminUsageView"`
Expected: пусто. В репозитории 48 унаследованных ошибок типов в других файлах, поэтому `pnpm typecheck` целиком возвращает ненулевой код и всегда возвращал — ориентир не общий успех, а отсутствие ошибок в твоих файлах.

Run: `pnpm test`
Expected: зелено.

- [ ] **Шаг 4: Коммит**

```bash
git add src/components/admin/devices/DeviceStatsPanel.tsx src/components/admin/AdminUsageView.tsx
git commit -m "feat(admin): блок «С чего заходят» во вкладке «Использование»

Отдельным компонентом, а не строками в AdminUsageView: экран и так 387 строк.
Подпись про суммы больше 100% стоит в интерфейсе — иначе первый же вопрос
будет «почему в сумме 120»."
```

---

## Задача 3: Устройства в карточке пользователя

**Files:**
- Create: `src/components/admin/devices/UserDevicesList.tsx`
- Modify: `src/components/admin/UserActivityDrawer.tsx`

- [ ] **Шаг 1: Написать компонент**

Создать `src/components/admin/devices/UserDevicesList.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import { apiClient } from '../../../services/apiClient';
import { platformLabel } from './deviceLabels';

interface Device {
  signature: string;
  platform: string;
  os: string | null;
  browser: string | null;
  first_seen: string;
  last_seen: string;
  seen_count: number;
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Устройства одного человека, свежие первыми.
 *
 * Открывается там же, где возникает вопрос: пользователь жалуется — видно, с
 * чего он заходит, и можно не спрашивать «а у вас телефон или компьютер».
 */
const UserDevicesList: React.FC<{ phone: string }> = ({ phone }) => {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const resp = await apiClient.get(`/webhook/admin/devices?userId=${encodeURIComponent(phone)}`);
        const data = resp.ok ? await resp.json() : [];
        if (!cancelled) setDevices(Array.isArray(data) ? data : []);
      } catch {
        // Устройства — справка, а не суть карточки: молчаливый пустой блок
        // лучше, чем красная ошибка поверх живой информации о пользователе.
        if (!cancelled) setDevices([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phone]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Устройства</h3>

      {isLoading && <Loader className="w-4 h-4 animate-spin text-forest-600" />}

      {!isLoading && devices?.length === 0 && (
        <p className="text-sm text-gray-400">
          Пока не зафиксированы — запись появится при следующем входе или продлении сессии.
        </p>
      )}

      {!isLoading && devices && devices.length > 0 && (
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.signature} className="flex items-baseline gap-2 text-sm">
              <span className="text-gray-900">{platformLabel(d.platform)}</span>
              <span className="text-gray-500">{[d.browser, d.os].filter(Boolean).join(' · ') || '—'}</span>
              <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                {formatWhen(d.last_seen)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserDevicesList;
```

- [ ] **Шаг 2: Встроить в карточку**

В `src/components/admin/UserActivityDrawer.tsx` добавить импорт:

```ts
import UserDevicesList from './devices/UserDevicesList';
```

И отрисовать `<UserDevicesList phone={phone} />` в теле дровера — там, где идут блоки со сведениями о пользователе. Компонент сам грузит данные, ничего прокидывать не надо, кроме телефона.

Проверь, что `phone` в этом месте не `null`: у дровера пропс объявлен как `string | null`, и рендерить список без идентификатора бессмысленно.

- [ ] **Шаг 3: Проверки**

Run: `pnpm build`
Expected: успех.

Run: `pnpm typecheck 2>&1 | grep -E "devices/UserDevicesList|UserActivityDrawer"`
Expected: пусто.

Run: `pnpm test && pnpm check-hardcoded`
Expected: зелено. `check-hardcoded` намеренно не проверяет админку — русский текст в этих файлах разрешён.

- [ ] **Шаг 4: Коммит**

```bash
git add src/components/admin/devices/UserDevicesList.tsx src/components/admin/UserActivityDrawer.tsx
git commit -m "feat(admin): устройства в карточке пользователя

Отдельным компонентом: UserActivityDrawer и так 817 строк. Ошибку загрузки
показываем пустым блоком, а не красной плашкой — устройства тут справка, а
не суть карточки."
```

---

## Задача 4: Проверка глазами

**Files:** ничего не меняется.

Автотестами экраны в этом репозитории не покрываются вовсе: vitest настроен на `environment: 'node'`, React не рендерится. Поэтому проверка глазами — не формальность, а единственный способ увидеть результат.

- [ ] **Шаг 1: Полный прогон**

Run: `pnpm test && pnpm build && pnpm check-locales && pnpm check-keys && pnpm check-hardcoded && pnpm check-locale-format`
Expected: все шесть успешны.

- [ ] **Шаг 2: Сводка**

Run: `pnpm dev`, войти админом (`79030169187`), открыть админку → вкладка «Использование».

Проверить:
- блок «С чего заходят» отрисовался первым;
- если данных ещё нет — виден осмысленный текст про то, что сбор начался, а не пустая рамка;
- если данные есть — три колонки с разбивками, строки «трогали мобилку» и «только мобилка», подпись про суммы больше 100%.

- [ ] **Шаг 3: Карточка пользователя**

Открыть вкладку «Пользователи», кликнуть по любому — в карточке должен появиться блок «Устройства». У большинства он будет пустым с пояснением; у тех, кто заходил после выката плана 1, — со строками.

- [ ] **Шаг 4: На узком экране**

Сузить окно до ширины телефона. Три колонки разбивок обязаны сложиться в одну (`grid md:grid-cols-3`), строки не должны наезжать друг на друга.

- [ ] **Шаг 5: Готовность**

Run: `git status --short`
Expected: пусто.

Деплой — только через `bash ~/Downloads/spirits_back/scripts/deploy.sh` и только по явному согласованию с владельцем.

---

## Что этот план не делает

- Историю и динамику по времени — потребует таблицы событий.
- Связку устройства с конверсией и ошибками («на каких браузерах не проходит оплата»).
- Уточнение «обёртка против мобильного браузера» заголовком от клиента.
- Локализацию: админка остаётся русской по решению из спеки.
