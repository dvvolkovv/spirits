# Международный запуск — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать русский хардкод из проактивных пушей, не сломав при этом опознание пресета «энергия дня».

**Architecture:** Пресет сейчас опознаётся сравнением заголовка с русской строкой `'Энергия дня'` в двух местах. Локализовать заголовок, не тронув опознание, невозможно: перевод молча сломает и дедупликацию, и ветку выбора текста пуша. Поэтому сначала переводим опознание на колонку `kind`, которая в схеме уже есть (`routine_pushes.kind`, дефолт `'energy_of_day'`), но наружу стором не отдаётся и при создании всегда затирается значением `'custom'`. Только после этого локализуем тексты.

**Tech Stack:** NestJS 10, TypeScript, PostgreSQL, jest. Всё — в `~/Downloads/spirits_back` (спек лежит в `spirits_front`, кода фронта в этом плане нет).

**Порядок обязателен:** задача 3 без задач 1–2 создаёт тихую регрессию — у англоязычного пользователя `ensureEnergyPreset` перестанет находить существующий пресет и заведёт дубль при каждом вызове.

## Статус: задачи 1–3 выполнены 25.08.2026

Коммиты в `spirits_back` (ветка `feat/voice-call-roman`): `fcfecfa`, `3e0f116`, `0112477`, `f939231`. Тесты 15/15 зелёные. Задача 4 не начата — под гейтом.

**Две поправки, найденные при исполнении — план в них ошибался:**

1. **Ключ энерго-рутины — `daily:<assistantId>`, а НЕ `'energy_of_day'`.** План закладывал придуманную константу. На проде существующая строка имеет `kind='daily:14'`, и `app-widget.controller.ts:117` проверяет включённость энергии именно по этому ключу — фикс от 2026-08-23, до которого гейт смотрел на `'energy_of_day'`, которого не было ни у кого, и блок не отдавался ни разу. Своя константа вернула бы тот баг. Ниже по тексту `energy_of_day` читать как `daily:${RAYA_ID}`.
2. **Миграции модуля применяются сами.** `RoutinePushService.onModuleInit` прогоняет все `.sql` из своего `migrations/` при каждом старте, идемпотентно (`routine-push.service.ts:24`). Сломанный общий migrate-runner здесь ни при чём, ручное применение через `psql` не нужно — миграция приедет с деплоем.

Дополнительно вскрылся и покрыт тестом побочный баг: пользовательская рутина, названная «Энергия дня», получала заголовок энерго-пуша, потому что `isEnergy` сравнивал заголовки.

**Где гонять тесты:** тест-нода `dv@85.192.61.231`, CI-клон `~/ci/spirits_back`, по конкретному sha (мак не тянет). Локально допустим точечный `npx jest <файл>`. Полный `npm test` в этом репозитории красный и до наших правок — мерить только дельту по своим файлам.

---

### Задача 1: Провести `kind` через стор

**Files:**
- Modify: `src/routine-push/routine-store.service.ts:16-27` (интерфейс `RoutineRow`)
- Modify: `src/routine-push/routine-store.service.ts:64-77` (`map`)
- Modify: `src/routine-push/routine-store.service.ts:79-80` (`COLS`)
- Modify: `src/routine-push/routine-store.service.ts:141-161` (`create`)
- Modify: `src/routine-push/routine-store.service.ts:197-199` (`listEnabled`)
- Create: `src/routine-push/migrations/003_backfill_kind.sql`
- Test: `src/routine-push/routine-store.kind.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `src/routine-push/routine-store.kind.spec.ts`:

```ts
import { RoutineStore } from './routine-store.service';

const dbRow = (over: any = {}) => ({
  id: 'r1',
  user_id: 'u1',
  kind: 'energy_of_day',
  title: 'Энергия дня',
  assistant_id: '14',
  prompt: 'p',
  send_hour: 8,
  tz: 'Europe/Moscow',
  days: null,
  enabled: true,
  last_sent_date: null,
  ...over,
});

