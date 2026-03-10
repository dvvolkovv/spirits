# План: Реферальная система для my.linkeon.io (упрощённая)

## Контекст

Внутренняя валюта Линкеоны — не нужна. Система должна:
1. Давать лидерам (агентам) именную реферальную ссылку через админку
2. Отслеживать кто пришёл по ссылке и сколько потратил
3. Показывать лидеру его личный кабинет прямо на my.linkeon.io — список рефералов, суммы оплат и причитающийся процент в рублях
4. Давать админу полный отчёт по всем лидерам — выплаты производятся вручную

---

## Схема комиссий

```
Лидер A (уровень 1) ──── ?ref=vasya ───► Пользователь B платит 499₽ → A начислено 49.9₽ (10%)
                                         ↓
                               Лидер B (уровень 2, назначен админом)
                               привёл Пользователя C → C платит 499₽
                               B начислено 24.95₽ (5%), A начислено 14.97₽ (3%)
```

**Комиссии только считаются и отображаются — выплата вручную через банк/карту.**

---

## 1. База данных (PostgreSQL)

3 таблицы (убраны linkeon_balances и linkeon_withdrawals):

```sql
-- Таблица лидеров
CREATE TABLE referral_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,                          -- Имя (Vasya Pupkin)
  slug VARCHAR(100) UNIQUE NOT NULL                    -- Код ссылки (?ref=vasya)
    CHECK (slug ~ '^[a-z0-9-]+$'),                     -- Только строчные буквы, цифры, дефис
  user_phone VARCHAR(20),                              -- Привязанный аккаунт в my.linkeon
  parent_leader_id UUID REFERENCES referral_leaders(id), -- NULL для уровня 1
  level SMALLINT DEFAULT 1 CHECK (level IN (1, 2)),    -- Только 1 или 2
  commission_pct DECIMAL(5,2) DEFAULT 10,              -- % комиссии (10 / 5)
  parent_commission_pct DECIMAL(5,2) DEFAULT 0,        -- % для родителя (3 если уровень 2)
                                                       -- ВАЖНО: хранится в записи дочернего лидера,
                                                       -- менять здесь, не у родителя
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Кто от кого пришёл
CREATE TABLE referral_referees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_phone VARCHAR(20) NOT NULL UNIQUE,
  leader_id UUID NOT NULL REFERENCES referral_leaders(id),
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- История оплат и начислений
CREATE TABLE referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES referral_leaders(id),
  payment_id VARCHAR(255),             -- YooKassa payment_id
  referee_phone VARCHAR(20),
  commission_level SMALLINT,           -- 1 (прямой) или 2 (upstream для родителя)
  payment_amount_rub DECIMAL(10,2),    -- Сумма платежа
  commission_pct DECIMAL(5,2),         -- Процент
  commission_rub DECIMAL(10,2),        -- Сумма комиссии в рублях
  paid_out BOOLEAN DEFAULT FALSE,      -- Выплачено ли (проставляет админ)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX ON referral_referees(referee_phone);
CREATE INDEX ON referral_commissions(payment_id);
CREATE INDEX ON referral_commissions(leader_id);
```

---

## 2. n8n Воркфлоу (бэкенд)

5 новых воркфлоу (убраны referral.linkeons и referral.withdrawal):

| Воркфлоу | Метод | Эндпоинт | Назначение |
|---|---|---|---|
| `my.linkeon.referral.admin` | POST | `/webhook/admin/referral` | CRUD лидеров для админки (action: list/create/update/toggle) |
| `my.linkeon.referral.register` | POST | `/webhook/referral/register` | Привязать пользователя к лидеру при регистрации |
| `my.linkeon.referral.commission` | POST | `/webhook/referral/commission` | Начислить комиссию после оплаты YooKassa |
| `my.linkeon.referral.stats` | GET | `/webhook/referral/stats` | Статистика лидера (его кабинет) |
| `my.linkeon.referral.admin.stats` | GET | `/webhook/admin/referral/stats` | Полный отчёт по всем лидерам (только для isAdmin) |

### Воркфлоу `referral.commission` — логика

