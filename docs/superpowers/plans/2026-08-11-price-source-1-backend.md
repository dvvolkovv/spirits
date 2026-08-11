# Один владелец прайса — план 1 из 3: бэкенд

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать `spirits_back` единственным владельцем цен на токены и начать отдавать прайс наружу, не сломав ни одного выложенного клиента.

**Architecture:** Новый модуль `src/payments/packages.ts` держит прайс. На него переводятся три потребителя, у каждого сейчас своя копия: сумма счёта в контроллере, объём начисления в сервисе, ответ `payments/methods`. Ответ расширяется полем `price` аддитивно — существующее `usd` остаётся для уже выложенных витрин.

**Tech Stack:** NestJS 10, TypeScript, jest.

**Спека:** `docs/superpowers/specs/2026-08-11-token-prices-single-source-design.md` (в репозитории spirits_front)

**Все команды выполняются из `/Users/dmitry/Downloads/spirits_back`.**

---

## Почему этот план существует

Прайс размазан по четырём местам в двух репозиториях. Копии расходились дважды:

- **08.04.2026** — `starter` не было в карте `tokensForPackage`, сработал откат `amount × 1000`, десять человек получили по 149 000 токенов вместо 50 000.
- **11.08.2026** — `business` и `maximum` доехали до витрины, оферты и карты токенов, но не до таблицы цен в контроллере. Покупка «Бизнеса» за 4 990 ₽ выставила бы счёт на 149 ₽ с начислением 50 000 токенов. Молча.

Этот план убирает три копии из четырёх. Четвёртая (фронт) уходит в плане 2, лендинг — в плане 3.

## Обратная совместимость — читать до начала

Бэкенд выкатывается ПЕРВЫМ, когда витрины ещё старые. Значит:

1. **Поле `usd` в ответе `payments/methods` трогать нельзя.** Выложенный фронт читает `p.usd` у валютных пакетов. Переименование сломает крипто-витрину у всех в момент выката. Поле `price` **добавляется рядом**, а `usd` убирается отдельной задачей после плана 2.
2. **Заполнение `packages` для рублёвого пути безопасно.** Старый фронт это поле для рублей игнорирует — у него свои зашитые цены.

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/payments/packages.ts` | **создать** — прайс и псевдонимы. Только данные, без зависимостей от Nest |
| `src/payments/packages.spec.ts` | **переписать** — инварианты прайса переезжают сюда из проверки констант |
| `src/payments/payments.controller.ts` | сумма счёта берётся из модуля вместо своей `pkgMap` |
| `src/payments/payments.service.ts` | `tokensForPackage` берёт объём из модуля вместо своей карты |
| `src/payments/priem.controller.ts` | `payments/methods` отдаёт рублёвые пакеты и поле `price` |
| `src/payments/create-payment.spec.ts` | существующий — должен остаться зелёным без правок |

---

## Задача 1: Модуль прайса

**Files:**
- Create: `src/payments/packages.ts`
- Modify: `src/payments/packages.spec.ts` (существует, будет переписан)

- [ ] **Шаг 1: Написать падающий тест**

Заменить содержимое `src/payments/packages.spec.ts` целиком на:

```ts
import { PACKAGES, ALIASES, resolvePackage } from './packages';
import { PRIEM_PACKAGES } from './priem.service';

/**
 * Прайс — не тот код, где незамеченная правка допустима. Ожидаемая таблица
 * выписана отдельно от реализации: правка цены «мимоходом» роняет тест, и
 * менять прайс приходится осознанно, в двух местах.
 */
const EXPECTED: Array<[string, number, number]> = [
  ['starter', 149, 50_000],
  ['extended', 499, 200_000],
  ['professional', 1990, 1_000_000],
  ['business', 4990, 3_000_000],
  ['maximum', 9990, 7_000_000],
];

const per1000 = (p: { priceRub: number; tokens: number }) => p.priceRub / (p.tokens / 1000);
const BASE_PER_1000 = 149 / 50;