describe('RoutineStore: колонка kind', () => {
  it('list отдаёт kind наружу', async () => {
    const pg = { query: jest.fn().mockResolvedValue({ rows: [dbRow()] }) };
    const [row] = await new RoutineStore(pg as any).list('u1');

    expect(row.kind).toBe('energy_of_day');
  });

  it('map подставляет custom, если kind в строке пуст', async () => {
    const pg = { query: jest.fn().mockResolvedValue({ rows: [dbRow({ kind: null })] }) };
    const [row] = await new RoutineStore(pg as any).list('u1');

    expect(row.kind).toBe('custom');
  });

  it('create записывает переданный kind, а не хардкод custom', async () => {
    const pg = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ n: 0 }] })        // count
        .mockResolvedValueOnce({ rows: [dbRow()] }),        // INSERT ... RETURNING
    };
    await new RoutineStore(pg as any).create('u1', {
      title: 'Энергия дня',
      assistantId: '14',
      prompt: 'p',
      kind: 'energy_of_day',
    });

    const [sql, params] = pg.query.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO routine_pushes/);
    expect(params).toContain('energy_of_day');
  });

  it('create по умолчанию остаётся custom', async () => {
    const pg = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ n: 0 }] })
        .mockResolvedValueOnce({ rows: [dbRow({ kind: 'custom' })] }),
    };
    await new RoutineStore(pg as any).create('u1', {
      title: 'Напоминание',
      assistantId: '14',
      prompt: 'p',
    });

    expect(pg.query.mock.calls[1][1]).toContain('custom');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx jest src/routine-push/routine-store.kind.spec.ts`
Expected: FAIL — компиляция падает на `Property 'kind' does not exist on type 'RoutineRow'` и на лишнем поле `kind` в аргументе `create`.

- [ ] **Step 3: Добавить `kind` в интерфейс**

`src/routine-push/routine-store.service.ts`, интерфейс `RoutineRow` — добавить поле после `userId`:

```ts
export interface RoutineRow {
  id: string;
  userId: string;
  kind: string;              // 'energy_of_day' | 'custom' — стабильный ключ, НЕ показывается пользователю
  title: string;
  assistantId: string;
  prompt: string;
  sendHour: number;
  tz: string;
  days: number[] | null; // локальные дни недели 0..6 (0=Вс); null/[] = каждый день
  enabled: boolean;
  lastSentDate: string | null;
}
```

- [ ] **Step 4: Добавить `kind` в `COLS` и `map`**

`COLS` (строка ~79):

```ts
  private readonly COLS =
    'id, user_id, kind, title, assistant_id, prompt, send_hour, tz, days, enabled, last_sent_date';
```

`map` (строка ~64) — добавить строку после `userId`:

```ts
      userId: row.user_id,
      kind: row.kind || 'custom',
```

- [ ] **Step 5: Принять `kind` в `create`**

Сигнатура (строка ~143) — добавить `kind` в тип `data`:

```ts
    data: { title: string; assistantId: string; prompt: string; kind?: string; sendHour?: number; tz?: string; days?: any; enabled?: boolean },
```

INSERT (строки ~154-159) — вместо литерала `'custom'` параметр:

```ts
    const r = await this.pg.query(
      `INSERT INTO routine_pushes (user_id, kind, title, assistant_id, prompt, send_hour, tz, days, enabled, last_sent_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${this.COLS}`,
      [userId, data.kind || 'custom', (data.title || 'Напоминание').slice(0, 80), String(data.assistantId), data.prompt, hour, tz, days, enabled, lastSent],
    );