Вызывается из `my.linkeon.YooKassa Notification Webhook` после `status = succeeded`.
**Комиссия начисляется при КАЖДОЙ оплате реферала** (первой, второй, третьей и т.д.).

```
1. Получить payment_id + user_phone + amount из платежа

2. Идемпотентность — проверить дубль:
   IF EXISTS (SELECT 1 FROM referral_commissions WHERE payment_id = $payment_id)
   → вернуть success (уже обработано, YooKassa прислала повторно)

3. Найти активного лидера реферала:
   SELECT rl.* FROM referral_referees rr
   JOIN referral_leaders rl ON rl.id = rr.leader_id
   WHERE rr.referee_phone = $user_phone
     AND rl.is_active = true          -- деактивированный лидер не получает комиссию
     AND rl.user_phone != $user_phone -- защита от самореферала

4. Если лидер найден:
   a. INSERT referral_commissions (leader_id, commission_level=1, payment_id, amount, pct=leader.commission_pct)
   b. Если leader.parent_leader_id NOT NULL:
      -- Проверить что родительский лидер тоже активен
      SELECT is_active FROM referral_leaders WHERE id = leader.parent_leader_id
      Только если parent.is_active = true:
        INSERT referral_commissions (leader_id=parent_id, commission_level=2, payment_id, amount, pct=leader.parent_commission_pct)

5. Вернуть success
```

### Идентификация лидера по JWT

Все защищённые воркфлоу (`referral.stats`, `referral.register`) извлекают телефон из JWT:
```
JWT → user_phone → SELECT * FROM referral_leaders WHERE user_phone = phone
```
Это единственный способ понять, какой лидер делает запрос. Телефон — главный идентификатор.

`/webhook/profile` (существующий воркфлоу `my.linkeon.get.user.profile`) добавляет к ответу:
```sql
SELECT slug, commission_pct FROM referral_leaders
WHERE user_phone = $phone AND is_active = true
```
Если запись найдена → возвращает `referral_slug` → фронт показывает `ReferralDashboard`.

### Воркфлоу `referral.stats` — ответ для кабинета лидера

Запрос: `GET /webhook/referral/stats` — телефон берётся из JWT.
Фильтрует `referral_commissions` по `leader_id` (все уровни: и прямые level=1, и upstream level=2).

**Маскировка телефона выполняется в n8n** (не на фронтенде) — полный номер не должен попасть в JS:
```
"79031234567" → "+7 *** ***-**-67"
```

```json
{
  "leader": { "name": "Vasya", "slug": "vasya", "level": 1, "commission_pct": 10 },
  "referral_link": "https://my.linkeon.io/?ref=vasya",
  "total_referees": 12,
  "total_paid_rub": 5988.00,
  "total_commission_rub": 598.80,
  "paid_out_rub": 300.00,
  "pending_rub": 298.80,
  "commission_breakdown": {
    "direct_pct": 10,
    "direct_commission_rub": 540.00,
    "upstream_pct": 3,
    "upstream_commission_rub": 58.80
  },
  "referees": [
    { "phone": "+7 *** ***-**-23", "registered_at": "...", "total_spent": 499, "commission": 49.9 }
  ],
  "commissions": [
    { "id": "...", "date": "...", "referee_phone": "+7 *** **-23", "payment_amount": 499, "commission_pct": 10, "commission_rub": 49.9, "level": 1, "paid_out": false }
  ]
}
```

**Для лидера уровня 2** — в `commission_breakdown` будет `direct_pct: 5`, `upstream_pct: 0` (upstream получает только уровень 1).

### Воркфлоу `referral.admin.stats` — полный отчёт для админа

Запрос: `GET /webhook/admin/referral/stats` — только для `isAdmin`.
Возвращает по всем лидерам + детализацию начислений с полными телефонами (без маскировки, т.к. только для админа):