describe('прайс токенов', () => {
  it('совпадает с согласованным списком', () => {
    expect(PACKAGES.map((p) => [p.id, p.priceRub, p.tokens])).toEqual(EXPECTED);
  });

  // Немонотонная лестница делает более крупную покупку невыгодной.
  it('цена за 1000 токенов строго убывает', () => {
    const prices = PACKAGES.map(per1000);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThan(prices[i - 1]);
    }
  });

  it('ярлык скидки не превышает фактическую выгоду', () => {
    for (const p of PACKAGES) {
      if (p.savingsPct === undefined) continue;
      expect(p.savingsPct).toBeLessThanOrEqual((1 - per1000(p) / BASE_PER_1000) * 100);
    }
  });

  it('ярлык скидки кратен пяти', () => {
    for (const p of PACKAGES) {
      if (p.savingsPct === undefined) continue;
      expect(p.savingsPct % 5).toBe(0);
    }
  });

  it('у базового пакета ярлыка нет', () => {
    expect(PACKAGES[0].savingsPct).toBeUndefined();
  });
});

describe('псевдонимы', () => {
  it('исторические имена ведут на живые пакеты', () => {
    for (const [alias, target] of Object.entries(ALIASES)) {
      expect(PACKAGES.some((p) => p.id === target)).toBe(true);
      expect(PACKAGES.some((p) => p.id === alias)).toBe(false);
    }
  });

  it('resolvePackage находит пакет и по своему имени, и по псевдониму', () => {
    expect(resolvePackage('professional')?.priceRub).toBe(1990);
    expect(resolvePackage('premium')?.priceRub).toBe(1990);
    expect(resolvePackage('basic')?.tokens).toBe(50_000);
  });

  it('resolvePackage не выдумывает пакет для незнакомого имени', () => {
    expect(resolvePackage('нет-такого')).toBeUndefined();
  });
});

describe('валютная линейка', () => {
  it('состоит из трёх пакетов', () => {
    expect(PRIEM_PACKAGES.map((p) => p.id)).toEqual(['pro_usd', 'business_usd', 'maximum_usd']);
  });

  it('цена за миллион токенов строго убывает', () => {
    const perMillion = PRIEM_PACKAGES.map((p) => p.usd / (p.tokens / 1_000_000));
    for (let i = 1; i < perMillion.length; i++) {
      expect(perMillion[i]).toBeLessThan(perMillion[i - 1]);
    }
  });

  it('max_usd больше не заказывается', () => {
    expect(PRIEM_PACKAGES.find((p) => p.id === 'max_usd')).toBeUndefined();
  });
});
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

Run: `npx jest src/payments/packages.spec.ts`
Expected: FAIL — `Cannot find module './packages'`.

- [ ] **Шаг 3: Написать модуль**

Создать `src/payments/packages.ts`:

```ts
/**
 * Прайс токенов — единственный владелец цифр во всей системе.
 *
 * До этого модуля цена жила в четырёх местах: витрина приложения, таблица цен
 * в контроллере оплаты, карта объёмов в сервисе и прайс лендинга. Копии
 * расходились дважды. 08.04.2026 у `starter` не было объёма, сработал откат
 * `amount × 1000`, и десять человек получили по 149 000 токенов вместо 50 000.
 * 11.08.2026 новые тарифы не доехали до таблицы цен, и «Бизнес» за 4 990 ₽
 * выставил бы счёт на 149 ₽ с начислением 50 000 вместо 3 000 000.
 *
 * Проценты скидок — ЯРЛЫКИ, а не расчёт: округлены вниз до пятёрки, чтобы
 * обещание в интерфейсе оставалось заведомо выполнимым. Тест рядом следит,
 * чтобы ярлык не обогнал фактическую выгоду.
 */

export interface TokenPackage {
  id: string;
  priceRub: number;
  tokens: number;
  /** Ярлык скидки в процентах. У базового пакета отсутствует. */
  savingsPct?: number;
}

export const PACKAGES: TokenPackage[] = [
  { id: 'starter', priceRub: 149, tokens: 50_000 },
  { id: 'extended', priceRub: 499, tokens: 200_000, savingsPct: 15 },
  { id: 'professional', priceRub: 1990, tokens: 1_000_000, savingsPct: 30 },
  { id: 'business', priceRub: 4990, tokens: 3_000_000, savingsPct: 40 },
  { id: 'maximum', priceRub: 9990, tokens: 7_000_000, savingsPct: 50 },
];

/**
 * Исторические имена пакетов. Держатся отдельно от прайса намеренно: они
 * нужны старым клиентам, но тарифами не являются и наружу не отдаются —
 * иначе витрина показала бы восемь позиций вместо пяти.
 */
export const ALIASES: Record<string, string> = {
  basic: 'starter',
  standard: 'extended',
  premium: 'professional',
};

/** Пакет по имени или историческому псевдониму. undefined — имя незнакомое. */
export function resolvePackage(id: string): TokenPackage | undefined {
  const key = ALIASES[id] ?? id;
  return PACKAGES.find((p) => p.id === key);
}
```

