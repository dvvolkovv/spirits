# Оффер вовлечённому неплатящему: бонус к первой покупке

**Backlog:** объединяет `e184d001` (soft-paywall на 15 сообщений — основная) + `24119f86` (targeted-оффер — мёржится сюда).
**Дата:** 2026-06-04
**Статус:** дизайн утверждён, готов к плану
**Репозитории:** `spirits_back` (eligibility + бонус + аналитика) + `spirits_front` (баннер).

**Деплой:** только `bash scripts/deploy.sh`. Миграции — через `onModuleInit` модуля (deploy.sh их не гоняет; см. [[linkeon-migrations]]).

## Контекст и проблема

VPM выявил: вовлечённые пользователи с нулевой монетизацией (`personal_growth`: 14 сообщений, retention 100%, `avg_payment_rub=0`) — упущенная выручка. Цель — конвертировать вовлечённого неплатящего в платящего бонусом к первой покупке в пиковый момент (привычка сформирована, ценность получена).

**Важное ограничение (выяснено по коду):** «персона» — это аналитический агрегат `PersonasService`, НЕ per-user поле (per-user таблицы персон нет). Поэтому таргетинг — **поведенческий**: число сообщений + факт неоплаты, а не персона.

**Инфра:** платежи — фиксированные пакеты (149/499/1990 ₽) через YooKassa; начисление токенов — в обработчике нотификации `PaymentsService` (`UPDATE ai_profiles_consolidated SET tokens = tokens + $1`, idempotent-гард по `payments.status`). Купоны = грант токенов (не скидка) — поэтому механика оффера = **бонусные токены**, а не скидка на платёж.

## Дизайн-решение (утверждено)

- **Механика:** +50% бонусных токенов к **первой** успешной оплате вовлечённого пользователя. Применяется **server-side, детерминированно** — баннер только рекламирует, клиентскому флагу не доверяем (накрутить нельзя).
- **Триггер (eligibility):** `message_count ≥ 15` И нет успешных оплат И не в cooldown.
- **Таргетинг:** все вовлечённые неплатящие (не ограничено категорией ассистента).
- **Баннер:** неблокирующий, закрываемый, в чате над полем ввода; показ 1×/сессия; «×» → cooldown 7 дней.

## Eligibility (server-side, источник истины)

`eligible = (message_count ≥ 15) AND (NOT has_paid) AND (NOT in_cooldown)`, где:
- `message_count` = `SELECT count(*) FROM custom_chat_history WHERE sender_type='human' AND (session_id = $userId OR session_id LIKE $userId || '\_%')`. (`session_id` — телефон = `user_id`, опц. суффикс `_<agentId>`.)
- `has_paid` = `EXISTS (SELECT 1 FROM payments WHERE user_id=$userId AND status='succeeded')`.
- `in_cooldown` = `offer_dismissed_at IS NOT NULL AND offer_dismissed_at > now() - interval '7 days'`.

## Механика бонуса (PaymentsService, обработчик нотификации)

В точке начисления (между чтением `tokensToAdd` и `UPDATE ... tokens + $1`), ДО пометки оплаты succeeded:
1. `firstPayment` = `SELECT count(*) FROM payments WHERE user_id=$1 AND status='succeeded'` == 0.
2. `engaged` = `message_count ≥ 15` (тот же COUNT по `custom_chat_history`).
3. `credit = (firstPayment && engaged) ? Math.round(tokensToAdd * 1.5) : tokensToAdd`.
4. `UPDATE ... SET tokens = tokens + credit`.
5. Если бонус применён — `events.track('offer_converted', { base: tokensToAdd, bonus: credit - tokensToAdd, payment_id })`.

Идемпотентность сохраняется существующим гардом (`if status==='succeeded' return`). Реферальная комиссия считается от `amount` (деньги), не от токенов — бонус её не задевает.

## Эндпоинты (новый модуль `offer`)

- `GET /webhook/offer/status` (JwtGuard) → `{ eligible: boolean, bonus_pct: 50, message_count: number }`.
- `POST /webhook/offer/dismiss` (JwtGuard) → `UPDATE ai_profiles_consolidated SET offer_dismissed_at = now()`; `events.track('offer_dismissed')`; `{ ok: true }`.

## Данные / миграция

- `src/offer/migrations/001_offer.sql`: `ALTER TABLE ai_profiles_consolidated ADD COLUMN IF NOT EXISTS offer_dismissed_at timestamptz;`
- Применяется в `OfferService.onModuleInit` (паттерн `ProfileService`/`BacklogService`).

## Аналитика (`events`)

- `offer_shown` — фронт постит при показе баннера (через существующий `POST /webhook/events/track`).
- `offer_clicked` — фронт при клике CTA.
- `offer_dismissed` — бэк в `/offer/dismiss`.
- `offer_converted` — бэк при применении бонуса.

Это даёт воронку shown→clicked→converted (требование задачи «измерить конверсию отдельно»).

## Фронтенд

- `components/tokens/OfferBanner.tsx` — на маунте (в чате) `GET /offer/status`; если `eligible` И не показан в этой сессии (`sessionStorage 'offer_banner_shown'`) → рендер баннера + `track('offer_shown')`.
  - Текст (i18n): «🎁 Вы уже провели большой разговор — продолжите с полным доступом. Первый пакет — на 50% больше токенов.» [Выбрать пакет] [×].
  - CTA → навигация `/chat?view=tokens&offer=1` + `track('offer_clicked')`.
  - «×» → `POST /offer/dismiss` + скрыть + `sessionStorage`.
- Размещение: в `ChatInterface` над полем ввода (рядом с reopen-кнопкой/инпутом).
- `TokenPackages.tsx`: при `?offer=1` показать бейдж «🎁 +50% к первому пакету» на карточках пакетов (информативно; реальный бонус всё равно начисляет бэк).
- i18n ru/en: `offer.*`.

## Края / отказоустойчивость

- `GET /offer/status` упал → баннер НЕ показываем (fail-closed, не мешаем чату).
- Оплатил → `has_paid` true → баннер исчезает навсегда; бонус — только на первую оплату (последующие обычные).
- Бонус строго server-side по факту первой оплаты вовлечённого — клиент не влияет (бейдж/флаг `?offer=1` — только UI).
- `message_count` COUNT по `custom_chat_history` — при текущем масштабе дёшево; при росте можно кешировать.

## Тесты

- API-smoke: `GET /offer/status` отдаёт `{eligible, bonus_pct, message_count}` с JWT; `POST /offer/dismiss` → `ok` и после него `eligible=false` (cooldown).
- Unit (`tests/unit/`): чистая функция расчёта кредита — `(firstPayment && engaged) → ×1.5`, иначе база; граница 14/15 сообщений; второй платёж → база.
- Playwright: для eligible-юзера баннер виден над инпутом, «×» скрывает его, CTA ведёт в пакеты. (Eligibility флакки — тест устойчив: проверяем рендер при наличии, без жёсткого reset флага.)

## Вне scope (YAGNI)

- Скидка на платёж / спец-пакеты (выбрана механика бонусных токенов).
- Ограничение по категории ассистента (таргет — все вовлечённые неплатящие).
- Таймер-ургентность оффера («осталось 48ч»).
- Персистентная per-user таблица персон (агрегата VPM достаточно).