```json
{
  "summary": {
    "total_commission_all_rub": 1200.00,
    "total_paid_out_rub": 300.00,
    "total_pending_rub": 900.00
  },
  "leaders": [
    {
      "id": "...", "name": "Vasya", "slug": "vasya", "phone": "79031234567",
      "level": 1, "commission_pct": 10, "is_active": true,
      "total_referees": 12,
      "total_paid_rub": 5988.00,
      "total_commission_rub": 598.80,
      "paid_out_rub": 300.00,
      "pending_rub": 298.80,
      "commissions": [
        { "id": "...", "date": "...", "referee_phone": "79039876543", "payment_amount": 499,
          "commission_pct": 10, "commission_rub": 49.9, "level": 1, "paid_out": false }
      ]
    }
  ]
}
```

---

## 3. Фронтенд

### 3.1 Захват реферального кода при регистрации

**`src/pages/OnboardingPage.tsx`** — добавить при монтировании:
```tsx
const [searchParams] = useSearchParams();
const refSlug = searchParams.get('ref');
if (refSlug) {
  // localStorage с TTL 7 дней — переживает закрытие вкладки, в отличие от sessionStorage
  localStorage.setItem('referral_slug', refSlug);
  localStorage.setItem('referral_slug_expires', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
}
```

**`src/services/authService.ts`** — после успешного `verifyCode()`:
```ts
const slug = localStorage.getItem('referral_slug');
const expires = Number(localStorage.getItem('referral_slug_expires') || 0);
if (slug && Date.now() < expires) {
  // Бэкенд идемпотентен: если referee_phone уже есть — вернёт success без дублирования
  // Защита от самореферала — на бэкенде
  await apiClient.post('/webhook/referral/register', { slug });
}
localStorage.removeItem('referral_slug');
localStorage.removeItem('referral_slug_expires');
```

**Воркфлоу `referral.register` — логика:**
```
1. Проверить JWT → получить referee_phone
2. Найти лидера: SELECT * FROM referral_leaders WHERE slug = $slug AND is_active = true
3. Если slug не найден → вернуть { success: true } (тихо игнорировать, не ломать онбординг)
4. Самореферал: IF leader.user_phone = referee_phone → вернуть { success: true }
5. Уже есть запись: IF EXISTS (SELECT 1 FROM referral_referees WHERE referee_phone = $referee_phone)
   → вернуть { success: true } (уже привязан ранее)
6. INSERT INTO referral_referees (referee_phone, leader_id)
```

### 3.2 TypeScript типы

**`src/types/auth.ts`** — добавить:
```typescript
export interface ReferralStats {
  leader: { name: string; slug: string; level: number; commission_pct: number };
  referral_link: string;
  total_referees: number;
  total_paid_rub: number;
  total_commission_rub: number;
  paid_out_rub: number;
  pending_rub: number;
  commission_breakdown: {
    direct_pct: number;
    direct_commission_rub: number;
    upstream_pct: number;
    upstream_commission_rub: number;
  };
  referees: Array<{ phone: string; registered_at: string; total_spent: number; commission: number }>;
  commissions: Array<{
    id: string; date: string; referee_phone: string;
    payment_amount: number; commission_pct: number; commission_rub: number;
    level: number; paid_out: boolean;
  }>;
}
```

### 3.3 Расширить User тип

**`src/contexts/AuthContext.tsx`**:
```typescript
interface User {
  // existing...
  referralSlug?: string;   // если задан — показываем ReferralDashboard
}
```

`/webhook/profile` должен возвращать `referral_slug` если пользователь является лидером.

### 3.4 Вкладка "Рефералы" в AdminPage

**`src/pages/AdminPage.tsx`** — добавить вкладку.

**`src/components/admin/AdminReferralsView.tsx`** — новый компонент:
- Таблица лидеров: имя | slug | ссылка (копировать) | телефон | уровень | родитель | % | рефералов | начислено | выплачено | статус
- Кнопка "Добавить лидера": форма с полями **имя, slug** (только a-z, 0-9, дефис — валидация на фронте + CHECK constraint в БД), **телефон лидера** (ключевое поле), уровень, родитель (dropdown), %
- Кнопка "Деактивировать" (при деактивации новые комиссии не начисляются)
- Кнопка "Отметить выплачено" по конкретному начислению
- Кнопка **"Выплатить всё"** — помечает все `paid_out = false` записи лидера как выплаченные одним кликом
- Сводный отчёт: итого начислено всем лидерам / итого выплачено / общий долг

