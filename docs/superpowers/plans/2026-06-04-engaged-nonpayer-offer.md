# Оффер вовлечённому неплатящему Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development или executing-plans. Steps — чекбоксы.

**Goal:** +50% бонусных токенов к первой покупке вовлечённого неплатящего; неблокирующий баннер в чате; воронка в events.

**Architecture:** Новый модуль `offer` (eligibility + dismiss + миграция onModuleInit). Бонус — server-side в `PaymentsService` (точка начисления). Фронт — `OfferBanner` в чате.

**Tech:** NestJS + pg; React + i18next. Деплой: `bash scripts/deploy.sh`. Миграции — onModuleInit (deploy.sh не мигрирует).

**Спека:** `spirits_front/docs/superpowers/specs/2026-06-04-engaged-nonpayer-offer-design.md`

---

## Task 1: Бэкенд — модуль offer (миграция + service + controller)

**Files:**
- Create: `spirits_back/src/offer/migrations/001_offer.sql`, `offer.service.ts`, `offer.controller.ts`, `offer.module.ts`
- Modify: `spirits_back/src/app.module.ts` (register OfferModule)

- [ ] **Step 1: Миграция** `src/offer/migrations/001_offer.sql`:
```sql
-- 001_offer.sql — cooldown-метка для оффера вовлечённому неплатящему.
ALTER TABLE ai_profiles_consolidated
  ADD COLUMN IF NOT EXISTS offer_dismissed_at timestamptz;
```

- [ ] **Step 2: OfferService** (`offer.service.ts`) — onModuleInit-миграция + eligibility + dismiss:
```ts
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { EventsService } from '../events/events.service';
import * as fs from 'fs';
import * as path from 'path';

const MSG_THRESHOLD = 15;
const BONUS_PCT = 50;

@Injectable()
export class OfferService implements OnModuleInit {
  private readonly logger = new Logger(OfferService.name);
  constructor(private readonly pg: PgService, @Optional() private readonly events?: EventsService) {}

  async onModuleInit() {
    for (const file of ['001_offer.sql']) {
      for (const p of [path.join(__dirname, 'migrations', file), path.join(__dirname, '..', '..', 'src', 'offer', 'migrations', file)]) {
        try { if (fs.existsSync(p)) { await this.pg.query(fs.readFileSync(p, 'utf8')); this.logger.log(`offer migration ${file} applied`); break; } }
        catch (e: any) { this.logger.error(`offer migration ${file} failed: ${e.message}`); }
      }
    }
  }

  async messageCount(userId: string): Promise<number> {
    const r = await this.pg.query(
      `SELECT count(*)::int AS n FROM custom_chat_history
       WHERE sender_type = 'human' AND (session_id = $1 OR session_id LIKE $1 || '\\_%')`,
      [userId],
    );
    return r.rows[0]?.n ?? 0;
  }

  async hasPaid(userId: string): Promise<boolean> {
    const r = await this.pg.query(`SELECT 1 FROM payments WHERE user_id = $1 AND status = 'succeeded' LIMIT 1`, [userId]);
    return r.rows.length > 0;
  }

  async status(userId: string) {
    const [n, paid, prof] = await Promise.all([
      this.messageCount(userId),
      this.hasPaid(userId),
      this.pg.query(`SELECT offer_dismissed_at FROM ai_profiles_consolidated WHERE user_id = $1`, [userId]),
    ]);
    const dismissedAt = prof.rows[0]?.offer_dismissed_at;
    const inCooldown = dismissedAt ? (Date.now() - new Date(dismissedAt).getTime()) < 7 * 864e5 : false;
    const eligible = n >= MSG_THRESHOLD && !paid && !inCooldown;
    return { eligible, bonus_pct: BONUS_PCT, message_count: n };
  }

  async dismiss(userId: string) {
    await this.pg.query(`UPDATE ai_profiles_consolidated SET offer_dismissed_at = now() WHERE user_id = $1`, [userId]);
    this.events?.track('offer_dismissed', { userId, props: {} });
    return { ok: true };
  }
}
```
(Сверить сигнатуру `EventsService.track` с реальной — в payments.service.ts это `this.events?.track('name', { userId, props })`.)

- [ ] **Step 3: OfferController** (`offer.controller.ts`):
```ts
import { Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { OfferService } from './offer.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('')
export class OfferController {
  constructor(private readonly offer: OfferService) {}

  @Get('offer/status')
  @UseGuards(JwtGuard)
  async status(@CurrentUser() user: any, @Res() res: Response) {
    return res.status(200).json(await this.offer.status(user.userId));
  }

  @Post('offer/dismiss')
  @UseGuards(JwtGuard)
  async dismiss(@CurrentUser() user: any, @Res() res: Response) {
    return res.status(200).json(await this.offer.dismiss(user.userId));
  }
}
```

- [ ] **Step 4: OfferModule** + регистрация в app.module.ts (по образцу других модулей: imports EventsModule если нужно; providers OfferService; controllers OfferController; exports OfferService).

- [ ] **Step 5: Typecheck** `npx tsc --noEmit -p tsconfig.build.json` → 0 src-ошибок. **Commit.**

---

## Task 2: Бэкенд — бонус в PaymentsService + чистая функция + unit

**Files:**
- Modify: `spirits_back/src/payments/payments.service.ts` (обработчик нотификации, ~стр. 93-102)
- Create/Modify: `spirits_back/tests/unit/offerBonus.test.js`

- [ ] **Step 1: Чистая функция расчёта** — добавить экспортируемый хелпер (в payments.service.ts или отдельный `src/offer/offer-bonus.ts`):
```ts
export function creditWithBonus(base: number, firstPayment: boolean, engaged: boolean): number {
  return firstPayment && engaged ? Math.round(base * 1.5) : base;
}
```

