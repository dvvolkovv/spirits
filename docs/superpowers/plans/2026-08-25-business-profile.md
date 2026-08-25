# Бизнес-профиль пользователя — план реализации

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ САБ-СКИЛЛ — используйте superpowers:subagent-driven-development (рекомендуется) либо superpowers:executing-plans, чтобы выполнять план задача за задачей. Шаги размечены чекбоксами (`- [ ]`).

**Цель:** дать восьми бизнес-ассистентам общее знание о бизнесе пользователя, чтобы он не пересказывал контекст каждому заново.

**Архитектура:** карточка живёт в `profile_data->'business'` (JSONB, без миграции). Весь код собран в `BusinessProfileService` — чтение, запись с защитой правок пользователя, извлечение фактов из хода разговора отдельным LLM-вызовом, рендер блока для промпта. Чат вызывает сервис в трёх местах сборки промпта и в трёх местах после хода. Фронт получает самостоятельный блок в `/profile` по образцу `ProfileTasks`.

**Стек:** NestJS 10 + PostgreSQL (`spirits_back`), React 18 + TypeScript + Vite + vitest + i18next (`spirits_front`). Тесты бэка — jest (`**/src/**/*.spec.ts`), тесты фронта — vitest (`*.test.ts`).

**Спека:** `docs/superpowers/specs/2026-08-25-business-profile-design.md`

---

## Рабочие каталоги

Два worktree уже созданы, оба на ветке `feat/business-profile` от `origin/main`:

- бэкенд: `/Users/dmitry/Downloads/spirits_back/.worktrees/business-profile`
- фронт: `/Users/dmitry/Downloads/spirits_front/.worktrees/business-profile`

Основные чекауты не трогать: в них работают параллельные сессии.

## Как гонять тесты

**Не на маке.** Мак не тянет полный прогон, он уходит в таймаут. Всё тяжёлое — на тестовой ноде, в CI-клонах:

```bash
# 1. Локально: закоммитить и запушить
git push -u origin feat/business-profile

# 2. На ноде: встать на конкретный sha (не на имя ветки)
ssh dv@85.192.61.231 'git -C ~/ci/spirits_back fetch -q origin && git -C ~/ci/spirits_back checkout -q <sha>'

# 3. Прогон
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npm install && npx jest src/business-profile'
```

`source ~/.nvm/nvm.sh` обязателен в каждой ssh-команде, иначе node не найдётся.

Точечный прогон одного файла локально допустим и во время разработки удобнее:
`npx jest src/business-profile/business-profile.service.spec.ts`

**Важно про красноту:** полный `npm test` в `spirits_back` красный и без наших правок — jest скребёт `.worktrees/`, и два теста падают на `main`. Свою работу мерить дельтой, а не абсолютным «всё зелёное».

## Структура файлов

**Бэкенд** (`spirits_back`):

| Файл | Ответственность |
|---|---|
| `src/business-profile/business-profile.types.ts` | типы карточки, список полей, enum-словари |
| `src/business-profile/extract-prefilter.ts` | локальный фильтр: отсеять реплики без фактов о бизнесе до LLM |
| `src/business-profile/business-profile.service.ts` | чтение, запись с защитой `source: 'user'`, извлечение, рендер |
| `src/business-profile/business-profile.controller.ts` | `GET`/`POST /webhook/business-profile` |
| `src/business-profile/business-profile.module.ts` | сборка модуля (`@Global`, как `TasksModule`) |
| `src/business-profile/*.spec.ts` | тесты |
| `src/chat/chat.service.ts` (правки) | три инъекции в промпт, три вызова извлечения, протаскивание `category` |
| `src/app.module.ts` (правка) | регистрация модуля |

**Фронт** (`spirits_front`):

| Файл | Ответственность |
|---|---|
| `src/components/profile/BusinessCard.tsx` | блок карточки: загрузка, показ, правка поля на месте |
| `src/components/profile/businessFields.ts` | описание полей и enum-опций для UI + чистые функции |
| `src/components/profile/businessFields.test.ts` | тесты чистых функций |
| `src/i18n/businessCard.test.ts` | все ключи есть во всех семи локалях |
| `src/components/profile/ProfileView.tsx` (правка) | вставить `<BusinessCard />` |
| `src/i18n/locales/{ru,en,es,de,fr,pt,zh}.json` | новые ключи |

---

## Задача 1: типы и словари карточки

**Файлы:**
- Создать: `src/business-profile/business-profile.types.ts`
- Тест: `src/business-profile/business-profile.types.spec.ts`

- [ ] **Шаг 1: написать падающий тест**

`src/business-profile/business-profile.types.spec.ts`:

```typescript
import { BUSINESS_FIELDS, ENUM_LABELS, renderEnum, isBusinessProfileEmpty } from './business-profile.types';

describe('business profile types', () => {
  it('описывает ровно восемь полей', () => {
    expect(BUSINESS_FIELDS).toHaveLength(8);
    expect(BUSINESS_FIELDS.map(f => f.key)).toEqual([
      'what', 'legal_form', 'tax_mode', 'stage', 'revenue', 'team', 'customers', 'focus',
    ]);
  });

  it('рендерит enum-код в человекочитаемое название', () => {
    expect(renderEnum('tax_mode', 'usn_d')).toBe('УСН Доходы');
    expect(renderEnum('legal_form', 'ip')).toBe('ИП');
  });

  it('неизвестный enum-код отдаёт сам код, а не роняет рендер', () => {
    expect(renderEnum('tax_mode', 'no_such_mode')).toBe('no_such_mode');
  });

  it('поле без enum-словаря отдаёт значение как есть', () => {
    expect(renderEnum('what', 'студия маникюра')).toBe('студия маникюра');
  });

  it('пустая карточка распознаётся как пустая', () => {
    expect(isBusinessProfileEmpty(undefined)).toBe(true);
    expect(isBusinessProfileEmpty({})).toBe(true);
    expect(isBusinessProfileEmpty({ what: { value: '', source: 'user', updated_at: 'x' } })).toBe(true);
  });

  it('карточка с одним заполненным полем пустой не считается', () => {
    expect(isBusinessProfileEmpty({
      what: { value: 'студия маникюра', source: 'user', updated_at: '2026-08-25T00:00:00Z' },
    })).toBe(false);
  });

  it('у каждого enum-поля словарь покрывает все допустимые значения', () => {
    for (const f of BUSINESS_FIELDS) {
      if (!f.enum) continue;
      for (const v of f.enum) {
        expect(ENUM_LABELS[f.key]?.[v]).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx jest src/business-profile/business-profile.types.spec.ts`
Ожидаемо: FAIL, `Cannot find module './business-profile.types'`

- [ ] **Шаг 3: минимальная реализация**

`src/business-profile/business-profile.types.ts`:

```typescript
/**
 * Карточка бизнеса пользователя. Живёт в profile_data->'business'.
 *
 * Каждое поле хранится тройкой, а не голым значением: source отличает то,
 * что ввёл человек, от того, что вывел ассистент из разговора. Правило
 * не-затирания (см. BusinessProfileService.merge) опирается только на него —
 * без source автосбор со временем затрёт выверенные данные, и карточка
 * станет хуже, чем была бы вообще без автосбора.
 */
export type FieldSource = 'user' | 'assistant';

export interface BusinessField {
  value: string;
  source: FieldSource;
  updated_at: string;
}

export type BusinessProfile = Partial<Record<BusinessFieldKey, BusinessField>>;

export type BusinessFieldKey =
  | 'what' | 'legal_form' | 'tax_mode' | 'stage' | 'revenue' | 'team' | 'customers' | 'focus';

export interface FieldSpec {
  key: BusinessFieldKey;
  /** Английский лейбл для промпта — как соседний блок `User profile:`. */
  promptLabel: string;
  /** Допустимые значения; отсутствует у свободных текстовых полей. */
  enum?: string[];
}

export const BUSINESS_FIELDS: FieldSpec[] = [
  { key: 'what',       promptLabel: 'What the business does' },
  { key: 'legal_form', promptLabel: 'Legal form', enum: ['self_employed', 'ip', 'ooo'] },
  { key: 'tax_mode',   promptLabel: 'Tax mode',   enum: ['npd', 'usn_d', 'usn_dr', 'patent', 'osno'] },
  { key: 'stage',      promptLabel: 'Stage',      enum: ['idea', 'year_one', 'stable', 'growth'] },
  { key: 'revenue',    promptLabel: 'Monthly revenue', enum: ['lt_300k', '300k_1m', '1m_3m', '3m_10m', 'gt_10m'] },
  { key: 'team',       promptLabel: 'Team' },
  { key: 'customers',  promptLabel: 'Customers' },
  { key: 'focus',      promptLabel: 'Current focus' },
];

/**
 * Значения хранятся кодами, а не текстом: на этом проекте локализация данных
 * уже роняла логику — includes() и регулярки по русским строкам переставали
 * срабатывать после перевода и падали молча.
 *
 * Рендерим российские термины их каноническими русскими названиями:
 * английских эквивалентов у УСН и ИП нет, а модель их знает.
 */
export const ENUM_LABELS: Partial<Record<BusinessFieldKey, Record<string, string>>> = {
  legal_form: {
    self_employed: 'самозанятый',
    ip: 'ИП',
    ooo: 'ООО',
  },
  tax_mode: {
    npd: 'НПД',
    usn_d: 'УСН Доходы',
    usn_dr: 'УСН Доходы минус расходы',
    patent: 'патент',
    osno: 'ОСНО',
  },
  stage: {
    idea: 'идея, ещё не запущен',
    year_one: 'первый год',
    stable: 'устойчивый',
    growth: 'рост',
  },
  revenue: {
    lt_300k: 'до 300 тыс ₽/мес',
    '300k_1m': '300 тыс – 1 млн ₽/мес',
    '1m_3m': '1–3 млн ₽/мес',
    '3m_10m': '3–10 млн ₽/мес',
    gt_10m: 'больше 10 млн ₽/мес',
  },
};

/** Код → человекочитаемое. Неизвестный код отдаём как есть: рендер промпта
 *  не должен падать из-за мусора, приехавшего от модели. */
export function renderEnum(key: BusinessFieldKey, value: string): string {
  return ENUM_LABELS[key]?.[value] ?? value;
}

export function isBusinessProfileEmpty(p: BusinessProfile | undefined | null): boolean {
  if (!p) return true;
  return !BUSINESS_FIELDS.some(f => (p[f.key]?.value || '').trim().length > 0);
}
```

- [ ] **Шаг 4: убедиться, что тест проходит**

Запустить: `npx jest src/business-profile/business-profile.types.spec.ts`
Ожидаемо: PASS, 6 тестов

- [ ] **Шаг 5: коммит**

```bash
git add src/business-profile/business-profile.types.ts src/business-profile/business-profile.types.spec.ts
git commit -m "feat(business-profile): типы карточки и словари enum-значений"
```

---

## Задача 2: префильтр извлечения

Локальный фильтр перед LLM-вызовом. У задач такой уже есть (`src/tasks/extract-prefilter.ts`), но настроен на глаголы действия — нам нужны обороты, в которых люди сообщают факты о бизнесе.

**Файлы:**
- Создать: `src/business-profile/extract-prefilter.ts`
- Тест: `src/business-profile/extract-prefilter.spec.ts`