- [ ] **Шаг 4: Запустить и убедиться, что проходит**

Run: `npx jest src/payments/packages.spec.ts`
Expected: PASS, 11 тестов.

- [ ] **Шаг 5: Сломать нарочно**

Временно поменять у `business` `savingsPct: 40` на `45`.

Run: `npx jest src/payments/packages.spec.ts`
Expected: FAIL — «ярлык скидки не превышает фактическую выгоду» (45 > 44.18).

Вернуть `40`, прогнать снова — PASS. Приведи вывод обеих команд: зелёный тест, который не умеет краснеть, ничего не проверяет.

- [ ] **Шаг 6: Коммит**

```bash
git add src/payments/packages.ts src/payments/packages.spec.ts
git commit -m "feat(payments): прайс токенов сведён в один модуль

Цена жила в четырёх местах и расходилась дважды. Модуль становится
владельцем цифр; потребители переводятся на него следующими коммитами."
```

---

## Задача 2: Контроллер оплаты берёт цену из модуля

**Files:**
- Modify: `src/payments/payments.controller.ts`
- Test: `src/payments/create-payment.spec.ts` (существует, править не нужно)

Существующий тест уже проверяет, что каждый пакет витрины выставляется на свою цену и что неизвестный пакет получает 400. Он и есть страховка этой задачи: после правки он обязан остаться зелёным.

- [ ] **Шаг 1: Убедиться, что тест сейчас зелёный**

Run: `npx jest src/payments/create-payment.spec.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 2: Заменить локальную таблицу на модуль**

В `src/payments/payments.controller.ts` добавить импорт:

```ts
import { resolvePackage } from './packages';
```

Заменить блок от комментария `// Цена пакета.` до строки `const mapped = pkgMap[pkg];` включительно на:

```ts
    // Цена пакета приходит из общего модуля — сумму называет сервер, из
    // клиента она не берётся никогда. Своя таблица цен здесь была четвёртой
    // копией прайса и 11.08.2026 разошлась с витриной: новые тарифы
    // продавались бы по 149 ₽ с начислением 50 000 токенов вместо 3 000 000.
    const pkg = body.package || body.package_id || 'basic';
    const mapped = resolvePackage(pkg);
```

Ниже, в месте вызова сервиса, заменить `mapped.amount` и `mapped.pkg`:

```ts
    const result = await this.paymentsService.createPayment(user.userId, mapped.priceRub, mapped.id);
```

Блок с `if (!mapped)` и отказом 400 оставить как есть — он уже написан и проверен тестом.

- [ ] **Шаг 3: Запустить тест**

Run: `npx jest src/payments/create-payment.spec.ts`
Expected: PASS, 7 тестов — те же, что до правки.

- [ ] **Шаг 4: Сломать нарочно**

Временно убрать `business` из массива `PACKAGES` в `src/payments/packages.ts`.

Run: `npx jest src/payments/create-payment.spec.ts`
Expected: FAIL — «business выставляется на 4990 ₽».

Это доказывает, что контроллер действительно читает модуль, а не унаследованную таблицу. Вернуть пакет, прогнать — PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add src/payments/payments.controller.ts
git commit -m "refactor(payments): сумма счёта берётся из модуля прайса