- [ ] **Step 2: Unit-тест** `tests/unit/offerBonus.test.js`:
```js
const { creditWithBonus } = require('../../dist/offer/offer-bonus'); // или путь к функции
test('bonus only on first payment of engaged user', () => {
  expect(creditWithBonus(1000000, true, true)).toBe(1500000);
  expect(creditWithBonus(1000000, false, true)).toBe(1000000);
  expect(creditWithBonus(1000000, true, false)).toBe(1000000);
});
```
(Если jest гоняет .ts — импортировать из src; сверить конфиг jest в репо.)

- [ ] **Step 3: Встроить в обработчик** (payments.service.ts, между `tokensToAdd` и `UPDATE ... tokens + $1`):
```ts
    // Оффер вовлечённому: +50% к ПЕРВОЙ оплате (server-side, до пометки succeeded)
    const priorPaid = await this.pg.query(`SELECT count(*)::int AS n FROM payments WHERE user_id=$1 AND status='succeeded'`, [userId]);
    const firstPayment = (priorPaid.rows[0]?.n ?? 0) === 0;
    const msgCnt = await this.pg.query(`SELECT count(*)::int AS n FROM custom_chat_history WHERE sender_type='human' AND (session_id=$1 OR session_id LIKE $1 || '\\_%')`, [userId]);
    const engaged = (msgCnt.rows[0]?.n ?? 0) >= 15;
    const credit = creditWithBonus(tokensToAdd, firstPayment, engaged);
```
Заменить `tokensToAdd` на `credit` в `UPDATE ai_profiles_consolidated SET tokens = tokens + $1`. После UPDATE — если `credit > tokensToAdd`: `this.events?.track('offer_converted', { userId, props: { base: tokensToAdd, bonus: credit - tokensToAdd, payment_id: paymentId } });`

- [ ] **Step 4: Typecheck + unit прогон (если возможно локально) + Commit.**

---

## Task 3: Бэкенд — smoke для offer

**Files:** Modify `spirits_back/tests/smoke/smoke.js`

- [ ] **Step 1:** Добавить step после онбординг-проверки:
```js
  await step('offer status + dismiss', async () => {
    if (!jwt) throw new Error('no JWT');
    const s = await axios.get(`${BASE_URL}/webhook/offer/status`, { headers: { Authorization: `Bearer ${jwt}` }, timeout: 10000 });
    if (typeof s.data?.eligible !== 'boolean' || s.data?.bonus_pct !== 50) throw new Error('bad offer/status shape');
    const d = await axios.post(`${BASE_URL}/webhook/offer/dismiss`, {}, { headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    if (d.data?.ok !== true) throw new Error('dismiss not ok');
    return `eligible=${s.data.eligible} msgs=${s.data.message_count}`;
  });
```
- [ ] **Step 2:** `node -c smoke.js`; **Commit** (Task 1-3 одним коммитом бэка ок).

---

## Task 4: Фронт — OfferBanner + i18n

**Files:** Create `spirits_front/src/components/tokens/OfferBanner.tsx`; Modify `i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: i18n** блок `offer`:
```json
"offer": {
  "text": "Вы уже провели большой разговор — продолжите с полным доступом. Первый пакет — на 50% больше токенов 🎁",
  "cta": "Выбрать пакет",
  "badge": "🎁 +50% к первому пакету"
}
```
en — аналогично.

- [ ] **Step 2: OfferBanner.tsx** — fetch `/offer/status` через apiClient, sessionStorage-гейт `offer_banner_shown`, рендер при eligible, `track` через `POST /webhook/events/track`, CTA → `navigate('/chat?view=tokens&offer=1')`, «×» → `apiClient.post('/webhook/offer/dismiss', {})`. Полный код — в реализации по образцу существующих компонентов (apiClient, useTranslation, useNavigate).

- [ ] **Step 3: Typecheck + Commit.**

---

## Task 5: Фронт — встроить баннер + бейдж на пакетах

**Files:** Modify `ChatInterface.tsx` (рендер OfferBanner над инпутом), `TokenPackages.tsx` (бейдж при `?offer=1`)

- [ ] **Step 1:** В ChatInterface над контейнером поля ввода вставить `<OfferBanner />` (показывает себя сам по eligibility).
- [ ] **Step 2:** В TokenPackages.tsx: если `new URLSearchParams(location.search).get('offer')==='1'` — на карточках показать бейдж `t('offer.badge')`.
- [ ] **Step 3: Typecheck + Commit.**

---

## Task 6: Playwright

**Files:** Modify `spirits_back/tests/playwright/smoke.spec.js`

- [ ] **Step 1:** Тест: залогиниться; если баннер eligible — проверить рендер `data-testid="offer-banner"`, клик «×» (`offer-dismiss`) скрывает. Толерантно к not-eligible (skip если не виден). **Commit.**

---

## Task 7: Деплой + верификация + закрытие

- [ ] **Step 1:** `bash scripts/deploy.sh` (фон) → `ALL PHASES GREEN`. Миграция offer применится onModuleInit на pm2 restart.
- [ ] **Step 2:** Прод-проверка: `GET /webhook/offer/status` с тест-JWT отдаёт `{eligible,bonus_pct:50,message_count}`.
- [ ] **Step 3:** Комментарий с итогом + перевод в done ОБЕИХ задач (e184d001 + 24119f86).

## Заметки для комментариев к задаче
- Бонус строго server-side (первая оплата вовлечённого ≥15 msg) — клиент/баннер не влияют, накрутки нет.
- Миграция offer_dismissed_at — через OfferService.onModuleInit (deploy.sh не мигрирует).
- Воронка offer_shown/clicked/dismissed/converted в events — для замера конверсии.
- Fail-closed: offer/status упал → баннер не показываем.