- [ ] **Шаг 1: написать падающий тест**

`src/business-profile/extract-prefilter.spec.ts`:

```typescript
import { shouldSkipBusinessExtraction } from './extract-prefilter';

describe('business extraction prefilter', () => {
  it('пропускает дальше реплики с фактами о бизнесе', () => {
    const passing = [
      'у меня ИП на УСН доходы',
      'оборот примерно полтора миллиона в месяц',
      'нас четверо, я и три мастера',
      'работаю на себя, самозанятый',
      'клиенты — женщины 25-45 из нашего района',
      'открыли вторую точку в Казани',
      'выручка упала до 800 тысяч',
      'мы ООО, платим НДС',
    ];
    for (const m of passing) {
      expect(shouldSkipBusinessExtraction(m)).toBe(false);
    }
  });

  it('срезает вежливости и короткие реплики без фактов', () => {
    const skipped = [
      'привет',
      'спасибо, всё понятно',
      'ок',
      'ага',
      '',
      '   ',
      'да',
      'а можно ещё раз?',
    ];
    for (const m of skipped) {
      expect(shouldSkipBusinessExtraction(m)).toBe(true);
    }
  });

  it('срезает длинные реплики, в которых нет ни одного бизнес-маркера', () => {
    expect(shouldSkipBusinessExtraction(
      'Расскажи пожалуйста подробнее про то как обычно строится такой разговор и что мне стоит ожидать дальше',
    )).toBe(true);
  });

  it('не срезает длинную реплику с одним бизнес-маркером в конце', () => {
    expect(shouldSkipBusinessExtraction(
      'Долго думал что делать дальше и решил всё-таки посоветоваться, потому что у меня ИП',
    )).toBe(false);
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx jest src/business-profile/extract-prefilter.spec.ts`
Ожидаемо: FAIL, `Cannot find module './extract-prefilter'`

- [ ] **Шаг 3: минимальная реализация**

`src/business-profile/extract-prefilter.ts`:

```typescript
/**
 * Локальный фильтр перед LLM-вызовом извлечения бизнес-фактов.
 *
 * Отдельный от tasks/extract-prefilter намеренно: там маркеры — глаголы
 * действия («сделат», «запуст», «дедлайн»), здесь — обороты, которыми
 * сообщают факты о деле. Один фильтр на двоих пришлось бы размыть, и он
 * потерял бы главное свойство: дёшево срезать большинство ходов.
 *
 * `\b` не работает с кириллицей в JS (word boundary только для ASCII \w),
 * поэтому substring-match, как в фильтре задач.
 */
const BUSINESS_MARKERS =
  /(ип\b|ооо|самозанят|усн|нпд|осно|патент|ндс|налог|оборот|выручк|доход|прибыл|маржа|клиент|заказчик|покупател|сотрудник|мастер|команд|нас (двое|трое|четверо|пятеро)|работник|штат|точк|филиал|салон|студи|магазин|бизнес|компани|фирм|производств|услуг|подрядчик|поставщик|аренд|касс|счёт|счет|тысяч|миллион|млн|руб|₽)/i;

const PLEASANTRY =
  /^\s*(привет|здравств|спасибо|спасиб|пожалуйста|ок|окей|ага|да|нет|good|hi|hello|thanks|спс|ясно|понятно|круто|супер|👍|❤️)[!.,\s]*$/i;

export function shouldSkipBusinessExtraction(message: string): boolean {
  const trimmed = (message || '').trim();
  if (!trimmed) return true;
  if (PLEASANTRY.test(trimmed)) return true;
  // Без бизнес-маркера извлекать нечего в любой реплике, короткой или длинной.
  return !BUSINESS_MARKERS.test(trimmed);
}
```

- [ ] **Шаг 4: убедиться, что тест проходит**

Запустить: `npx jest src/business-profile/extract-prefilter.spec.ts`
Ожидаемо: PASS, 4 теста

- [ ] **Шаг 5: коммит**

```bash
git add src/business-profile/extract-prefilter.ts src/business-profile/extract-prefilter.spec.ts
git commit -m "feat(business-profile): префильтр извлечения бизнес-фактов"
```

---

## Задача 3: чтение, запись и правило не-затирания

Ядро сервиса. Правило: извлечение никогда не перезаписывает поле, которое правил человек.

**Файлы:**
- Создать: `src/business-profile/business-profile.service.ts`
- Тест: `src/business-profile/business-profile.service.spec.ts`

- [ ] **Шаг 1: написать падающий тест**

`src/business-profile/business-profile.service.spec.ts`:

```typescript
import { BusinessProfileService } from './business-profile.service';
import { BusinessProfile } from './business-profile.types';

function makePg(profile: BusinessProfile = {}) {
  const state = { business: profile };
  return {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (/SELECT/i.test(sql)) {
        return { rows: [{ profile_data: { name: 'Дмитрий', business: state.business } }] };
      }
      // UPDATE ... SET profile_data = jsonb_set(...)
      // merge шлёт JSON.stringify — мок обязан распарсить, иначе в state
      // окажется строка и обращения вида state.business.what.value упадут.
      state.business = JSON.parse(params[0]);
      return { rows: [] };
    }),
    _state: state,
  } as any;
}

describe('BusinessProfileService.merge', () => {
  it('записывает новое поле, пришедшее от ассистента', async () => {
    const pg = makePg({});
    const svc = new BusinessProfileService(pg);

    await svc.merge('u1', { what: 'студия маникюра' }, 'assistant');

    expect(pg._state.business.what.value).toBe('студия маникюра');
    expect(pg._state.business.what.source).toBe('assistant');
  });

  it('НЕ перезаписывает поле, которое правил пользователь', async () => {
    const pg = makePg({
      tax_mode: { value: 'usn_d', source: 'user', updated_at: '2026-08-01T00:00:00Z' },
    });
    const svc = new BusinessProfileService(pg);

    await svc.merge('u1', { tax_mode: 'osno' }, 'assistant');

    expect(pg._state.business.tax_mode.value).toBe('usn_d');
    expect(pg._state.business.tax_mode.source).toBe('user');
  });

  it('перезаписывает собственную прошлую догадку ассистента', async () => {
    const pg = makePg({
      tax_mode: { value: 'osno', source: 'assistant', updated_at: '2026-08-01T00:00:00Z' },
    });
    const svc = new BusinessProfileService(pg);

    await svc.merge('u1', { tax_mode: 'usn_d' }, 'assistant');

    expect(pg._state.business.tax_mode.value).toBe('usn_d');
  });

  it('правка пользователем перебивает значение ассистента и меняет source', async () => {
    const pg = makePg({
      tax_mode: { value: 'osno', source: 'assistant', updated_at: '2026-08-01T00:00:00Z' },
    });
    const svc = new BusinessProfileService(pg);

    await svc.merge('u1', { tax_mode: 'usn_d' }, 'user');

    expect(pg._state.business.tax_mode.value).toBe('usn_d');
    expect(pg._state.business.tax_mode.source).toBe('user');
  });

  it('игнорирует неизвестные ключи и пустые значения', async () => {
    const pg = makePg({});
    const svc = new BusinessProfileService(pg);

    await svc.merge('u1', { nonsense: 'x', what: '   ' } as any, 'assistant');

    expect(pg._state.business).toEqual({});
  });

  it('отбрасывает значение вне enum-словаря', async () => {
    const pg = makePg({});
    const svc = new BusinessProfileService(pg);

    await svc.merge('u1', { tax_mode: 'выдуманный_режим' }, 'assistant');

    expect(pg._state.business.tax_mode).toBeUndefined();
  });

  it('missingFields перечисляет незаполненное', async () => {
    const pg = makePg({
      what: { value: 'студия', source: 'user', updated_at: 'x' },
    });
    const svc = new BusinessProfileService(pg);

    const missing = await svc.missingFields('u1');

    expect(missing).not.toContain('what');
    expect(missing).toContain('revenue');
    expect(missing).toHaveLength(7);
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx jest src/business-profile/business-profile.service.spec.ts`
Ожидаемо: FAIL, `Cannot find module './business-profile.service'`

- [ ] **Шаг 3: минимальная реализация**

`src/business-profile/business-profile.service.ts`:

```typescript
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import {
  BUSINESS_FIELDS,
  BusinessFieldKey,
  BusinessProfile,
  FieldSource,
  isBusinessProfileEmpty,
} from './business-profile.types';

const FIELD_BY_KEY = new Map(BUSINESS_FIELDS.map(f => [f.key as string, f]));

@Injectable()
export class BusinessProfileService {
  private readonly logger = new Logger(BusinessProfileService.name);

  constructor(@Optional() private readonly pg?: PgService) {}

  async read(userId: string): Promise<BusinessProfile> {
    if (!this.pg) return {};
    const res = await this.pg.query(
      `SELECT profile_data FROM ai_profiles_consolidated WHERE user_id = $1`,
      [userId],
    );
    return (res.rows[0]?.profile_data?.business as BusinessProfile) || {};
  }

  /** Ключи полей, которые ещё не заполнены. */
  async missingFields(userId: string): Promise<BusinessFieldKey[]> {
    const p = await this.read(userId);
    return BUSINESS_FIELDS
      .filter(f => !(p[f.key]?.value || '').trim())
      .map(f => f.key);
  }

  /**
   * Слить входящие значения в карточку.
   *
   * Правило не-затирания: при source='assistant' поля с source='user' не
   * трогаются. Без него автосбор постепенно съедает то, что человек
   * выверил руками, и карточка деградирует ниже уровня «вообще без
   * автосбора» — неверный tax_mode тихо отравляет ответы бухгалтера.
   */
  async merge(
    userId: string,
    incoming: Partial<Record<BusinessFieldKey, string>>,
    source: FieldSource,
  ): Promise<BusinessProfile> {
    if (!this.pg) return {};
    const current = await this.read(userId);
    const next: BusinessProfile = { ...current };
    const now = new Date().toISOString();
    let changed = false;

    for (const [rawKey, rawValue] of Object.entries(incoming || {})) {
      const spec = FIELD_BY_KEY.get(rawKey);
      if (!spec) continue;

      const value = String(rawValue ?? '').trim();
      if (!value) continue;

      // Мусор от модели в enum-поле отбрасываем: лучше пусто, чем ложь,
      // которую потом читает бухгалтер.
      if (spec.enum && !spec.enum.includes(value)) continue;

      const existing = next[spec.key];
      if (existing?.source === 'user' && source === 'assistant') continue;
      if (existing?.value === value && existing?.source === source) continue;

      next[spec.key] = { value, source, updated_at: now };
      changed = true;
    }

    if (!changed) return current;

    await this.pg.query(
      `UPDATE ai_profiles_consolidated
          SET updated_at = now(),
              profile_data = jsonb_set(
                COALESCE(profile_data, '{}'::jsonb), '{business}', $1::jsonb, true)
        WHERE user_id = $2`,
      [JSON.stringify(next), userId],
    );
    return next;
  }

  async isEmpty(userId: string): Promise<boolean> {
    return isBusinessProfileEmpty(await this.read(userId));
  }
}
```

- [ ] **Шаг 4: убедиться, что тест проходит**

Запустить: `npx jest src/business-profile/business-profile.service.spec.ts`
Ожидаемо: PASS, 7 тестов

- [ ] **Шаг 5: сверить имя колонки с живой базой**