Своя таблица цен в контроллере была четвёртой копией и 11.08 разошлась с
витриной. Теперь цена приходит оттуда же, откуда объём начисления."
```

---

## Задача 3: Начисление берёт объём из модуля

**Files:**
- Modify: `src/payments/payments.service.ts`
- Test: `src/payments/packages.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

Дописать в конец `src/payments/packages.spec.ts`:

```ts
import { PaymentsService } from './payments.service';

describe('начисление за пакет', () => {
  // tokensForPackage приватный: это часть контракта оплаты, а не публичный
  // API. Метод не обращается к this, поэтому зовём его через прототип.
  const tokensFor = (id: string, amount = 0): number =>
    (PaymentsService.prototype as any).tokensForPackage.call(null, id, amount);

  for (const [id, , tokens] of EXPECTED) {
    it(`${id} начисляет ${tokens}`, () => {
      expect(tokensFor(id)).toBe(tokens);
    });
  }

  it('исторические имена начисляют столько же, сколько нынешние', () => {
    expect(tokensFor('basic')).toBe(tokensFor('starter'));
    expect(tokensFor('standard')).toBe(tokensFor('extended'));
    expect(tokensFor('premium')).toBe(tokensFor('professional'));
  });

  // Откат существует, чтобы платёж не остался без начисления вовсе. Число
  // будет не то, но деньги не пропадут, и это лучше нуля.
  it('незнакомый пакет откатывается на формулу от суммы', () => {
    expect(tokensFor('нет-такого', 7)).toBe(7000);
  });
});
```

Импорт `PaymentsService` перенести наверх файла, к остальным импортам.

- [ ] **Шаг 2: Запустить — тесты пройдут сразу, и это правильно**

Run: `npx jest src/payments/packages.spec.ts`
Expected: **PASS**.

Красного здесь не будет, и подгонять его не надо. Хотфикс от 11.08 уже привёл карту в сервисе в соответствие с прайсом: `business` и `maximum` в ней есть, а исторические имена заданы теми же числами, что нынешние. Поведение сейчас верное.

Ценность этой задачи не в исправлении поведения, а в устранении дублирования: сегодня совпадение карты с прайсом держится на внимательности, а после правки — на устройстве. Доказывает это шаг 5, а не шаг 2.

Тесты, написанные на шаге 1, при этом не бесполезны: они фиксируют текущее верное поведение и не дадут ему разъехаться при правке модуля.

- [ ] **Шаг 3: Заменить карту на модуль**

В `src/payments/payments.service.ts` добавить импорт:

```ts
import { resolvePackage } from './packages';
```

Заменить метод `tokensForPackage` целиком на:

```ts
  /**
   * Сколько токенов начислить за пакет.
   *
   * Объём приходит из общего модуля прайса. Своя карта здесь была третьей
   * копией и 08.04.2026 подвела: `starter` в ней отсутствовал, сработал
   * откат, и десять человек получили по 149 000 токенов вместо 50 000.
   *
   * Откат по сумме оставлен намеренно: если имя пакета всё же окажется
   * незнакомым, платёж не должен остаться без начисления вовсе. Число будет
   * не то, но деньги не пропадут.
   */
  private tokensForPackage(pkg: string, amount: number): number {
    return resolvePackage(pkg)?.tokens ?? Math.floor((amount || 0) * 1000);
  }
```

- [ ] **Шаг 4: Запустить тесты**

Run: `npx jest src/payments/packages.spec.ts`
Expected: PASS.

- [ ] **Шаг 5: Сломать нарочно**

Временно поменять у `maximum` в модуле `tokens: 7_000_000` на `6_000_000`.

Run: `npx jest src/payments/packages.spec.ts`
Expected: FAIL — и «совпадает с согласованным списком», и «maximum начисляет 7000000». Два разных теста ловят одну правку с разных сторон.

Вернуть, прогнать — PASS.

- [ ] **Шаг 6: Коммит**

