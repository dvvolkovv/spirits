# Lifecycle-триггеры: активация (24ч) + retention (48ч)

**Backlog:** `c45c71df` (активация — основная новая работа) + `959a1ae5` (retention 48ч — почти покрыто существующим).
**Дата:** 2026-06-04 · **Статус:** дизайн утверждён.
**Решения владельца:** отправка **гейтованная** (preview + кнопка `confirm:true`), канал **только SMS** (email-SMTP не настроен, web-push нет).

## Контекст

Существует гейтованная retention-инфра (backlog 72cfc486):
- `AdminService.buildRetentionOutreach({minDays,maxDays})` — preview-сегмент «инактив N–M дней», ничего не шлёт.
- `AdminService.sendRetentionOutreach({confirm,...})` — GATED SMS (confirm:true), cooldown, лог в `events` (`retention_outreach`), кампания `retention_reengage_v1`.
- `AdminService.sendOutreachSms(phone,text)` — отправка через SMS Aero (переиспользуем).
- Эндпоинт `POST /webhook/admin/retention` (action: preview|send). Фронт: `AdminRetentionView.tsx`.

Активацию строим как ЗЕРКАЛО этого паттерна; retention-48ч — настройка окна существующего.

## Часть A — Активация (`c45c71df`, новое)

**Сегмент:** зарегистрировались ≥24ч назад (и не слишком давно — окно [24ч, 14 дней]), НИ разу не писали (нет human-сообщений), валидный RU-номер, исключая тестовых, с cooldown.

Запрос (в `buildActivationOutreach`):
```sql
SELECT a.user_id AS phone, a.preferred_agent, a.created_at,
       COALESCE(ag.display_name, ag.name) AS assistant_name
  FROM ai_profiles_consolidated a
  LEFT JOIN agents ag ON ag.name = a.preferred_agent
 WHERE a.created_at < now() - make_interval(hours => $1)   -- ≥24ч
   AND a.created_at > now() - make_interval(days  => $2)   -- ≤14 дней (свежие)
   AND a.user_id ~ '^7[0-9]{10}$'
   AND a.user_id <> ALL($3) AND a.user_id !~ $4            -- исключить тестовых
   AND NOT EXISTS (
     SELECT 1 FROM custom_chat_history c
      WHERE c.sender_type = 'human'
        AND (c.session_id = a.user_id OR c.session_id LIKE a.user_id || '\_%')
   )
 ORDER BY a.created_at DESC
```
Параметры: `minHours=24`, `maxDays=14`, `TEST_USERS`, `TEST_PATTERN`.

**Сообщение** (`buildActivationMessage(assistantName)`):
- если `preferred_agent` задан → «{assistant_name} из LINKEON готов(а) начать — загляните в чат: https://my.linkeon.io/chat …»;
- иначе → ассистент по умолчанию **Роман** (координатор), он сам направит.
Тон как в retention — тёпло, без навязчивости.

**Cooldown:** `events` name `activation_outreach`, `ACTIVATION_COOLDOWN_DAYS = 14` (как retention — не слать повторно в окне).

**Отправка** (`sendActivationOutreach({confirm,phones?,resend?})`): GATED — без `confirm:true` возвращает `{error:'confirm_required'}`. Шлёт через `sendOutreachSms`, лог каждой попытки в `events` (`activation_outreach`, props: phone/status/campaign/error). Кампания `activation_nudge_v1`.

**Эндпоинт:** `POST /webhook/admin/activation` (AdminGuard) — action `preview` → `buildActivationOutreach`, action `send` → `sendActivationOutreach`. Зеркало `admin/retention`.

**Фронт:** `AdminActivationView.tsx` — зеркало `AdminRetentionView` (preview-список с телефоном/днями-с-регистрации/предлагаемым ассистентом/текстом, кнопка «Отправить всем (вне cooldown)» с `window.confirm('…реальная отправка людям')`). Регистрация вкладки в `AdminPage.tsx`.

## Часть B — Retention 48ч (`959a1ae5`, почти готово)

Существующий retention ловит инактив `minDays–maxDays` (дефолт 3–30) — **48ч пропускается**. Дельта: в `AdminRetentionView` добавить пресеты окна (кнопки «От 2 дней (48ч)» и «3–30 дней»), передающие `minDays`/`maxDays` в preview/send. Бэкенд не меняем (окно уже параметр). Опционально: дефолт `minDays` 3→2.

## Часть C — Метрика активации (`c45c71df`)

В VPM-снимок (`vpm.service.ts`, funnel) добавить `activation_rate_7d = ROUND(100.0 * first_chat_users_7d / NULLIF(registrations_7d,0), 1)` (%). Оба слагаемых уже считаются.

## Края / отказоустойчивость

- Отправка строго GATED (`confirm:true`) — авто-рассылки НЕТ (решение владельца). Без SMS Aero кред → `sendOutreachSms` вернёт ошибку, залогируется, деплой/preview не падают.
- Тестовые номера и невалидные RU (UUID/'dozvon'-префиксы) исключены предикатом.
- Cooldown 14 дней — не спамим.

## Тесты

- Smoke (admin-JWT, как в b60ab28b): `POST /admin/activation {action:'preview'}` → 200 + форма `{count, drafts[]}`; `{action:'send'}` без confirm → `error:'confirm_required'` (НЕ шлёт). Retention preview с `minDays:2` → 200.
- Деплой: `bash scripts/deploy.sh`.

## Вне scope (YAGNI)

- Авто-cron отправки (владелец выбрал гейтованно).
- Email/push каналы (SMTP не настроен; push в вебе нет).
- A/B текстов; персонализация глубже preferred_agent.