### 3.5 Кабинет лидера в профиле

**`src/components/profile/ReferralDashboard.tsx`** — новый компонент, встраивается в `ProfileView.tsx` если `user.referralSlug` задан:

```
┌─────────────────────────────────────────────────┐
│ Моя реферальная программа                        │
├─────────────────────────────────────────────────┤
│ Ссылка: my.linkeon.io/?ref=vasya  [Скопировать] │
│                                                  │
│ Приведено людей: 12                              │
│ Общие расходы рефералов: 5 988 ₽                │
│ Ваша комиссия (10%): 598.80 ₽                   │
│   — Выплачено: 300 ₽                            │
│   — К выплате: 298.80 ₽                         │
├─────────────────────────────────────────────────┤
│ История                                          │
│ Дата       | Телефон        | Оплата | Комиссия │
│ 05.03.2026 | +7 *** **-23   | 499 ₽  | 49.9 ₽  │
│ ...                                              │
└─────────────────────────────────────────────────┘
```

При ошибке загрузки `/webhook/referral/stats` — показывать inline сообщение об ошибке, не крашить ProfileView.

---

## 4. Порядок реализации

### Этап 1 — БД + n8n
1. Создать 3 таблицы + индексы в PostgreSQL
2. `my.linkeon.referral.admin` — CRUD лидеров
3. `my.linkeon.referral.register` — привязка реферала
4. `my.linkeon.referral.commission` — начисление (+ подключить в YooKassa webhook)
5. `my.linkeon.referral.stats` — статистика лидера (маскировка телефона здесь, в n8n)
6. `my.linkeon.referral.admin.stats` — полный отчёт
7. Обновить `my.linkeon.get.user.profile` — добавить `referral_slug` в ответ

### Этап 2 — Admin UI
8. `AdminReferralsView.tsx` — управление лидерами + отчёт
9. Добавить вкладку в `AdminPage.tsx`

### Этап 3 — Захват реферала
10. `OnboardingPage.tsx` — localStorage с TTL при `?ref=`
11. `authService.ts` — POST register после OTP

### Этап 4 — Кабинет лидера
12. Расширить `AuthContext` полем `referralSlug` (зависит от шага 7 — сначала бэкенд!)
13. `ReferralDashboard.tsx` — виджет статистики (типы из `ReferralStats`)
14. Добавить в `ProfileView.tsx` (условно, если `user.referralSlug`)

---

## 5. Критические файлы

| Файл | Изменение |
|---|---|
| `src/pages/OnboardingPage.tsx` | Захват `?ref=` в localStorage с TTL |
| `src/services/authService.ts` | POST register после верификации |
| `src/contexts/AuthContext.tsx` | Добавить `referralSlug` в User |
| `src/types/auth.ts` | Добавить тип `ReferralStats` |
| `src/pages/AdminPage.tsx` | Новая вкладка "Рефералы" |
| `src/components/admin/AdminReferralsView.tsx` | Новый компонент (создать) |
| `src/components/profile/ReferralDashboard.tsx` | Новый компонент (создать) |
| `src/components/profile/ProfileView.tsx` | Подключить ReferralDashboard |
| n8n: `my.linkeon.YooKassa Notification Webhook` | Вызов commission workflow |
| n8n: `my.linkeon.get.user.profile` | Добавить referral_slug в ответ |

---

## 6. Проверка

1. Создать лидера в админке → ссылка `?ref=test` появляется
2. Зарегистрироваться через эту ссылку → `referral_referees` содержит запись
3. Закрыть вкладку и вернуться позже (< 7 дней) → slug сохранился в localStorage
4. Оплатить токены → `referral_commissions` содержит начисление
5. Деактивировать лидера → новые начисления не создаются (ни прямые, ни upstream)
6. Войти под аккаунтом лидера → в профиле виден `ReferralDashboard` с замаскированными телефонами
7. В админке → вкладка Рефералы → полные телефоны, статистика по всем лидерам корректна
8. Отметить "выплачено" → `paid_out = true`, суммы пересчитались
9. Самореферал → запись в `referral_referees` не создаётся