Тест работает на моке и не докажет, что таблица и колонка названы верно. Проверить против реальной схемы:

```bash
ssh dvolkov@212.113.106.202 "cd ~/spirits_back && export \$(grep -E '^DATABASE_URL=' .env | xargs) && psql \"\$DATABASE_URL\" -c '\\d profiles'"
```

Ожидаемо: в выводе есть колонки `user_id` и `profile_data` (jsonb). Если названия другие — поправить SQL в `read` и `merge` и перезапустить тест.

- [ ] **Шаг 6: коммит**

```bash
git add src/business-profile/business-profile.service.ts src/business-profile/business-profile.service.spec.ts
git commit -m "feat(business-profile): чтение, запись и защита пользовательских правок"
```

---

## Задача 4: рендер блока для промпта

Два формата: полная карточка для `category='business'`, одна строка для всех прочих.

**Файлы:**
- Изменить: `src/business-profile/business-profile.service.ts`
- Тест: `src/business-profile/render-for-prompt.spec.ts`

- [ ] **Шаг 1: написать падающий тест**

`src/business-profile/render-for-prompt.spec.ts`:

```typescript
import { BusinessProfileService } from './business-profile.service';
import { BusinessProfile } from './business-profile.types';

const FULL: BusinessProfile = {
  what:       { value: 'студия маникюра, 2 точки в Казани', source: 'user', updated_at: 'x' },
  legal_form: { value: 'ip', source: 'user', updated_at: 'x' },
  tax_mode:   { value: 'usn_d', source: 'user', updated_at: 'x' },
  stage:      { value: 'stable', source: 'assistant', updated_at: 'x' },
  revenue:    { value: '1m_3m', source: 'assistant', updated_at: 'x' },
  team:       { value: '4 мастера + администратор', source: 'assistant', updated_at: 'x' },
  customers:  { value: 'B2C, женщины 25-45', source: 'assistant', updated_at: 'x' },
};

function svcWith(profile: BusinessProfile) {
  const pg = {
    query: jest.fn(async () => ({ rows: [{ profile_data: { business: profile } }] })),
  } as any;
  return new BusinessProfileService(pg);
}

describe('renderForPrompt', () => {
  it('для business отдаёт полный блок с человекочитаемыми enum', async () => {
    const out = await svcWith(FULL).renderForPrompt('u1', 'business');

    expect(out).toContain('Business profile:');
    expect(out).toContain('студия маникюра, 2 точки в Казани');
    expect(out).toContain('ИП');            // не 'ip'
    expect(out).toContain('УСН Доходы');    // не 'usn_d'
    expect(out).toContain('1–3 млн ₽/мес'); // не '1m_3m'
  });

  it('для business перечисляет незаполненное', async () => {
    const out = await svcWith(FULL).renderForPrompt('u1', 'business');
    expect(out).toContain('Not filled in');
    expect(out).toContain('Current focus');
  });

  it('когда заполнено всё, строки про незаполненное нет', async () => {
    const out = await svcWith({
      ...FULL,
      focus: { value: 'кассовый разрыв', source: 'user', updated_at: 'x' },
    }).renderForPrompt('u1', 'business');
    expect(out).not.toContain('Not filled in');
  });

  it('для personal отдаёт одну строку без цифр', async () => {
    const out = await svcWith(FULL).renderForPrompt('u1', 'personal');

    expect(out.trim().split('\n')).toHaveLength(1);
    expect(out).toContain('студия маникюра');
    expect(out).not.toContain('УСН');
    expect(out).not.toContain('млн');
    expect(out).not.toContain('1m_3m');
  });

  it('для assistant и для кастомных ассистентов — тоже строка', async () => {
    for (const cat of ['assistant', 'custom', null, undefined] as any[]) {
      const out = await svcWith(FULL).renderForPrompt('u1', cat);
      expect(out.trim().split('\n')).toHaveLength(1);
      expect(out).not.toContain('УСН');
    }
  });

  it('пустая карточка не даёт ничего ни в одном режиме', async () => {
    expect(await svcWith({}).renderForPrompt('u1', 'business')).toBe('');
    expect(await svcWith({}).renderForPrompt('u1', 'personal')).toBe('');
  });

  it('карточка без what не даёт строку-резюме — резюмировать нечего', async () => {
    const out = await svcWith({
      tax_mode: { value: 'usn_d', source: 'user', updated_at: 'x' },
    }).renderForPrompt('u1', 'personal');
    expect(out).toBe('');
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx jest src/business-profile/render-for-prompt.spec.ts`
Ожидаемо: FAIL, `svc.renderForPrompt is not a function`

- [ ] **Шаг 3: добавить метод в сервис**

В `src/business-profile/business-profile.service.ts` дописать импорт `renderEnum` и метод:

```typescript
import {
  BUSINESS_FIELDS,
  BusinessFieldKey,
  BusinessProfile,
  FieldSource,
  isBusinessProfileEmpty,
  renderEnum,
} from './business-profile.types';
```

```typescript
  /**
   * Блок для системного промпта.
   *
   * Лейблы английские — как соседний блок `User profile:` в chat.service.
   * Переводить их на семь локалей не нужно: русский хвост промпта уже
   * однажды заставил ассистента отвечать по-русски аккаунту с language=en,
   * и повторять эту ошибку большим блоком незачем.
   *
   * Единственная точка рендера на все три пути сборки промпта. В
   * chat.service.ts на строке 1643 стоит комментарий о том, что сборка уже
   * продублирована трижды — это предупреждение, а не наблюдение.
   */
  async renderForPrompt(userId: string, category: string | null | undefined): Promise<string> {
    const p = await this.read(userId);
    if (isBusinessProfileEmpty(p)) return '';

    if (category !== 'business') {
      // Психологу и коучу полезно знать, что человек ведёт дело, но оборот
      // и налоговый режим им не нужны — только суть и размер команды.
      const what = (p.what?.value || '').trim();
      if (!what) return '';
      const team = (p.team?.value || '').trim();
      return team
        ? `Пользователь ведёт свой бизнес — ${what}; команда: ${team}.`
        : `Пользователь ведёт свой бизнес — ${what}.`;
    }

    const lines: string[] = ['Business profile:'];
    const missing: string[] = [];

    for (const f of BUSINESS_FIELDS) {
      const raw = (p[f.key]?.value || '').trim();
      if (!raw) {
        missing.push(f.promptLabel);
        continue;
      }
      lines.push(`${f.promptLabel}: ${renderEnum(f.key, raw)}`);
    }

    if (missing.length > 0) {
      lines.push(`Not filled in: ${missing.join(', ')}.`);
    }

    return lines.join('\n');
  }
```

- [ ] **Шаг 4: убедиться, что тест проходит**

Запустить: `npx jest src/business-profile/render-for-prompt.spec.ts`
Ожидаемо: PASS, 7 тестов

- [ ] **Шаг 5: коммит**

```bash
git add src/business-profile/business-profile.service.ts src/business-profile/render-for-prompt.spec.ts
git commit -m "feat(business-profile): рендер блока для промпта — полный и строка-резюме"
```

---

## Задача 5: извлечение фактов из хода разговора

**Файлы:**
- Изменить: `src/business-profile/business-profile.service.ts`
- Тест: `src/business-profile/extract-from-turn.spec.ts`

- [ ] **Шаг 1: написать падающий тест**

`src/business-profile/extract-from-turn.spec.ts`:

```typescript
import { BusinessProfileService } from './business-profile.service';

function make(opts: { claudeReply?: string; profile?: any } = {}) {
  const state: any = { business: opts.profile || {} };
  const pg = {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (/SELECT/i.test(sql)) return { rows: [{ profile_data: { business: state.business } }] };
      state.business = JSON.parse(params[0]);
      return { rows: [] };
    }),
  } as any;
  const claudeCli = {
    text: jest.fn(async () => opts.claudeReply ?? '{"fields":{}}'),
  } as any;
  return { svc: new BusinessProfileService(pg, claudeCli), pg, claudeCli, state };
}

describe('extractFromTurn', () => {
  it('пишет извлечённые поля с source=assistant', async () => {
    const { svc, state } = make({ claudeReply: '{"fields":{"legal_form":"ip","tax_mode":"usn_d"}}' });

    await svc.extractFromTurn('u1', '10', 'у меня ИП на УСН доходы', 'Понял, тогда...');

    expect(state.business.legal_form.value).toBe('ip');
    expect(state.business.legal_form.source).toBe('assistant');
    expect(state.business.tax_mode.value).toBe('usn_d');
  });

  it('не зовёт LLM, когда префильтр срезал реплику', async () => {
    const { svc, claudeCli } = make();

    await svc.extractFromTurn('u1', '10', 'спасибо, всё понятно', 'Пожалуйста!');

    expect(claudeCli.text).not.toHaveBeenCalled();
  });

  it('переживает невалидный JSON от модели и ничего не пишет', async () => {
    const { svc, state } = make({ claudeReply: 'извините, не могу' });

    await svc.extractFromTurn('u1', '10', 'у меня ИП', 'Ага');

    expect(state.business).toEqual({});
  });

  it('переживает падение LLM-вызова и не бросает наружу', async () => {
    const { svc } = make();
    (svc as any).claudeCli.text = jest.fn(async () => { throw new Error('relay down'); });

    await expect(
      svc.extractFromTurn('u1', '10', 'у меня ИП', 'Ага'),
    ).resolves.toBeUndefined();
  });

  it('снимает markdown-обёртку вокруг JSON', async () => {
    const { svc, state } = make({ claudeReply: '```json\n{"fields":{"legal_form":"ooo"}}\n```' });

    await svc.extractFromTurn('u1', '10', 'мы ООО', 'Понял');

    expect(state.business.legal_form.value).toBe('ooo');
  });

  it('не трогает поле, выставленное пользователем', async () => {
    const { svc, state } = make({
      claudeReply: '{"fields":{"tax_mode":"osno"}}',
      profile: { tax_mode: { value: 'usn_d', source: 'user', updated_at: 'x' } },
    });

    await svc.extractFromTurn('u1', '10', 'у нас УСН вроде', 'Уточню');

    expect(state.business.tax_mode.value).toBe('usn_d');
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx jest src/business-profile/extract-from-turn.spec.ts`
Ожидаемо: FAIL, `svc.extractFromTurn is not a function`

- [ ] **Шаг 3: реализация**

В `src/business-profile/business-profile.service.ts` добавить импорты и параметр конструктора:

```typescript
import { ClaudeCliService } from '../common/services/claude-cli.service';
import { shouldSkipBusinessExtraction } from './extract-prefilter';
```

```typescript
  constructor(
    @Optional() private readonly pg?: PgService,
    @Optional() private readonly claudeCli?: ClaudeCliService,
  ) {}
```

И метод:

```typescript
  /**
   * Достать факты о бизнесе из одного хода разговора.
   *
   * Отдельный LLM-вызов, а не расширение TasksService.extractFromTurn:
   * у извлечения задач нет ни одного теста и нет golden-набора, так что
   * просадку его качества от подселения второй задачи никто бы не заметил.
   *
   * Вызывать в setImmediate после ответа. Никогда не бросает наружу:
   * ход пользователя не должен падать из-за необязательной памяти.
   */
  async extractFromTurn(
    userId: string,
    agentId: string,
    userMessage: string,
    assistantMessage: string,
  ): Promise<void> {
    if (!this.pg || !this.claudeCli) return;
    if (shouldSkipBusinessExtraction(userMessage)) return;

    try {
      const missing = await this.missingFields(userId);
      if (missing.length === 0) return;

      const raw = await this.claudeCli.text(this.buildExtractPrompt(missing, userMessage, assistantMessage));
      const parsed = this.parseJson(raw);
      const fields = parsed?.fields;
      if (!fields || typeof fields !== 'object') return;

      await this.merge(userId, fields, 'assistant');
    } catch (e: any) {
      this.logger.warn(`business extractFromTurn failed for ${userId}/${agentId}: ${e?.message}`);
    }
  }

  private buildExtractPrompt(missing: BusinessFieldKey[], userMessage: string, assistantMessage: string): string {
    const specs = BUSINESS_FIELDS
      .filter(f => missing.includes(f.key))
      .map(f => f.enum
        ? `- ${f.key}: одно из ${f.enum.join(' | ')}`
        : `- ${f.key}: короткая строка, словами пользователя`)
      .join('\n');

    return `Ты ведёшь карточку бизнеса пользователя платформы my.linkeon.io.

Прочитай один ход разговора и вытащи только те факты о ЕГО СОБСТВЕННОМ бизнесе, которые он сообщил прямо.

НЕЗАПОЛНЕННЫЕ ПОЛЯ (только их и заполняй):
${specs}

РЕПЛИКА ПОЛЬЗОВАТЕЛЯ:
"""
${userMessage.slice(0, 3000)}
"""

ОТВЕТ АССИСТЕНТА:
"""
${assistantMessage.slice(0, 3000)}
"""

ПРАВИЛА:
- Только то, что пользователь сказал о себе. Не додумывай, не выводи по косвенным признакам, не бери из слов ассистента.
- Гипотеза — это не факт. Сомневаешься — не заполняй. Пустой ответ лучше выдуманного.
- Для полей со списком значений верни РОВНО один код из списка. Не подходит ни один — поле пропусти.
- Чужой бизнес, работодатель, планы «когда-нибудь открою» — не считаются.

Верни ТОЛЬКО валидный JSON, без markdown-обёрток и без прозы:
{"fields": {"ключ": "значение"}}

Нечего извлечь — верни {"fields": {}}`;
  }

  /** Толерантный парсер: модель периодически заворачивает JSON в ```json. */
  private parseJson(raw: string): any | null {
    if (!raw) return null;
    const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
```

- [ ] **Шаг 4: убедиться, что тест проходит**

Запустить: `npx jest src/business-profile/extract-from-turn.spec.ts`
Ожидаемо: PASS, 6 тестов

- [ ] **Шаг 5: коммит**

```bash
git add src/business-profile/business-profile.service.ts src/business-profile/extract-from-turn.spec.ts
git commit -m "feat(business-profile): извлечение фактов из хода разговора"
```

---

## Задача 6: модуль и HTTP-эндпоинты

**Файлы:**
- Создать: `src/business-profile/business-profile.controller.ts`
- Создать: `src/business-profile/business-profile.module.ts`
- Изменить: `src/app.module.ts`
- Тест: `src/business-profile/business-profile.controller.spec.ts`

- [ ] **Шаг 1: написать падающий тест**

`src/business-profile/business-profile.controller.spec.ts`:

```typescript
import { BusinessProfileController } from './business-profile.controller';

function res() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}