```

- [ ] **Step 6: Добавить `kind` в `listEnabled`**

Строки ~197-200 — расширить тип возврата и SELECT:

```ts
  async listEnabled(): Promise<Array<{ id: string; user_id: string; kind: string; title: string; assistant_id: string; prompt: string; send_hour: number; tz: string; days: number[] | null; last_sent_date: any }>> {
    const r = await this.pg.query(
      `SELECT id, user_id, kind, title, assistant_id, prompt, send_hour, tz, days, last_sent_date
```

(остальное тело метода не трогать)

- [ ] **Step 7: Запустить тест и убедиться, что он проходит**

Run: `npx jest src/routine-push/routine-store.kind.spec.ts`
Expected: PASS, 4 теста.

- [ ] **Step 8: Написать миграцию бэкфилла**

Создать `src/routine-push/migrations/003_backfill_kind.sql`:

```sql
-- Опознание пресета «энергия дня» переезжает с русского заголовка на kind.
-- Строки, созданные через RoutineStore.create, получили kind='custom' захардкоженно,
-- включая пресеты Райи. Проставляем им настоящий kind до того, как заголовки
-- станут локализованными и сравнивать станет не с чем.
--
-- Сравнение с русским заголовком здесь корректно ровно один раз: эти строки
-- писались до локализации, других заголовков у них быть не может.
UPDATE routine_pushes
   SET kind = 'energy_of_day'
 WHERE kind = 'custom'
   AND assistant_id = '14'
   AND title = 'Энергия дня';
```

- [ ] **Step 9: Проверить миграцию на копии, а не на проде**

Прод-раннер миграций сломан (застревает на `base/001`), новые миграции применяются вручную через `psql` + `INSERT` в `schema_migrations`. Поэтому сначала — счётчик на проде **только на чтение**:

Run:
```bash
ssh dvolkov@212.113.106.202 'cd ~/spirits_back && psql "$(grep -m1 "^DATABASE_URL=" .env | cut -d= -f2-)" -c "SELECT kind, count(*) FROM routine_pushes GROUP BY 1;"'
```
Expected: видно, сколько строк изменит бэкфилл. Записать число до применения.

- [ ] **Step 10: Коммит**

```bash
git add src/routine-push/routine-store.service.ts src/routine-push/routine-store.kind.spec.ts src/routine-push/migrations/003_backfill_kind.sql
git commit -m "feat(routine-push): провести kind через стор и забэкфиллить пресеты"
```

---

### Задача 2: Опознавать пресет по `kind`, а не по русскому заголовку

**Files:**
- Modify: `src/routine-push/routine-push.service.ts:43-55` (`ensureEnergyPreset`)
- Modify: `src/routine-push/routine-push.service.ts:58-79` (`deliver`)
- Modify: `src/routine-push/routine-push.service.ts:89-95` (`fireNow`)
- Modify: `src/routine-push/routine-push.service.ts:107-116` (`runDue`)
- Test: `src/routine-push/routine-push.kind.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `src/routine-push/routine-push.kind.spec.ts`:

```ts
import { RoutinePushService } from './routine-push.service';

const preset = (over: any = {}) => ({
  id: 'r1',
  userId: 'u1',
  kind: 'energy_of_day',
  title: 'Энергия дня',
  assistantId: '14',
  prompt: 'p',
  sendHour: 8,
  tz: 'Europe/Moscow',
  days: null,
  enabled: true,
  lastSentDate: null,
  ...over,
});

/**
 * Собирает сервис с заглушками. Порядок аргументов — как в конструкторе
 * routine-push.service.ts:17 — pg, push, chat, store. Пятым в задаче 3
 * добавится language.
 */
function makeService(store: any) {
  return new RoutinePushService(
    { query: jest.fn().mockResolvedValue({ rows: [] }) } as any,          // pg
    { sendPush: jest.fn().mockResolvedValue(1) } as any,                  // push
    { generateAgentReply: jest.fn().mockResolvedValue('текст') } as any,  // chat
    store as any,                                                          // store
  );
}

describe('ensureEnergyPreset: опознание по kind', () => {
  it('находит существующий пресет с нерусским заголовком и не создаёт дубль', async () => {
    const store = {
      list: jest.fn().mockResolvedValue([preset({ title: 'Energy of the day' })]),
      create: jest.fn(),
      knownTz: jest.fn().mockResolvedValue('Asia/Tashkent'),
    };
    const svc = makeService(store);

    const r = await svc.ensureEnergyPreset('u1');

    expect(store.create).not.toHaveBeenCalled();
    expect(r.id).toBe('r1');
  });

  it('не принимает за пресет пользовательскую рутину, названную «Энергия дня»', async () => {
    const store = {
      list: jest.fn().mockResolvedValue([preset({ kind: 'custom' })]),
      create: jest.fn().mockResolvedValue(preset({ id: 'r2' })),
      knownTz: jest.fn().mockResolvedValue(null),
    };
    const svc = makeService(store);

    const r = await svc.ensureEnergyPreset('u1');

    expect(store.create).toHaveBeenCalled();
    expect(r.id).toBe('r2');
  });

  it('создаёт пресет с kind=energy_of_day', async () => {
    const store = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(preset()),
      knownTz: jest.fn().mockResolvedValue(null),
    };
    const svc = makeService(store);

    await svc.ensureEnergyPreset('u1');

    expect(store.create.mock.calls[0][1]).toMatchObject({ kind: 'energy_of_day' });
  });
});
```

Конструктор `RoutinePushService` (строка 17) принимает ровно четыре зависимости в порядке `pg, push, chat, store` — заглушки выше выставлены в нём.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx jest src/routine-push/routine-push.kind.spec.ts`
Expected: FAIL — первый тест падает, потому что `find` ищет по `title === 'Энергия дня'` и английский заголовок не находит, значит `create` вызывается.

- [ ] **Step 3: Перевести `ensureEnergyPreset` на `kind`**

```ts
  async ensureEnergyPreset(userId: string, tz?: string): Promise<RoutineRow> {
    const existing = (await this.store.list(userId)).find((r) => r.kind === 'energy_of_day');
    if (existing) return existing;
    return this.store.create(userId, {
      kind: 'energy_of_day',
      title: 'Энергия дня',
      assistantId: RAYA_ID,
      prompt: ENERGY_PROMPT,
      sendHour: 8,
      tz: tz || (await this.store.knownTz(userId)) || 'Europe/Moscow',
      days: null,
      enabled: true,
    });
  }
```

Заголовок пока остаётся русским — его локализует задача 3.

- [ ] **Step 4: Провести `kind` в `deliver`**

Сигнатура (строка ~58):

```ts
  private async deliver(userId: string, assistantId: string, prompt: string, title?: string, kind?: string): Promise<number> {
```

Ветка выбора заголовка (строка ~72) — вместо сравнения с русской строкой:

```ts
    const isEnergy = kind === 'energy_of_day';
```

- [ ] **Step 5: Передать `kind` из обоих вызовов `deliver`**

`fireNow` (строка ~93):

```ts
    const delivered = await this.deliver(userId, r.assistantId, r.prompt, r.title, r.kind);
```

`runDue` (строка ~114):

```ts
        const n = await this.deliver(r.user_id, r.assistant_id, r.prompt, r.title, r.kind);
```

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

Run: `npx jest src/routine-push/routine-push.kind.spec.ts src/routine-push/routine-store.kind.spec.ts`
Expected: PASS, 7 тестов суммарно.

- [ ] **Step 7: Коммит**

```bash
git add src/routine-push/routine-push.service.ts src/routine-push/routine-push.kind.spec.ts
git commit -m "fix(routine-push): опознавать пресет по kind, а не по русскому заголовку"
```

---

### Задача 3: Локализовать тексты пушей

**Files:**
- Create: `src/routine-push/routine-messages.ts`
- Modify: `src/routine-push/routine-push.service.ts` (конструктор, `deliver`, `assistantName`, `ensureEnergyPreset`)
- Test: `src/routine-push/routine-push.i18n.spec.ts`
- **Не трогать:** `src/routine-push/routine-push.module.ts` — `CommonModule` глобальный, см. шаг 10

**Что локализуем и что нет.** Локализуются только строки, которые видит пользователь: заголовок пуша (`'Энергия дня от Райи 🌅'`, `'Напоминание'`), фолбэк имени ассистента (`'ассистент'`) и заголовок создаваемого пресета. Строка `sendTelegramAlert('🔔 Рутинные пуши разосланы: …')` на строке ~122 — **внутренний операционный алерт, не локализуется.**

- [ ] **Step 1: Написать падающий тест**

Создать `src/routine-push/routine-push.i18n.spec.ts`:

```ts
import { routineMsg } from './routine-messages';

describe('routineMsg', () => {
  it('отдаёт английские строки для en', () => {
    const m = routineMsg('en');

    expect(m.energyTitle).toBe('Energy of the day from Raya 🌅');
    expect(m.reminder).toBe('Reminder');
    expect(m.assistant).toBe('assistant');
  });

  it('отдаёт русские строки для ru', () => {
    expect(routineMsg('ru').energyTitle).toBe('Энергия дня от Райи 🌅');
  });

  it('откатывается на русский для неизвестного языка', () => {
    expect(routineMsg('uz')).toEqual(routineMsg('ru'));
  });

  it('покрывает все языки из SUPPORTED_LANGUAGES', () => {
    const { SUPPORTED_LANGUAGES } = require('../common/services/language.service');
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(routineMsg(lang).energyTitle).toBeTruthy();
      expect(routineMsg(lang).reminder).toBeTruthy();
      expect(routineMsg(lang).assistant).toBeTruthy();
    }
  });
});
```

Последний тест — сторож: он упадёт, когда в `SUPPORTED_LANGUAGES` добавят язык (например `uz` в задаче 4), а строки для него забудут.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx jest src/routine-push/routine-push.i18n.spec.ts`
Expected: FAIL — `Cannot find module './routine-messages'`.

- [ ] **Step 3: Создать таблицу строк**

Создать `src/routine-push/routine-messages.ts`:

```ts
/**
 * Тексты проактивных пушей. Паттерн тот же, что у searchMsg в misc.service.ts:
 * плоская карта по языку с откатом на ru.
 *
 * Языки — из SUPPORTED_LANGUAGES (common/services/language.service.ts).
 * Тест routine-push.i18n.spec.ts падает, если там появится язык без строк здесь.
 */
export interface RoutineMessages {
  energyTitle: string;
  reminder: string;
  assistant: string;
}

const MESSAGES: Record<string, RoutineMessages> = {
  ru: { energyTitle: 'Энергия дня от Райи 🌅', reminder: 'Напоминание', assistant: 'ассистент' },
  en: { energyTitle: 'Energy of the day from Raya 🌅', reminder: 'Reminder', assistant: 'assistant' },
  es: { energyTitle: 'Energía del día de Raya 🌅', reminder: 'Recordatorio', assistant: 'asistente' },
  pt: { energyTitle: 'Energia do dia da Raya 🌅', reminder: 'Lembrete', assistant: 'assistente' },
  de: { energyTitle: 'Energie des Tages von Raya 🌅', reminder: 'Erinnerung', assistant: 'Assistent' },
  fr: { energyTitle: 'Énergie du jour de Raya 🌅', reminder: 'Rappel', assistant: 'assistant' },
  zh: { energyTitle: '来自 Raya 的每日能量 🌅', reminder: '提醒', assistant: '助手' },
};

export const routineMsg = (lang: string): RoutineMessages => MESSAGES[lang] || MESSAGES.ru;
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npx jest src/routine-push/routine-push.i18n.spec.ts`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит таблицы строк**

```bash
git add src/routine-push/routine-messages.ts src/routine-push/routine-push.i18n.spec.ts
git commit -m "feat(routine-push): таблица локализованных строк для пушей"
```

- [ ] **Step 6: Написать падающий тест на использование языка в `deliver`**

Дописать в `src/routine-push/routine-push.kind.spec.ts` новый describe:

```ts
describe('deliver: язык пуша', () => {
  it('англоязычный пользователь получает английский заголовок', async () => {
    const sendPush = jest.fn().mockResolvedValue(1);
    const store = {
      getById: jest.fn().mockResolvedValue(preset({ title: 'Energy of the day' })),
    };
    const svc = new RoutinePushService(
      { query: jest.fn().mockResolvedValue({ rows: [] }) } as any,          // pg
      { sendPush } as any,                                                   // push
      { generateAgentReply: jest.fn().mockResolvedValue('текст') } as any,  // chat
      store as any,                                                          // store
      { resolveUserLanguage: jest.fn().mockResolvedValue('en') } as any,    // language
    );

    await svc.fireNow('u1', 'r1');

    expect(sendPush.mock.calls[0][1].title).toBe('Energy of the day from Raya 🌅');
  });
});
```

- [ ] **Step 7: Запустить и убедиться, что падает**

Run: `npx jest src/routine-push/routine-push.kind.spec.ts -t "англоязычный"`
Expected: FAIL — заголовок приходит русским (`'Энергия дня от Райи 🌅'`), потому что язык нигде не читается.

- [ ] **Step 8: Внедрить `LanguageService` и применить строки**

В `routine-push.service.ts` добавить в конструктор пятым параметром:

```ts
    private readonly language: LanguageService,
```

с импортом `import { LanguageService } from '../common/services/language.service';`

`deliver` — прочитать язык и взять строки:

```ts
  private async deliver(userId: string, assistantId: string, prompt: string, title?: string, kind?: string): Promise<number> {
    const text = await this.chat.generateAgentReply(userId, assistantId, prompt);
    if (!text || !text.trim()) {
      this.logger.warn(`routine deliver: empty text for ${userId} / assistant ${assistantId}`);
      return 0;
    }
    const lang = await this.language.resolveUserLanguage(userId);
    const msg = routineMsg(lang);
    const agentNum = /^\d+$/.test(assistantId) ? parseInt(assistantId, 10) : null;
    await this.pg.query(
      `INSERT INTO custom_chat_history (session_id, sender_type, agent, content, message_type)
       VALUES ($1, 'ai', $2, $3, 'text')`,
      [`${userId}_${assistantId}`, agentNum, text],
    );
    const name = await this.assistantName(assistantId, lang);
    const body = text.replace(/[#*_`>\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 130);
    const isEnergy = kind === 'energy_of_day';
    return this.push.sendPush(userId, {
      title: isEnergy ? msg.energyTitle : `${title || msg.reminder} · ${name} ✨`,
      body,
      url: `/chat?assistant=${assistantId}`,
      tag: `routine_${assistantId}`,
    });
  }
```

`assistantName` — принять язык:

```ts
  private async assistantName(assistantId: string, lang: string): Promise<string> {
    const fallback = routineMsg(lang).assistant;
    if (!/^\d+$/.test(assistantId)) return fallback;
    try {
      const r = await this.pg.query('SELECT COALESCE(display_name, name) AS n FROM agents WHERE id = $1', [parseInt(assistantId, 10)]);
      return r.rows[0]?.n || fallback;
    } catch { return fallback; }
  }
```

Добавить импорт `import { routineMsg } from './routine-messages';`

- [ ] **Step 9: Локализовать заголовок создаваемого пресета**

`ensureEnergyPreset` — заголовок пишется в БД один раз при создании, поэтому берём язык пользователя на момент создания:

```ts
  async ensureEnergyPreset(userId: string, tz?: string): Promise<RoutineRow> {
    const existing = (await this.store.list(userId)).find((r) => r.kind === 'energy_of_day');
    if (existing) return existing;
    const lang = await this.language.resolveUserLanguage(userId);
    return this.store.create(userId, {
      kind: 'energy_of_day',
      title: routineMsg(lang).energyTitle,
      assistantId: RAYA_ID,
      prompt: ENERGY_PROMPT,
      sendHour: 8,
      tz: tz || (await this.store.knownTz(userId)) || 'Europe/Moscow',
      days: null,
      enabled: true,
    });
  }
```

Опознание при этом на заголовок больше не опирается (задача 2), поэтому смена языка пользователем дубля не создаст — заголовок просто останется на языке момента создания.

- [ ] **Step 10: Убедиться, что правка модуля не нужна**

`CommonModule` помечен `@Global()` и экспортирует `LanguageService` (`src/common/common.module.ts`), поэтому инъекция работает без изменений в `routine-push.module.ts`. **Ничего не менять** — шаг существует, чтобы этого не сделали «на всякий случай».

Проверить, что сборка видит провайдер:

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep routine-push || echo "чисто"`
Expected: `чисто`

- [ ] **Step 11: Запустить все тесты модуля**

Run: `npx jest src/routine-push/`
Expected: PASS, 11 тестов.

- [ ] **Step 12: Проверить, что тест ловит регрессию**

Временно вернуть в `deliver` строку `const msg = routineMsg('ru');`

Run: `npx jest src/routine-push/routine-push.kind.spec.ts -t "англоязычный"`
Expected: **FAIL**. Если тест зелёный — он ничего не проверяет, чинить тест. Вернуть строку обратно.

- [ ] **Step 13: Коммит**

```bash
git add src/routine-push/routine-push.service.ts src/routine-push/routine-push.module.ts src/routine-push/routine-push.kind.spec.ts
git commit -m "feat(routine-push): пуши на языке профиля пользователя"
```

---

### Задача 4: Локаль `uz` — ПОД ГЕЙТОМ, не начинать без решения

**Не начинать, пока не выполнены оба условия:**

1. Проверено, что «Приём» принимает UZCARD/HUMO. Ответ «нет» — задача отменяется вместе с центральноазиатской гипотезой (см. спек, раздел «Риски»).
2. Решено, чем переводить. `scripts/translate-locales` требует `ANTHROPIC_API_KEY`, которого нет, и переписывает локаль целиком — запуск «как есть» затрёт существующие переводы.

**Files (когда гейт снят):**
- Modify: `spirits_back/src/common/services/language.service.ts:4` — добавить `'uz'` в `SUPPORTED_LANGUAGES`
- Modify: `spirits_back/src/routine-push/routine-messages.ts` — строки для `uz`
- Create: `spirits_front/src/i18n/locales/uz.json`
- Create: `land_linkeon/src/i18n/locales/uz.json`

Тест `routine-push.i18n.spec.ts` из задачи 3 упадёт сразу после добавления `'uz'` в `SUPPORTED_LANGUAGES` и не даст забыть строки пушей — это и есть его назначение.

Формы множественного числа для `uz` брать из `Intl.PluralRules`, а не копировать `_few`/`_many` из русского.

---

## Что этот план НЕ делает

- Не трогает канал привлечения, лендинг и метрики — это GTM-часть спека, кода в ней нет
- Не локализует `src/tg-bot` — Telegram по решению спека остаётся домашнему рынку
- Не трогает атрибуцию и онбординг — проверено, работают
- Не деплоит. Выкат — штатным `bash ~/Downloads/spirits_back/scripts/deploy.sh` без флагов, отдельно и по явному согласованию с владельцем