```bash
git add src/payments/payments.service.ts src/payments/packages.spec.ts
git commit -m "refactor(payments): объём начисления берётся из модуля прайса

Своя карта в сервисе была третьей копией. 08.04 в ней не было starter, и
десять человек получили по 149 000 токенов вместо 50 000."
```

---

## Задача 4: Ответ payments/methods отдаёт прайс

**Files:**
- Modify: `src/payments/priem.controller.ts`
- Create: `src/payments/methods.spec.ts`

Здесь главное — не сломать выложенные витрины. Поле `usd` остаётся, поле `price` добавляется рядом.

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/payments/methods.spec.ts`:

```ts
import { PriemController } from './priem.controller';
import { PACKAGES } from './packages';

/**
 * Ответ этого эндпоинта читают уже выложенные витрины, поэтому форма
 * расширяется только аддитивно: поле `usd` у валютных пакетов остаётся до тех
 * пор, пока все витрины не перейдут на `price`.
 */

function fakeRes() {
  const out: any = {};
  return {
    out,
    status(code: number) { out.code = code; return this; },
    json(body: any) { out.body = body; return this; },
  };
}

/** «Приём» настроен и отдаёт свои пакеты. */
const priemOn = {
  configured: () => true,
  packages: () => [{ id: 'pro_usd', tokens: 1_000_000, usd: 25, cardAvailable: true }],
};

describe('payments/methods', () => {
  it('для русского языка отдаёт рублёвый прайс', async () => {
    const res = fakeRes();
    await new PriemController(priemOn as any).methods('ru', res as any);

    expect(res.out.body.provider).toBe('yookassa');
    expect(res.out.body.currency).toBe('RUB');
    expect(res.out.body.packages.map((p: any) => p.id)).toEqual(PACKAGES.map((p) => p.id));
  });

  it('рублёвый пакет несёт цену, объём и ярлык скидки', async () => {
    const res = fakeRes();
    await new PriemController(priemOn as any).methods('ru', res as any);

    const pro = res.out.body.packages.find((p: any) => p.id === 'professional');
    expect(pro).toMatchObject({ price: 1990, tokens: 1_000_000, savingsPct: 30 });
  });

  it('исторические псевдонимы наружу не отдаются', async () => {
    const res = fakeRes();
    await new PriemController(priemOn as any).methods('ru', res as any);

    const ids = res.out.body.packages.map((p: any) => p.id);
    expect(ids).not.toContain('basic');
    expect(ids).not.toContain('premium');
  });

  // Выложенная витрина читает p.usd. Уберём его — крипто-витрина у всех
  // сломается в момент выката, ещё до обновления фронта.
  it('валютный пакет сохраняет usd и получает price рядом', async () => {
    const res = fakeRes();
    await new PriemController(priemOn as any).methods('en', res as any);

    expect(res.out.body.provider).toBe('priem');
    const pkg = res.out.body.packages[0];
    expect(pkg.usd).toBe(25);
    expect(pkg.price).toBe(25);
  });

  it('без настроенного «Приёма» иностранец видит рублёвую витрину', async () => {
    const priemOff = { configured: () => false, packages: () => [] };
    const res = fakeRes();
    await new PriemController(priemOff as any).methods('en', res as any);

    expect(res.out.body.provider).toBe('yookassa');
    expect(res.out.body.packages.length).toBe(PACKAGES.length);
  });
});
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

Run: `npx jest src/payments/methods.spec.ts`
Expected: FAIL — для `ru` массив `packages` пуст, у валютного пакета нет `price`.

- [ ] **Шаг 3: Заполнить ответ**

В `src/payments/priem.controller.ts` добавить импорт:

```ts
import { PACKAGES } from './packages';
```

Заменить блок `return res.status(200).json({...})` на:

```ts
    // Прайс отдаётся обоим путям. Рублёвый берётся из общего модуля: раньше
    // здесь стояло `packages: []` с пометкой «рублёвые зашиты на фронте», и
    // ровно из-за этого прайс расходился между витриной, лендингом и
    // контроллером оплаты.
    //
    // Поле `price` — в валюте ответа. У валютных пакетов рядом сохраняется
    // `usd`: его читают уже выложенные витрины, и убрать его можно только
    // после того, как все они перейдут на `price`.
    const packages = useCrypto
      ? this.priem.packages().map((p) => ({ ...p, price: p.usd }))
      : PACKAGES.map((p) => ({
          id: p.id,
          tokens: p.tokens,
          price: p.priceRub,
          savingsPct: p.savingsPct,
        }));

    return res.status(200).json({
      language: lang,
      provider: useCrypto ? 'priem' : 'yookassa',
      currency: useCrypto ? 'USD' : 'RUB',
      packages,
      available: true,
    });
```

- [ ] **Шаг 4: Запустить тест**

Run: `npx jest src/payments/methods.spec.ts`
Expected: PASS, 5 тестов.

- [ ] **Шаг 5: Сломать нарочно — проверить страховку совместимости**

Временно убрать `usd` из ответа: заменить `.map((p) => ({ ...p, price: p.usd }))` на `.map((p) => ({ id: p.id, tokens: p.tokens, price: p.usd, cardAvailable: p.cardAvailable }))`.

Run: `npx jest src/payments/methods.spec.ts`
Expected: FAIL — «валютный пакет сохраняет usd и получает price рядом».

Это и есть тест, который стоит между нами и сломанной крипто-витриной у всех пользователей. Вернуть как было, прогнать — PASS.

- [ ] **Шаг 6: Коммит**

```bash
git add src/payments/priem.controller.ts src/payments/methods.spec.ts
git commit -m "feat(payments): payments/methods отдаёт рублёвый прайс

Раньше для рублей возвращался пустой массив с пометкой «зашиты на фронте» —
из-за этого прайс и расходился по копиям. Поле price добавлено аддитивно,
usd у валютных пакетов сохранён: его читают уже выложенные витрины."
```

---

## Задача 5: Сквозная проверка

- [ ] **Шаг 1: Все тесты платежей**

Run: `npx jest src/payments/`
Expected: PASS. Существующий `priem.service.spec.ts` и `create-payment.spec.ts` обязаны быть зелёными без правок.

- [ ] **Шаг 2: Сборка**

Run: `npm run build`
Expected: успех, без вывода ошибок.

- [ ] **Шаг 3: Убедиться, что копий больше нет**

Run: `grep -n "1990\|4990\|9990" src/payments/*.ts | grep -v spec | grep -v packages.ts`
Expected: пусто. Единственное место с рублёвыми ценами — `packages.ts`.

Run: `grep -n "50000\|200000\|1000000" src/payments/*.ts | grep -v spec | grep -v packages.ts`
Expected: пусто.

Если что-то нашлось — это уцелевшая копия, её надо перевести на модуль.

- [ ] **Шаг 4: Проверить ответ живьём локально**

Запустить сервис локально не требуется: форма ответа закреплена тестами `methods.spec.ts`. Достаточно убедиться, что модуль и ответ согласованы:

Run: `npx jest src/payments/methods.spec.ts src/payments/packages.spec.ts`
Expected: PASS.

- [ ] **Шаг 5: Готовность**

Run: `git status --short`
Expected: пусто — всё закоммичено по ходу задач.

Деплой **только** через `bash ~/Downloads/spirits_back/scripts/deploy.sh` и **только** по явному согласованию с владельцем.

После выката этого плана система остаётся полностью работоспособной: выложенные витрины продолжают показывать свои зашитые цены и новое поле игнорируют. Планы 2 (фронт) и 3 (лендинг) переводят их на API.

---

## Что этот план не делает

- Витрины приложения — план 2.
- Лендинг — план 3.
- **Сторож в smoke**, сверяющий цены из API с текстом оферты в выложенных
  бандлах. Он относится к плану 2: до перехода витрин на API текст оферты и
  прайс живут в разных репозиториях независимо, и проверять их согласованность
  ещё нечем — расхождение там сейчас законно.
- Удаление поля `usd` из ответа — отдельная задача после плана 2, когда ни один
  выложенный клиент его больше не читает.
- Перенос прайса в таблицу `token_packages` — отдельный проект; API после него
  не изменится.