describe('BusinessProfileController', () => {
  it('GET отдаёт карточку и флаг видимости', async () => {
    const svc = {
      read: jest.fn(async () => ({ what: { value: 'студия', source: 'user', updated_at: 'x' } })),
      hasBusinessHistory: jest.fn(async () => false),
    } as any;
    const r = res();

    await new BusinessProfileController(svc).get({ user: { userId: 'u1' } } as any, r);

    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({
      profile: { what: { value: 'студия', source: 'user', updated_at: 'x' } },
      visible: true,
    });
  });

  it('GET: пустая карточка + история с бизнес-ассистентом = блок показываем', async () => {
    const svc = {
      read: jest.fn(async () => ({})),
      hasBusinessHistory: jest.fn(async () => true),
    } as any;
    const r = res();

    await new BusinessProfileController(svc).get({ user: { userId: 'u1' } } as any, r);

    expect(r.json).toHaveBeenCalledWith({ profile: {}, visible: true });
  });

  it('GET: пусто и истории нет — блок скрываем', async () => {
    const svc = {
      read: jest.fn(async () => ({})),
      hasBusinessHistory: jest.fn(async () => false),
    } as any;
    const r = res();

    await new BusinessProfileController(svc).get({ user: { userId: 'u1' } } as any, r);

    expect(r.json).toHaveBeenCalledWith({ profile: {}, visible: false });
  });

  it('POST пишет с source=user', async () => {
    const svc = { merge: jest.fn(async () => ({ ok: true })) } as any;
    const r = res();

    await new BusinessProfileController(svc).update(
      { user: { userId: 'u1' } } as any, { fields: { tax_mode: 'usn_d' } }, r,
    );

    expect(svc.merge).toHaveBeenCalledWith('u1', { tax_mode: 'usn_d' }, 'user');
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it('без userId отдаёт 401', async () => {
    const svc = { read: jest.fn(), hasBusinessHistory: jest.fn() } as any;
    const r = res();

    await new BusinessProfileController(svc).get({ user: {} } as any, r);

    expect(r.status).toHaveBeenCalledWith(401);
    expect(svc.read).not.toHaveBeenCalled();
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx jest src/business-profile/business-profile.controller.spec.ts`
Ожидаемо: FAIL, `Cannot find module './business-profile.controller'`

- [ ] **Шаг 3: добавить `hasBusinessHistory` в сервис**

В `src/business-profile/business-profile.service.ts`:

```typescript
  /**
   * Заходил ли пользователь хоть раз к business-ассистенту.
   *
   * Нужно фронту, чтобы решить, показывать блок карточки. Разбор истории
   * держим на бэке: фронт не должен знать про категории агентов.
   *
   * У custom_chat_history НЕТ колонки user_id — связь с пользователем идёт
   * через session_id вида `{userId}_{assistantId}` (см. chat.service.ts:431
   * и profile.service.ts, где удаление ходит тем же LIKE). Колонка агента
   * называется `agent` и она integer, а не текстовый `agent_id`.
   */
  async hasBusinessHistory(userId: string): Promise<boolean> {
    if (!this.pg) return false;
    const res = await this.pg.query(
      `SELECT 1
         FROM custom_chat_history h
         JOIN agents a ON a.id = h.agent
        WHERE h.session_id LIKE $1 AND a.category = 'business'
        LIMIT 1`,
      [`${userId}_%`],
    );
    return res.rows.length > 0;
  }
```

- [ ] **Шаг 4: написать контроллер**

`src/business-profile/business-profile.controller.ts`:

```typescript
import { Body, Controller, Get, Post, Req, Res, UseGuards, Optional } from '@nestjs/common';
import { Response } from 'express';
import { JwtGuard } from '../common/guards/jwt.guard';
import { BusinessProfileService } from './business-profile.service';

/**
 * Отдельные эндпоинты, а не расширение /webhook/profile-update.
 *
 * Причина не в чистоте: profile-update по своей семантике шлёт объект
 * целиком и перезаписывает, а правило «не затирать правки пользователя»
 * должно жить в одной серверной точке.
 */
@Controller('')
export class BusinessProfileController {
  constructor(@Optional() private readonly svc?: BusinessProfileService) {}

  @Get('business-profile')
  @UseGuards(JwtGuard)
  async get(@Req() req: any, @Res() r: Response) {
    if (!this.svc) return r.status(503).json({ error: 'business profile service not configured' });
    const userId: string = req.user?.userId;
    if (!userId) return r.status(401).json({ error: 'unauthorized' });

    const [profile, hasHistory] = await Promise.all([
      this.svc.read(userId),
      this.svc.hasBusinessHistory(userId),
    ]);
    const filled = Object.values(profile).some(f => (f?.value || '').trim());
    return r.status(200).json({ profile, visible: filled || hasHistory });
  }

  @Post('business-profile')
  @UseGuards(JwtGuard)
  async update(@Req() req: any, @Body() body: any, @Res() r: Response) {
    if (!this.svc) return r.status(503).json({ error: 'business profile service not configured' });
    const userId: string = req.user?.userId;
    if (!userId) return r.status(401).json({ error: 'unauthorized' });

    const profile = await this.svc.merge(userId, body?.fields || {}, 'user');
    return r.status(200).json({ profile });
  }
}
```

- [ ] **Шаг 5: написать модуль**

`src/business-profile/business-profile.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common';
import { BusinessProfileService } from './business-profile.service';
import { BusinessProfileController } from './business-profile.controller';

// @Global — как TasksModule: ChatService зовёт сервис, не импортируя модуль.
@Global()
@Module({
  controllers: [BusinessProfileController],
  providers: [BusinessProfileService],
  exports: [BusinessProfileService],
})
export class BusinessProfileModule {}
```

- [ ] **Шаг 6: зарегистрировать модуль**

В `src/app.module.ts` добавить импорт и запись в массив `imports`:

```typescript
import { BusinessProfileModule } from './business-profile/business-profile.module';
```

Найти в массиве `imports` строку `TasksModule,` и добавить следом:

```typescript
    BusinessProfileModule,
```

- [ ] **Шаг 7: убедиться, что тесты проходят и приложение поднимается**

Запустить: `npx jest src/business-profile`
Ожидаемо: PASS, все файлы

Запустить: `npx tsc --noEmit -p tsconfig.json`
Ожидаемо: без ошибок

- [ ] **Шаг 8: проверить запрос против живой базы**

Схема уже сверена: `custom_chat_history` — `session_id text`, `agent integer`, колонки `user_id` нет. Но сам JOIN надо прогнать, а не поверить в него:

```bash
ssh dvolkov@212.113.106.202 "cd ~/spirits_back && export \$(grep -E '^DATABASE_URL=' .env | xargs) && psql \"\$DATABASE_URL\" -tAc \"SELECT count(*) FROM custom_chat_history h JOIN agents a ON a.id = h.agent WHERE h.session_id LIKE '79030169187_%' AND a.category = 'business'\""
```

`79030169187` — тестовый админ-аккаунт. Ожидаемо: запрос выполняется без ошибки и отдаёт число. Ноль — тоже валидный ответ (значит этот аккаунт к бизнес-ассистентам не ходил); важно, что нет ошибки про несуществующую колонку. Для контроля прогнать тот же запрос без условия `a.category` — если и там ноль, взять другой userId из `SELECT DISTINCT split_part(session_id,'_',1) FROM custom_chat_history LIMIT 5`.

- [ ] **Шаг 9: коммит**

```bash
git add src/business-profile/ src/app.module.ts
git commit -m "feat(business-profile): модуль и эндпоинты GET/POST /webhook/business-profile"
```

---

## Задача 7: инъекция карточки в промпт — все три пути

Самое опасное место плана. В `chat.service.ts` три независимых сборки промпта, и профиль подставляется в каждой отдельно. Пропустить любую — значит, что часть ассистентов молча не увидит карточку.

**Файлы:**
- Изменить: `src/chat/chat.service.ts`
- Тест: `src/chat/business-profile-injection.spec.ts`

- [ ] **Шаг 1: найти все три места и убедиться, что их ровно три**

```bash
grep -n "User profile:\|--- Профиль пользователя ---" src/chat/chat.service.ts
```

Ожидаемо: ровно три совпадения — примерно строки 578 (Маша), 974 (`streamUniversalAgent`), 1640 (`generateAgentReply`). Если совпадений больше или меньше — код разошёлся с планом, разобраться до правок.

- [ ] **Шаг 2: написать падающий тест**

`src/chat/business-profile-injection.spec.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

/**
 * Структурный тест: карточка должна попадать во ВСЕ места сборки промпта.
 *
 * Обычным юнит-тестом это не поймать — streamUniversalAgent не вызвать без
 * половины приложения. Но пропуск одного из трёх путей и есть основной
 * риск задачи: код при этом работает, просто часть ассистентов слепа.
 * Поэтому проверяем текстом файла.
 */
describe('инъекция бизнес-карточки в сборку промпта', () => {
  const src = fs.readFileSync(path.join(__dirname, 'chat.service.ts'), 'utf8');

  it('профиль пользователя подставляется ровно в трёх местах', () => {
    const matches = src.match(/User profile:|--- Профиль пользователя ---/g) || [];
    expect(matches).toHaveLength(3);
  });

  it('рядом с каждой подстановкой профиля зовётся renderForPrompt', () => {
    const calls = src.match(/renderForPrompt\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it('категория агента доезжает до streamUniversalAgent', () => {
    expect(src).toMatch(/a\.category|agent\.category/);
  });

  it('извлечение бизнес-фактов зовётся везде, где зовётся извлечение задач', () => {
    const tasks = (src.match(/tasksService\.extractFromTurn\(/g) || []).length;
    const business = (src.match(/businessProfile\.extractFromTurn\(/g) || []).length;
    expect(business).toBe(tasks);
  });
});
```

- [ ] **Шаг 3: убедиться, что тест падает**

Запустить: `npx jest src/chat/business-profile-injection.spec.ts`
Ожидаемо: FAIL на втором тесте — `renderForPrompt` в файле пока нет

- [ ] **Шаг 4: внедрить сервис в ChatService**

В `src/chat/chat.service.ts` добавить импорт:

```typescript
import { BusinessProfileService } from '../business-profile/business-profile.service';
```

В `constructor` (начинается на строке ~253) добавить параметр последним — по образцу того, как там уже объявлен `tasksService`:

```typescript
    @Optional() private readonly businessProfile?: BusinessProfileService,
```

Проверить, что `Optional` есть в импорте из `@nestjs/common` в шапке файла; если нет — добавить.

- [ ] **Шаг 5: протащить `category` до `streamUniversalAgent`**

В SQL-выборке агента (~536) добавить колонку. Было:

```typescript
      `SELECT a.name,
              COALESCE(t.display_name, a.display_name, a.name) AS display_name,
              COALESCE(t.description, a.description)           AS description,
              a.system_prompt
```

Стало:

```typescript
      `SELECT a.name,
              COALESCE(t.display_name, a.display_name, a.name) AS display_name,
              COALESCE(t.description, a.description)           AS description,
              a.system_prompt,
              a.category
```

В вызове `streamUniversalAgent` (~520) добавить аргумент последним:

```typescript
        req, fresh, chatSessionId, requestLang, clientTz, balanceBlock,
        agent.category,
```

В сигнатуре `streamUniversalAgent` (~799) добавить параметр последним:

```typescript
    agentCategory?: string | null,
```

- [ ] **Шаг 6: вставить карточку во все три места**

**Путь 1 — `streamUniversalAgent`, сразу после блока `User profile:` (~974):**

```typescript
    if (profileText && profileText.trim()) {
      contextPrefix += `User profile:\n${profileText}\n\n`;
    }
    // Бизнес-карточка: общее знание о деле пользователя для всех ассистентов.
    // Полная у category='business', одна строка у остальных — решает сервис.
    if (this.businessProfile) {
      try {
        const biz = await this.businessProfile.renderForPrompt(userId, agentCategory);
        if (biz) contextPrefix += biz + '\n\n';
      } catch (e: any) {
        this.logger.warn(`business profile injection failed: ${e?.message}`);
      }
    }
```

**Путь 2 — ветка Маши, сразу после блока `--- Профиль пользователя ---` (~578):**

```typescript
    let volatileSystemPrompt = (profileText && profileText.trim())
      ? `\n\n--- Профиль пользователя ---\n${profileText}`
      : '';
    if (this.businessProfile) {
      try {
        // Маша — personal, получит строку-резюме, а не полную карточку.
        const biz = await this.businessProfile.renderForPrompt(userId, agent.category);
        if (biz) volatileSystemPrompt += `\n\n${biz}`;
      } catch (e: any) {
        this.logger.warn(`business profile injection failed (Маша): ${e?.message}`);
      }
    }
```

**Путь 3 — `generateAgentReply`, после блока `User profile:` (~1640):**

Сначала добавить `a.category` в выборку агента этой функции (найти запрос над строкой 1625 и дописать колонку), затем:

```typescript
    if (profileText && profileText.trim()) {
      prefix += `User profile:\n${profileText}\n\n`;
    }
    if (this.businessProfile) {
      try {
        const biz = await this.businessProfile.renderForPrompt(userId, agent.category);
        if (biz) prefix += biz + '\n\n';
      } catch (e: any) {
        this.logger.warn(`business profile injection failed (agent reply): ${e?.message}`);
      }
    }
```

- [ ] **Шаг 7: проверить, что тест проходит и типы сходятся**

Запустить: `npx jest src/chat/business-profile-injection.spec.ts`
Ожидаемо: PASS, первые три теста; четвёртый (про `extractFromTurn`) ещё падает — его закрывает задача 8

Запустить: `npx tsc --noEmit -p tsconfig.json`
Ожидаемо: без ошибок

- [ ] **Шаг 8: коммит**

```bash
git add src/chat/chat.service.ts src/chat/business-profile-injection.spec.ts
git commit -m "feat(business-profile): карточка в промпте во всех трёх путях сборки"
```

---

## Задача 8: вызов извлечения после хода

**Файлы:**
- Изменить: `src/chat/chat.service.ts`
- Тест: `src/chat/business-profile-injection.spec.ts` (уже написан в задаче 7)

- [ ] **Шаг 1: найти все точки вызова извлечения задач**

```bash
grep -n "tasksService.extractFromTurn" src/chat/chat.service.ts
```

Ожидаемо: три совпадения — примерно строки 737, 1170, 1701.

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx jest src/chat/business-profile-injection.spec.ts -t "извлечение бизнес-фактов"`
Ожидаемо: FAIL, `Expected: 3, Received: 0`

- [ ] **Шаг 3: добавить вызов рядом с каждым из трёх**

В каждом из трёх мест, сразу за строкой с `tasksService.extractFromTurn`, добавить парную. Пример для первого места (~737):

```typescript
        if (this.tasksService && !fresh) {
          try { await this.tasksService.extractFromTurn(userId, String(assistantId), message, fullText); } catch {}
        }
        // Бизнес-карточка наполняется тем же поводом, что и задачи, но своим
        // вызовом: у извлечения задач нет тестов, и подселять к нему вторую
        // задачу — значит не заметить его просадку.
        if (this.businessProfile && !fresh) {
          try { await this.businessProfile.extractFromTurn(userId, String(assistantId), message, fullText); } catch {}
        }
```

Во втором месте (~1170) — те же имена переменных. В третьем (`consolidateAfterChatPublic`, ~1701) переменные называются `agentId`, `userMessage`, `assistantResponse`, и флага `fresh` там нет:

```typescript
      try { await this.tasksService.extractFromTurn(userId, agentId, userMessage, assistantResponse); } catch {}
      if (this.businessProfile) {
        try { await this.businessProfile.extractFromTurn(userId, agentId, userMessage, assistantResponse); } catch {}
      }
```

- [ ] **Шаг 4: проверить**

Запустить: `npx jest src/chat/business-profile-injection.spec.ts`
Ожидаемо: PASS, 4 теста

Запустить: `npx tsc --noEmit -p tsconfig.json`
Ожидаемо: без ошибок

- [ ] **Шаг 5: коммит**

```bash
git add src/chat/chat.service.ts
git commit -m "feat(business-profile): извлечение фактов во всех трёх точках после хода"
```

---

## Задача 9: golden-набор на извлечение

Двадцать реальных ходов, размеченных руками. Половина должна дать поля, половина — ничего.

**Файлы:**
- Создать: `src/business-profile/golden-turns.ts`
- Тест: `src/business-profile/golden-extraction.spec.ts`

- [ ] **Шаг 1: собрать материал из живой базы**

```bash
ssh dvolkov@212.113.106.202 "cd ~/spirits_back && export \$(grep -E '^DATABASE_URL=' .env | xargs) && psql \"\$DATABASE_URL\" -tAc \"SELECT left(h.content, 300) FROM custom_chat_history h JOIN agents a ON a.id::text = h.agent_id WHERE a.category='business' AND h.message_type='user' AND length(h.content) BETWEEN 40 AND 300 ORDER BY h.created_at DESC LIMIT 60\""
```

Из выдачи отобрать двадцать реплик: десять с явными фактами о бизнесе, десять без. Обезличить — вырезать имена, названия компаний, телефоны, суммы, привязывающие к конкретному человеку.

- [ ] **Шаг 2: записать набор**

`src/business-profile/golden-turns.ts`:

```typescript
/**
 * Размеченные вручную ходы для проверки извлечения.
 *
 * Реплики взяты из прода и обезличены. Половина набора — negative-кейсы:
 * зелёный результат только на positive ничего не доказывает, а на этом
 * проекте уже была серия ложно-зелёных проверок из-за односторонних тестов.
 *
 * expected: {} означает «не должно извлечься ничего».
 */
export interface GoldenTurn {
  user: string;
  assistant: string;
  expected: Record<string, string>;
}

export const GOLDEN_TURNS: GoldenTurn[] = [
  // Две записи задают форму. Остальные восемнадцать — из выдачи шага 1.
  {
    user: 'У меня ИП на УСН доходы, студия маникюра, два мастера пока',
    assistant: 'Понял. При УСН Доходы ставка обычно 6%, и взносы уменьшают налог.',
    expected: { legal_form: 'ip', tax_mode: 'usn_d', what: 'студия маникюра' },
  },
  {
    user: 'Спасибо, теперь понятно, попробую так и сделать',
    assistant: 'Отлично, если что — возвращайтесь.',
    expected: {},
  },
];
```

Восемнадцать оставшихся записей берутся из выдачи шага 1: девять с непустым `expected`, девять с пустым. Тест ниже падает, пока набор не набран и не сбалансирован, так что оставить как есть не получится.

Значения `expected` для enum-полей — только коды из словарей (`ip`, `usn_d`, …), для свободных полей — короткая строка словами пользователя.

- [ ] **Шаг 3: написать тест**

`src/business-profile/golden-extraction.spec.ts`:

```typescript
import { GOLDEN_TURNS } from './golden-turns';
import { shouldSkipBusinessExtraction } from './extract-prefilter';

describe('golden-набор извлечения', () => {
  it('набор заполнен и сбалансирован', () => {
    expect(GOLDEN_TURNS.length).toBeGreaterThanOrEqual(20);
    const positive = GOLDEN_TURNS.filter(t => Object.keys(t.expected).length > 0);
    const negative = GOLDEN_TURNS.filter(t => Object.keys(t.expected).length === 0);
    expect(positive.length).toBeGreaterThanOrEqual(10);
    expect(negative.length).toBeGreaterThanOrEqual(10);
  });

  it('префильтр не срезает ни одного хода, из которого надо извлечь факт', () => {
    const wronglySkipped = GOLDEN_TURNS
      .filter(t => Object.keys(t.expected).length > 0)
      .filter(t => shouldSkipBusinessExtraction(t.user));
    expect(wronglySkipped.map(t => t.user)).toEqual([]);
  });

  it('префильтр срезает большинство ходов без фактов', () => {
    const negative = GOLDEN_TURNS.filter(t => Object.keys(t.expected).length === 0);
    const skipped = negative.filter(t => shouldSkipBusinessExtraction(t.user));
    // Не 100%: часть попадёт в LLM и там отсеется. Но если префильтр
    // пропускает почти всё, он не выполняет свою работу — экономить вызовы.
    expect(skipped.length / negative.length).toBeGreaterThanOrEqual(0.6);
  });
});
```

- [ ] **Шаг 4: прогнать и подкрутить префильтр**

Запустить: `npx jest src/business-profile/golden-extraction.spec.ts`
Ожидаемо: PASS. Если второй тест красный — в `BUSINESS_MARKERS` не хватает оборота из реальной речи, добавить его. Если третий красный — маркеры слишком широкие, сузить.

- [ ] **Шаг 5: коммит**

```bash
git add src/business-profile/golden-turns.ts src/business-profile/golden-extraction.spec.ts src/business-profile/extract-prefilter.ts
git commit -m "test(business-profile): golden-набор из двадцати размеченных ходов"
```

---

## Задача 10: удаление аккаунта уносит карточку

Карточка — персональные данные о юрлице. Она лежит внутри `profile_data`, поэтому должна уходить вместе с аккаунтом, но это надо доказать, а не предположить.

**Уже установленные факты** (сверено с прод-базой и кодом, повторно выяснять не нужно):

- Таблица профилей — `ai_profiles_consolidated`, не `profiles`.
- `ProfileService.deleteProfile` (`src/profile/profile.service.ts:167`) строку **не удаляет**, а делает `UPDATE ai_profiles_consolidated SET profile_data = '{}', … WHERE user_id = $1`. Карточку это стирает, но проверять надо именно поведение, а не текст SQL.
- В репозитории **уже есть** `src/profile/account-deletion.spec.ts` с моделью базы `FakeDb`. Его комментарий прямо формулирует принцип: «Здесь не проверяется текст SQL: он может быть любым, важно наблюдаемое поведение». Новый тест дописывается туда же и следует тому же принципу.
- `FakeDb` сейчас `ai_profiles_consolidated` не моделирует — неизвестные запросы падают в `return { rows: [] }`. Значит модель надо расширить, иначе тест окажется ложно-зелёным: он «пройдёт» на базе, которая вообще ничего не хранит.

**Файлы:**
- Изменить: `src/profile/account-deletion.spec.ts`

- [ ] **Шаг 1: расширить модель базы**

В классе `FakeDb` добавить поле рядом с `users` и `identities`:

```typescript
  /** user_id → profile_data. Моделирует ai_profiles_consolidated. */
  profiles = new Map<string, any>();
```

И три ветки в `query`, **выше** финального `return { rows: [] }`:

```typescript
    if (s.startsWith('SELECT profile_data FROM ai_profiles_consolidated')) {
      const p = this.profiles.get(params[0]);
      return { rows: p ? [{ profile_data: p }] : [] };
    }
    if (s.startsWith("UPDATE ai_profiles_consolidated SET profile_data = '{}'")) {
      if (this.profiles.has(params[0])) this.profiles.set(params[0], {});
      return { rows: [] };
    }
    if (s.startsWith('UPDATE ai_profiles_consolidated SET updated_at')) {
      // merge: jsonb_set(profile_data, '{business}', $1)
      const prev = this.profiles.get(params[1]) || {};
      this.profiles.set(params[1], { ...prev, business: JSON.parse(params[0]) });
      return { rows: [] };
    }
```

Порядок веток важен: обе `UPDATE ai_profiles_consolidated` начинаются одинаково, поэтому различай их по продолжению строки, как сделано выше.

- [ ] **Шаг 2: написать падающий тест**

В конец `describe('удаление аккаунта', …)` в `src/profile/account-deletion.spec.ts` добавить, не трогая существующие тесты:

```typescript
  it('уносит бизнес-карточку — она персональные данные о юрлице', async () => {
    const userId = 'u-biz-1';
    db.profiles.set(userId, {});
    const business = new BusinessProfileService(db as any);

    await business.merge(userId, { what: 'студия маникюра', tax_mode: 'usn_d' }, 'user');
    // Убеждаемся, что до удаления карточка действительно есть: иначе тест
    // «после удаления пусто» прошёл бы и на пустой с самого начала базе.
    expect(await business.read(userId)).toMatchObject({
      what: { value: 'студия маникюра' },
    });

    await profile.deleteProfile(userId);

    expect(await business.read(userId)).toEqual({});
  });
```

И импорт в шапку файла:

```typescript
import { BusinessProfileService } from '../business-profile/business-profile.service';
```

- [ ] **Шаг 3: убедиться, что тест падает по правильной причине**

Сначала прогнать **до** правки `FakeDb` (шаг 1) — тест должен упасть на первом `expect`, потому что модель ничего не хранит. Это доказывает, что проверка «после удаления пусто» без расширения модели была бы ложно-зелёной.

Запустить: `npx jest src/profile/account-deletion.spec.ts`

Затем применить шаг 1 и прогнать снова.

- [ ] **Шаг 4: убедиться, что тест проходит и что он ловит регресс**

Запустить: `npx jest src/profile/account-deletion.spec.ts`
Ожидаемо: PASS, шесть прежних тестов плюс новый.

Сломать в обратную сторону: временно закомментировать в `profile.service.ts` строку `UPDATE ai_profiles_consolidated SET profile_data = '{}'…` и убедиться, что новый тест краснеет. Вернуть как было.

- [ ] **Шаг 5: коммит**

```bash
git add src/profile/account-deletion.spec.ts
git commit -m "test(business-profile): удаление аккаунта уносит бизнес-карточку"
```

---

## Задача 11: полный прогон бэка на тестовой ноде

- [ ] **Шаг 1: запушить ветку**

```bash
git push -u origin feat/business-profile
git rev-parse HEAD    # запомнить sha
```

- [ ] **Шаг 2: поставить CI-клон на этот sha**

```bash
ssh dv@85.192.61.231 'git -C ~/ci/spirits_back fetch -q origin && git -C ~/ci/spirits_back checkout -q <sha>'
```

Именно на sha, а не на имя ветки: в общие чекауты параллельные сессии коммитят своё.

- [ ] **Шаг 3: прогнать свои тесты**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npm install && npx jest src/business-profile src/chat/business-profile-injection.spec.ts'
```

Ожидаемо: всё зелёное.

- [ ] **Шаг 4: замерить дельту по всему прогону**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest 2>&1 | tail -20'
```

Полный прогон красный и на `main` — два теста падают там до наших правок, плюс jest скребёт `.worktrees/`. Смотреть не на «всё зелёное», а на то, что список падающих не вырос. При сомнении — прогнать то же на `origin/main` и сравнить.

---

## Задача 12: фронт — чистые функции карточки

**Файлы:**
- Создать: `src/components/profile/businessFields.ts`
- Тест: `src/components/profile/businessFields.test.ts`

Работать в `/Users/dmitry/Downloads/spirits_front/.worktrees/business-profile`.

- [ ] **Шаг 1: написать падающий тест**

`src/components/profile/businessFields.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BUSINESS_FIELDS, filledFields, emptyFields, isCardEmpty } from './businessFields';
import type { BusinessProfile } from './businessFields';

const PROFILE: BusinessProfile = {
  what: { value: 'студия маникюра', source: 'user', updated_at: 'x' },
  tax_mode: { value: 'usn_d', source: 'assistant', updated_at: 'x' },
};

describe('businessFields', () => {
  it('описывает восемь полей в фиксированном порядке', () => {
    expect(BUSINESS_FIELDS.map(f => f.key)).toEqual([
      'what', 'legal_form', 'tax_mode', 'stage', 'revenue', 'team', 'customers', 'focus',
    ]);
  });

  it('у каждого поля есть i18n-ключ лейбла', () => {
    for (const f of BUSINESS_FIELDS) {
      expect(f.labelKey).toMatch(/^businessCard\.field\./);
    }
  });

  it('enum-поля несут ключи опций, а не готовый текст', () => {
    const tax = BUSINESS_FIELDS.find(f => f.key === 'tax_mode')!;
    expect(tax.options).toEqual(['npd', 'usn_d', 'usn_dr', 'patent', 'osno']);
  });

  it('делит поля на заполненные и пустые с сохранением порядка', () => {
    expect(filledFields(PROFILE).map(f => f.key)).toEqual(['what', 'tax_mode']);
    expect(emptyFields(PROFILE).map(f => f.key)).toEqual([
      'legal_form', 'stage', 'revenue', 'team', 'customers', 'focus',
    ]);
  });

  it('пустую карточку распознаёт', () => {
    expect(isCardEmpty({})).toBe(true);
    expect(isCardEmpty({ what: { value: '  ', source: 'user', updated_at: 'x' } })).toBe(true);
    expect(isCardEmpty(PROFILE)).toBe(false);
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx vitest run src/components/profile/businessFields.test.ts`
Ожидаемо: FAIL, не найден модуль

- [ ] **Шаг 3: реализация**

`src/components/profile/businessFields.ts`:

```typescript
export type FieldSource = 'user' | 'assistant';

export interface BusinessField {
  value: string;
  source: FieldSource;
  updated_at: string;
}

export type BusinessFieldKey =
  | 'what' | 'legal_form' | 'tax_mode' | 'stage' | 'revenue' | 'team' | 'customers' | 'focus';

export type BusinessProfile = Partial<Record<BusinessFieldKey, BusinessField>>;

export interface FieldSpec {
  key: BusinessFieldKey;
  labelKey: string;
  /** Коды опций; текст берётся из i18n по businessCard.option.<key>.<code> */
  options?: string[];
  multiline?: boolean;
}

// Порядок фиксирован: он же порядок показа. Совпадает с бэкендом.
export const BUSINESS_FIELDS: FieldSpec[] = [
  { key: 'what',       labelKey: 'businessCard.field.what' },
  { key: 'legal_form', labelKey: 'businessCard.field.legal_form', options: ['self_employed', 'ip', 'ooo'] },
  { key: 'tax_mode',   labelKey: 'businessCard.field.tax_mode',   options: ['npd', 'usn_d', 'usn_dr', 'patent', 'osno'] },
  { key: 'stage',      labelKey: 'businessCard.field.stage',      options: ['idea', 'year_one', 'stable', 'growth'] },
  { key: 'revenue',    labelKey: 'businessCard.field.revenue',    options: ['lt_300k', '300k_1m', '1m_3m', '3m_10m', 'gt_10m'] },
  { key: 'team',       labelKey: 'businessCard.field.team' },
  { key: 'customers',  labelKey: 'businessCard.field.customers',  multiline: true },
  { key: 'focus',      labelKey: 'businessCard.field.focus',      multiline: true },
];

const hasValue = (p: BusinessProfile, k: BusinessFieldKey) => (p[k]?.value || '').trim().length > 0;

export const filledFields = (p: BusinessProfile): FieldSpec[] =>
  BUSINESS_FIELDS.filter(f => hasValue(p, f.key));

export const emptyFields = (p: BusinessProfile): FieldSpec[] =>
  BUSINESS_FIELDS.filter(f => !hasValue(p, f.key));

export const isCardEmpty = (p: BusinessProfile): boolean =>
  !BUSINESS_FIELDS.some(f => hasValue(p, f.key));
```

- [ ] **Шаг 4: проверить**

Запустить: `npx vitest run src/components/profile/businessFields.test.ts`
Ожидаемо: PASS, 5 тестов

- [ ] **Шаг 5: коммит**

```bash
git add src/components/profile/businessFields.ts src/components/profile/businessFields.test.ts
git commit -m "feat(business-card): описание полей карточки и чистые функции"
```

---

## Задача 13: переводы во всех семи локалях

Локалей семь: `ru, en, es, de, fr, pt, zh`. Раздел «Стек» в `CLAUDE.md` говорит «RU по умолчанию, EN» — это устарело.

Скриптом `translate-locales` не пользоваться: `ANTHROPIC_API_KEY` не задан, а скрипт переписывает локаль целиком.

**Файлы:**
- Изменить: `src/i18n/locales/{ru,en,es,de,fr,pt,zh}.json`
- Тест: `src/i18n/businessCard.test.ts`

- [ ] **Шаг 1: написать падающий тест**

`src/i18n/businessCard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BUSINESS_FIELDS } from '../components/profile/businessFields';

import ru from './locales/ru.json';
import en from './locales/en.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';

const LOCALES: Record<string, any> = { ru, en, es, de, fr, pt, zh };

function get(obj: any, dotted: string): unknown {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

describe('переводы бизнес-карточки', () => {
  const required: string[] = [
    'businessCard.title',
    'businessCard.subtitle',
    'businessCard.addMore',
    'businessCard.filledByAssistant',
    'businessCard.empty',
    'businessCard.saveError',
    ...BUSINESS_FIELDS.map(f => f.labelKey),
    ...BUSINESS_FIELDS.flatMap(f =>
      (f.options || []).map(o => `businessCard.option.${f.key}.${o}`),
    ),
  ];

  for (const [name, bundle] of Object.entries(LOCALES)) {
    it(`${name}: есть все ключи карточки`, () => {
      const missing = required.filter(k => typeof get(bundle, k) !== 'string');
      expect(missing).toEqual([]);
    });

    it(`${name}: ни один перевод не пустой`, () => {
      const blank = required.filter(k => !String(get(bundle, k) ?? '').trim());
      expect(blank).toEqual([]);
    });
  }

  it('нерусские локали не оставили русский текст в заголовке', () => {
    for (const [name, bundle] of Object.entries(LOCALES)) {
      if (name === 'ru') continue;
      expect(String(get(bundle, 'businessCard.title'))).not.toMatch(/[А-Яа-я]/);
    }
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `npx vitest run src/i18n/businessCard.test.ts`
Ожидаемо: FAIL для всех семи локалей

- [ ] **Шаг 3: добавить блок в `ru.json`**

В `src/i18n/locales/ru.json` добавить на верхнем уровне:

```json
  "businessCard": {
    "title": "Мой бизнес",
    "subtitle": "Ассистенты используют это, чтобы не переспрашивать",
    "addMore": "Дополнить",
    "filledByAssistant": "Заполнено из разговора",
    "empty": "Пока пусто — расскажите о деле любому бизнес-ассистенту",
    "saveError": "Не удалось сохранить",
    "field": {
      "what": "Чем занимается",
      "legal_form": "Форма",
      "tax_mode": "Налоговый режим",
      "stage": "Стадия",
      "revenue": "Оборот в месяц",
      "team": "Команда",
      "customers": "Клиенты",
      "focus": "Фокус сейчас"
    },
    "option": {
      "legal_form": { "self_employed": "Самозанятый", "ip": "ИП", "ooo": "ООО" },
      "tax_mode": {
        "npd": "НПД", "usn_d": "УСН Доходы", "usn_dr": "УСН Доходы минус расходы",
        "patent": "Патент", "osno": "ОСНО"
      },
      "stage": {
        "idea": "Идея", "year_one": "Первый год", "stable": "Устойчивый", "growth": "Рост"
      },
      "revenue": {
        "lt_300k": "До 300 тыс ₽", "300k_1m": "300 тыс – 1 млн ₽",
        "1m_3m": "1–3 млн ₽", "3m_10m": "3–10 млн ₽", "gt_10m": "Больше 10 млн ₽"
      }
    }
  }
```

- [ ] **Шаг 4: добавить тот же блок в `en.json`**

```json
  "businessCard": {
    "title": "My business",
    "subtitle": "Assistants use this so you don't repeat yourself",
    "addMore": "Add more",
    "filledByAssistant": "Filled in from your conversation",
    "empty": "Empty for now — tell any business assistant about your work",
    "saveError": "Could not save",
    "field": {
      "what": "What you do",
      "legal_form": "Legal form",
      "tax_mode": "Tax mode",
      "stage": "Stage",
      "revenue": "Monthly revenue",
      "team": "Team",
      "customers": "Customers",
      "focus": "Current focus"
    },
    "option": {
      "legal_form": { "self_employed": "Self-employed", "ip": "Sole proprietor", "ooo": "LLC" },
      "tax_mode": {
        "npd": "Professional income tax", "usn_d": "Simplified (income)",
        "usn_dr": "Simplified (income minus expenses)", "patent": "Patent", "osno": "General"
      },
      "stage": {
        "idea": "Idea", "year_one": "First year", "stable": "Stable", "growth": "Growing"
      },
      "revenue": {
        "lt_300k": "Under ₽300k", "300k_1m": "₽300k–1M",
        "1m_3m": "₽1–3M", "3m_10m": "₽3–10M", "gt_10m": "Over ₽10M"
      }
    }
  }
```

- [ ] **Шаг 5: добавить блок в `es.json`**

```json
  "businessCard": {
    "title": "Mi negocio",
    "subtitle": "Los asistentes lo usan para no volver a preguntarte",
    "addMore": "Añadir más",
    "filledByAssistant": "Completado a partir de tu conversación",
    "empty": "Vacío por ahora: cuéntale a cualquier asistente de negocio a qué te dedicas",
    "saveError": "No se pudo guardar",
    "field": {
      "what": "A qué te dedicas",
      "legal_form": "Forma jurídica",
      "tax_mode": "Régimen fiscal",
      "stage": "Etapa",
      "revenue": "Facturación mensual",
      "team": "Equipo",
      "customers": "Clientes",
      "focus": "Foco actual"
    },
    "option": {
      "legal_form": { "self_employed": "Autónomo", "ip": "Empresario individual", "ooo": "Sociedad limitada" },
      "tax_mode": {
        "npd": "Impuesto sobre ingresos profesionales", "usn_d": "Simplificado (ingresos)",
        "usn_dr": "Simplificado (ingresos menos gastos)", "patent": "Patente", "osno": "Régimen general"
      },
      "stage": {
        "idea": "Idea", "year_one": "Primer año", "stable": "Estable", "growth": "Crecimiento"
      },
      "revenue": {
        "lt_300k": "Menos de 300 mil ₽", "300k_1m": "300 mil – 1 M ₽",
        "1m_3m": "1–3 M ₽", "3m_10m": "3–10 M ₽", "gt_10m": "Más de 10 M ₽"
      }
    }
  }
```

- [ ] **Шаг 6: добавить блок в `de.json`**

```json
  "businessCard": {
    "title": "Mein Unternehmen",
    "subtitle": "Die Assistenten nutzen das, damit du dich nicht wiederholen musst",
    "addMore": "Ergänzen",
    "filledByAssistant": "Aus dem Gespräch übernommen",
    "empty": "Noch leer – erzähl einem Business-Assistenten von deiner Arbeit",
    "saveError": "Speichern fehlgeschlagen",
    "field": {
      "what": "Womit du dich beschäftigst",
      "legal_form": "Rechtsform",
      "tax_mode": "Steuerregime",
      "stage": "Phase",
      "revenue": "Monatsumsatz",
      "team": "Team",
      "customers": "Kunden",
      "focus": "Aktueller Fokus"
    },
    "option": {
      "legal_form": { "self_employed": "Selbstständig", "ip": "Einzelunternehmer", "ooo": "GmbH" },
      "tax_mode": {
        "npd": "Steuer auf Berufseinkommen", "usn_d": "Vereinfacht (Einnahmen)",
        "usn_dr": "Vereinfacht (Einnahmen minus Ausgaben)", "patent": "Patent", "osno": "Regelbesteuerung"
      },
      "stage": {
        "idea": "Idee", "year_one": "Erstes Jahr", "stable": "Stabil", "growth": "Wachstum"
      },
      "revenue": {
        "lt_300k": "Unter 300 Tsd. ₽", "300k_1m": "300 Tsd. – 1 Mio. ₽",
        "1m_3m": "1–3 Mio. ₽", "3m_10m": "3–10 Mio. ₽", "gt_10m": "Über 10 Mio. ₽"
      }
    }
  }
```

- [ ] **Шаг 7: добавить блок в `fr.json`**

```json
  "businessCard": {
    "title": "Mon entreprise",
    "subtitle": "Les assistants s'en servent pour ne pas vous le redemander",
    "addMore": "Compléter",
    "filledByAssistant": "Rempli à partir de votre conversation",
    "empty": "Vide pour l'instant — parlez de votre activité à un assistant business",
    "saveError": "Échec de l'enregistrement",
    "field": {
      "what": "Votre activité",
      "legal_form": "Forme juridique",
      "tax_mode": "Régime fiscal",
      "stage": "Stade",
      "revenue": "Chiffre d'affaires mensuel",
      "team": "Équipe",
      "customers": "Clients",
      "focus": "Priorité actuelle"
    },
    "option": {
      "legal_form": { "self_employed": "Travailleur indépendant", "ip": "Entrepreneur individuel", "ooo": "SARL" },
      "tax_mode": {
        "npd": "Impôt sur les revenus professionnels", "usn_d": "Simplifié (revenus)",
        "usn_dr": "Simplifié (revenus moins dépenses)", "patent": "Patente", "osno": "Régime général"
      },
      "stage": {
        "idea": "Idée", "year_one": "Première année", "stable": "Stable", "growth": "Croissance"
      },
      "revenue": {
        "lt_300k": "Moins de 300 k ₽", "300k_1m": "300 k – 1 M ₽",
        "1m_3m": "1–3 M ₽", "3m_10m": "3–10 M ₽", "gt_10m": "Plus de 10 M ₽"
      }
    }
  }
```

- [ ] **Шаг 8: добавить блок в `pt.json`**

```json
  "businessCard": {
    "title": "Meu negócio",
    "subtitle": "Os assistentes usam isto para não perguntarem de novo",
    "addMore": "Completar",
    "filledByAssistant": "Preenchido a partir da conversa",
    "empty": "Ainda vazio — conte a qualquer assistente de negócios o que você faz",
    "saveError": "Não foi possível salvar",
    "field": {
      "what": "O que você faz",
      "legal_form": "Forma jurídica",
      "tax_mode": "Regime tributário",
      "stage": "Estágio",
      "revenue": "Faturamento mensal",
      "team": "Equipe",
      "customers": "Clientes",
      "focus": "Foco atual"
    },
    "option": {
      "legal_form": { "self_employed": "Autônomo", "ip": "Empresário individual", "ooo": "Sociedade limitada" },
      "tax_mode": {
        "npd": "Imposto sobre renda profissional", "usn_d": "Simplificado (receita)",
        "usn_dr": "Simplificado (receita menos despesas)", "patent": "Patente", "osno": "Regime geral"
      },
      "stage": {
        "idea": "Ideia", "year_one": "Primeiro ano", "stable": "Estável", "growth": "Crescimento"
      },
      "revenue": {
        "lt_300k": "Até 300 mil ₽", "300k_1m": "300 mil – 1 mi ₽",
        "1m_3m": "1–3 mi ₽", "3m_10m": "3–10 mi ₽", "gt_10m": "Mais de 10 mi ₽"
      }
    }
  }
```

- [ ] **Шаг 9: добавить блок в `zh.json`**

```json
  "businessCard": {
    "title": "我的生意",
    "subtitle": "助手会参考这些信息，不再重复询问",
    "addMore": "补充",
    "filledByAssistant": "根据对话自动填写",
    "empty": "暂时为空 —— 向任意商务助手介绍你的业务",
    "saveError": "保存失败",
    "field": {
      "what": "业务内容",
      "legal_form": "经营形式",
      "tax_mode": "税务模式",
      "stage": "阶段",
      "revenue": "月营业额",
      "team": "团队",
      "customers": "客户",
      "focus": "当前重点"
    },
    "option": {
      "legal_form": { "self_employed": "自雇", "ip": "个体经营者", "ooo": "有限责任公司" },
      "tax_mode": {
        "npd": "职业收入税", "usn_d": "简易计税（收入）",
        "usn_dr": "简易计税（收入减支出）", "patent": "专利税制", "osno": "一般税制"
      },
      "stage": {
        "idea": "构想", "year_one": "第一年", "stable": "稳定", "growth": "增长"
      },
      "revenue": {
        "lt_300k": "30万卢布以下", "300k_1m": "30万–100万卢布",
        "1m_3m": "100万–300万卢布", "3m_10m": "300万–1000万卢布", "gt_10m": "1000万卢布以上"
      }
    }
  }
```

- [ ] **Шаг 10: проверить**

Запустить: `npx vitest run src/i18n/businessCard.test.ts`
Ожидаемо: PASS, 15 тестов

- [ ] **Шаг 11: коммит**

```bash
git add src/i18n/locales/ src/i18n/businessCard.test.ts
git commit -m "feat(business-card): переводы карточки во всех семи локалях"
```

---

## Задача 14: компонент карточки

**Файлы:**
- Создать: `src/components/profile/BusinessCard.tsx`
- Изменить: `src/components/profile/ProfileView.tsx`

- [ ] **Шаг 1: посмотреть образец**

Прочитать `src/components/profile/ProfileTasks.tsx` целиком (275 строк). Новый компонент повторяет его устройство: свой `useEffect` с загрузкой, свой стейт, свои Tailwind-классы. Стиль карточки, отступы и типографику брать оттуда же, чтобы блок не выбивался.

- [ ] **Шаг 2: написать компонент**

`src/components/profile/BusinessCard.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import {
  BUSINESS_FIELDS,
  BusinessFieldKey,
  BusinessProfile,
  emptyFields,
  filledFields,
  isCardEmpty,
} from './businessFields';

/**
 * Карточка бизнеса в профиле.
 *
 * Главный сценарий — не «заполнить восемь полей», а «поправить одно, которое
 * ассистент понял неверно». Поэтому правка на месте по одному полю, а пустые
 * поля спрятаны за «Дополнить»: восемь пустых слотов подряд читаются как
 * анкета, ради обхода которой и выбран автосбор.
 */
const BusinessCard: React.FC = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BusinessProfile>({});
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<BusinessFieldKey | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/webhook/business-profile');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setProfile(data.profile || {});
        setVisible(Boolean(data.visible));
      } catch {
        // Профиль должен открыться и без карточки.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async (key: BusinessFieldKey, value: string) => {
    setError(false);
    const trimmed = value.trim();
    try {
      const res = await apiClient.post('/webhook/business-profile', { fields: { [key]: trimmed } });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      setProfile(data.profile || {});
      setEditing(null);
    } catch {
      setError(true);
    }
  };

  if (!loaded || !visible) return null;

  const shown = expanded ? BUSINESS_FIELDS : filledFields(profile);
  const hidden = expanded ? [] : emptyFields(profile);

  return (
    <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">{t('businessCard.title')}</h3>
      <p className="text-sm text-gray-500 mt-1">{t('businessCard.subtitle')}</p>

      {isCardEmpty(profile) && !expanded && (
        <p className="text-sm text-gray-400 mt-4">{t('businessCard.empty')}</p>
      )}

      <dl className="mt-4 space-y-3">
        {shown.map(f => {
          const field = profile[f.key];
          const isEditing = editing === f.key;
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                {t(f.labelKey)}
                {field?.source === 'assistant' && (
                  <span title={t('businessCard.filledByAssistant')}>
                    <Sparkles className="w-3 h-3 text-indigo-400" aria-label={t('businessCard.filledByAssistant')} />
                  </span>
                )}
              </dt>
              <dd>
                {isEditing ? (
                  f.options ? (
                    <select
                      autoFocus
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={draft}
                      onChange={e => save(f.key, e.target.value)}
                      onBlur={() => setEditing(null)}
                    >
                      <option value="">—</option>
                      {f.options.map(o => (
                        <option key={o} value={o}>{t(`businessCard.option.${f.key}.${o}`)}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      autoFocus
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => save(f.key, draft)}
                      onKeyDown={e => { if (e.key === 'Enter') save(f.key, draft); }}
                    />
                  )
                ) : (
                  <button
                    type="button"
                    className="text-sm text-gray-900 text-left w-full hover:text-indigo-600"
                    onClick={() => { setEditing(f.key); setDraft(field?.value || ''); }}
                  >
                    {field?.value
                      ? (f.options ? t(`businessCard.option.${f.key}.${field.value}`) : field.value)
                      : <span className="text-gray-300">—</span>}
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {error && <p className="text-sm text-red-500 mt-3">{t('businessCard.saveError')}</p>}

      {hidden.length > 0 && (
        <button
          type="button"
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-700"
          onClick={() => setExpanded(true)}
        >
          {t('businessCard.addMore')}
        </button>
      )}
    </div>
  );
};

export default BusinessCard;
```

- [ ] **Шаг 3: вставить в профиль**

В `src/components/profile/ProfileView.tsx` добавить импорт рядом с импортом `ProfileTasks` (строка 11):

```typescript
import BusinessCard from './BusinessCard';
```

И отрисовать блок непосредственно перед `<ProfileTasks ... />` в разметке. Найти место рендера `ProfileTasks` и добавить строкой выше:

```tsx
        <BusinessCard />
```

- [ ] **Шаг 4: проверить сборку и линт**

Запустить: `pnpm lint`
Ожидаемо: без новых ошибок

Сборку гнать на ноде, а не на маке:

```bash
git push
ssh dv@85.192.61.231 'git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front checkout -q <sha> && cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm install && pnpm test && pnpm build'
```

Ожидаемо: тесты зелёные, сборка проходит (~6 секунд).

- [ ] **Шаг 5: коммит**

```bash
git add src/components/profile/BusinessCard.tsx src/components/profile/ProfileView.tsx
git commit -m "feat(business-card): блок карточки бизнеса в профиле"
```

---

## Задача 15: проверка живьём на тестовом стенде

Тесты не докажут, что ассистент действительно стал вести себя иначе. Это проверяется руками.

- [ ] **Шаг 1: выкатить на test**

Раскатку на прод не запускать. Только тестовый контур:

```bash
TEST_ONLY=1 bash ~/Downloads/spirits_back/scripts/deploy.sh
```

Перед запуском — спросить владельца: раскатку может вести параллельная сессия. Если в этот момент идут живые стримы, деплой убьёт ответ посреди хода, молча.

- [ ] **Шаг 2: пройти сценарий чистым аккаунтом**

На `test.linkeon.io` (за Basic Auth, логин в `scripts/test-server.env.local`), под тестовым номером `70000000000`, OTP через `GET /webhook/debug/sms-code/70000000000`:

1. Открыть Алексея (юрист), написать «у меня ИП на УСН доходы, студия маникюра».
2. Открыть `/profile` — блок «Мой бизнес» появился, поля `what`, `legal_form`, `tax_mode` заполнены и помечены значком «заполнено из разговора».
3. Поправить `tax_mode` руками на «ОСНО» — значок исчез.
4. Вернуться к Алексею, написать «у нас всё-таки УСН» — проверить в `/profile`, что значение осталось «ОСНО». Это и есть правило не-затирания в живом виде.
5. Открыть Виталия (финдир), спросить про юнит-экономику — он должен знать про ИП и студию, не переспрашивая, и спросить про оборот (`revenue` пуст).
6. Открыть Олю (психолог) — она не должна упоминать налоговый режим; в её промпте только строка-резюме.

- [ ] **Шаг 3: убедиться, что тестируется своя сборка**

Хеш бандла в браузере сверить с собранным. Рабочий каталог и чекаут уже молча подменялись, и выводы делались по чужой сборке.

- [ ] **Шаг 4: посмотреть логи извлечения**

```bash
ssh dv@85.192.61.231 'pm2 logs linkeon-api --lines 100 --nostream | grep -i "business"'
```

Ожидаемо: нет `business extractFromTurn failed`. Если есть — читать текст ошибки, а не гадать.

---

## Задача 16: завершение

- [ ] **Шаг 1: свести ветки**

Обе ветки называются `feat/business-profile` — в `spirits_back` и в `spirits_front`. Пушить обе.

- [ ] **Шаг 2: предложить владельцу решение по вливанию**

Прод и test катятся только из `main`. Спросить, вливать ли `feat/business-profile` в `main` в обоих репозиториях, и не запускать `deploy.sh` без явного «да».

- [ ] **Шаг 3: убрать worktree**

```bash
git -C /Users/dmitry/Downloads/spirits_back worktree remove .worktrees/business-profile
git -C /Users/dmitry/Downloads/spirits_front worktree remove .worktrees/business-profile
```

Только после того, как обе ветки запушены и слиты.

- [ ] **Шаг 4: назначить замер**

Через две недели после выката посчитать долю бизнес-аккаунтов с тремя и более заполненными полями:

```sql
SELECT count(*) FILTER (
         WHERE (SELECT count(*) FROM jsonb_each(profile_data->'business')) >= 3
       )::float / NULLIF(count(*), 0)
  FROM ai_profiles_consolidated
 WHERE profile_data ? 'business';
```

Ниже примерно четверти — не работает автосбор, чинить его, а не интерфейс карточки.
