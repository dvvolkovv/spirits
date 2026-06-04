# Гайд-онбординг (match-экран) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При первом входе показать новичку один match-экран (6 тем → профильный ассистент) вместо сетки из 16 карточек; показ один раз (флаг `onboarded`), повторно — кнопкой «Подобрать специалиста».

**Architecture:** Бэкенд — boolean-флаг `onboarded` в `ai_profiles_consolidated` (зеркалит `isadmin`), отдаётся в `GET /webhook/profile`, ставится идемпотентным `POST /webhook/onboarding/complete`. Фронт — компонент `OnboardingMatch`, логика показа в `ChatPage` поверх `ChatInterface`, флаг в `AuthContext`.

**Tech Stack:** NestJS 10 + PostgreSQL (pg), миграции через `scripts/migrate.ts`; React 18 + TS + Vite + Tailwind + i18next.

**Спека:** `spirits_front/docs/superpowers/specs/2026-06-04-onboarding-guided-match-design.md`

**Деплой:** только `bash ~/Downloads/spirits_back/scripts/deploy.sh` (двухфазный). НЕ деплоить руками.

---

## Task 1: Бэкенд — миграция `onboarded` + бэкфилл

**Files:**
- Create: `spirits_back/src/profile/migrations/001_onboarded_flag.sql`

- [ ] **Step 1: Создать миграцию**

`spirits_back/src/profile/migrations/001_onboarded_flag.sql`:
```sql
-- 001_onboarded_flag.sql
-- Флаг прохождения гайд-онбординга (match-экран). Зеркалит isadmin.
-- Бэкфилл: все, у кого уже есть история чата, считаются прошедшими онбординг,
-- чтобы существующие пользователи не увидели экран. session_id в
-- custom_chat_history — это телефон (= user_id), опц. с суффиксом _<agentId>.

ALTER TABLE ai_profiles_consolidated
  ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;

UPDATE ai_profiles_consolidated p
SET onboarded = true
WHERE p.onboarded = false
  AND EXISTS (
    SELECT 1 FROM custom_chat_history c
    WHERE c.session_id = p.user_id
       OR c.session_id LIKE p.user_id || '\_%'
  );
```

- [ ] **Step 2: Сухой прогон на test-сервере (проверить формат session_id перед бэкфиллом)**

Перед применением сверить, что `session_id` действительно начинается с телефона:
```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null dv@85.192.61.231 \
 'set -a; . ~/spirits_back/.env; set +a; PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -U linkeon -d linkeon -c "SELECT session_id FROM custom_chat_history LIMIT 5"'
```
Expected: значения вида `79656445804` или `79656445804_4`. Если формат иной — скорректировать предикат `LIKE` в миграции.

- [ ] **Step 3: Применить миграции (test)**

Run:
```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null dv@85.192.61.231 \
 'export PATH=$HOME/.nvm/versions/node/v22.22.3/bin:$PATH; cd ~/spirits_back && set -a && . .env && set +a && npm run migrate 2>&1'
```
Expected: `001_onboarded_flag.sql` в применённых, без ошибок.

> Прод-миграция применится в рамках `deploy.sh` (Task 7). Если deploy.sh не гоняет migrate — применить тем же `npm run migrate` на проде после деплоя кода.

---

## Task 2: Бэкенд — отдать `onboarded` + эндпоинт complete

**Files:**
- Modify: `spirits_back/src/profile/profile.service.ts` (getProfile ~стр. 53; новый метод)
- Modify: `spirits_back/src/profile/profile.controller.ts` (новый POST-роут)
- Test: `spirits_back/tests/smoke/smoke.js` (новая проверка)

- [ ] **Step 1: Добавить `onboarded` в ответ getProfile**

В `profile.service.ts`, в объект `profileJson` рядом со строкой `isadmin: ...` (стр. 53) добавить:
```ts
        onboarded: row.onboarded === true,
```

- [ ] **Step 2: Добавить метод сервиса**

В `profile.service.ts`, после `updateProfile(...)`:
```ts
  async completeOnboarding(userId: string) {
    await this.pg.query(
      `UPDATE ai_profiles_consolidated SET onboarded = true, updated_at = now() WHERE user_id = $1`,
      [userId],
    );
    return { onboarded: true };
  }
```

- [ ] **Step 3: Добавить роут в контроллер**

В `profile.controller.ts`, после `setEmail(...)`:
```ts
  @Post('onboarding/complete')
  @UseGuards(JwtGuard)
  async completeOnboarding(@CurrentUser() user: any, @Res() res: Response) {
    const result = await this.profileService.completeOnboarding(user.userId);
    return res.status(200).json(result);
  }
```

- [ ] **Step 4: Smoke-проверка (написать, потом запустить — должна сначала падать без кода)**

В `tests/smoke/smoke.js`, в блок с авторизованными проверками профиля (там, где уже есть JWT для тест-номера), добавить:
```js
  // onboarding: profile exposes the flag, complete() sets it idempotently
  const profBefore = await getJson(`${BASE}/webhook/profile`, { headers: authHeaders });
  const pj = Array.isArray(profBefore) ? profBefore[0]?.profileJson : profBefore?.profileJson;
  assert(pj && typeof pj.onboarded === 'boolean', 'profile.onboarded is boolean');
  const comp = await postJson(`${BASE}/webhook/onboarding/complete`, {}, { headers: authHeaders });
  assert(comp.onboarded === true, 'onboarding/complete returns onboarded:true');
```
(Использовать существующие в smoke.js хелперы `getJson/postJson/assert` и переменную `authHeaders`/`BASE` — сверить точные имена в файле и подставить.)

- [ ] **Step 5: Typecheck**

Run: `cd spirits_back && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -c "^src/"`
Expected: `0`

- [ ] **Step 6: Commit**

```bash
cd spirits_back && git add src/profile/ tests/smoke/smoke.js
git commit -m "feat(onboarding): onboarded-флаг в профиле + POST /onboarding/complete (9d543af5)"
```

---

## Task 3: Фронт — `onboarded` в AuthContext + `completeOnboarding`

**Files:**
- Modify: `spirits_front/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Поле в интерфейсе User**

В `interface User` (после `preferredAgent?`):
```ts
  onboarded?: boolean;
```

- [ ] **Step 2: Мёржить onboarded из профиля**

В `checkAdminStatus`, в объект `updatedUser` (рядом с `isAdmin: ...`):
```ts
              onboarded: profileJson.onboarded === true,
```

- [ ] **Step 3: Метод completeOnboarding**

Добавить в `AuthContextType` сигнатуру `completeOnboarding: () => Promise<void>;`, реализовать в провайдере:
```ts
  const completeOnboarding = useCallback(async () => {
    // optimistic — не блокируем UX, даже если запрос упадёт (флаг до-проставится позже)
    setUser((u) => { if (!u) return u; const nu = { ...u, onboarded: true }; persistUser(nu); return nu; });
    try { await apiClient.post('/webhook/onboarding/complete', {}); } catch (e) { console.warn('[onboarding] complete failed', e); }
  }, []);
```
И добавить `completeOnboarding` в объект `value={{ ... }}` провайдера.

- [ ] **Step 4: Typecheck**

Run: `cd spirits_front && node_modules/.bin/tsc --noEmit`
Expected: только предсуществующие ошибки (vite-env.d.ts), новых нет.

- [ ] **Step 5: Commit**

```bash
cd spirits_front && git add src/contexts/AuthContext.tsx
git commit -m "feat(onboarding): onboarded + completeOnboarding в AuthContext (9d543af5)"
```

---

## Task 4: Фронт — компонент OnboardingMatch + темы + i18n

**Files:**
- Create: `spirits_front/src/components/onboarding/OnboardingMatch.tsx`
- Modify: `spirits_front/src/i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: i18n ключи**

В `ru.json` (раздел рядом с `chat`) добавить:
```json
"onboarding": {
  "title": "С чего начнём?",
  "subtitle": "Выберите, что ближе сейчас — подберём специалиста и сразу начнём разговор",
  "show_all": "Показать всех специалистов →",
  "greeting": "Здравствуйте! Я {{name}} — {{role}}. С чего начнём?",
  "reopen": "Подобрать специалиста",
  "theme_self": "Разобраться в себе, эмоции",
  "theme_growth": "Цели и личный рост",
  "theme_career": "Карьера и работа",
  "theme_biz": "Бизнес и деньги",
  "theme_practices": "Практики самопознания",
  "theme_unsure": "Пока не знаю / просто смотрю"
}
```
В `en.json` — те же ключи с английскими значениями (title «Where shall we start?», и т.д.).

- [ ] **Step 2: Компонент**

`spirits_front/src/components/onboarding/OnboardingMatch.tsx`:
```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

interface Assistant { id: number; name: string; displayName?: string; description?: string; category?: string; }

// Тема → ассистент по СТАБИЛЬНОМУ name (per spirits_back/CLAUDE.md name не меняется).
// Фолбэк — Роман (координатор), если профильный ассистент отсутствует в ростере.
export const ONBOARDING_THEMES: { key: string; emoji: string; assistantName: string }[] = [
  { key: 'theme_self',      emoji: '🧭', assistantName: 'Оля' },
  { key: 'theme_growth',    emoji: '📈', assistantName: 'Миша' },
  { key: 'theme_career',    emoji: '💼', assistantName: 'Ирина' },
  { key: 'theme_biz',       emoji: '💰', assistantName: 'Андрей' },
  { key: 'theme_practices', emoji: '🔮', assistantName: 'Райя' },
  { key: 'theme_unsure',    emoji: '🤔', assistantName: 'Роман' },
];
const FALLBACK_ASSISTANT_NAME = 'Роман';

interface Props {
  assistants: Assistant[];
  onPickTheme: (assistant: Assistant) => void;
  onShowAll: () => void;
}

const OnboardingMatch: React.FC<Props> = ({ assistants, onPickTheme, onShowAll }) => {
  const { t } = useTranslation();
  const resolve = (name: string): Assistant | undefined =>
    assistants.find((a) => a.name === name) || assistants.find((a) => a.name === FALLBACK_ASSISTANT_NAME);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">{t('onboarding.title')}</h1>
      <p className="text-sm text-gray-500 mb-6 text-center max-w-md">{t('onboarding.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {ONBOARDING_THEMES.map((th) => {
          const a = resolve(th.assistantName);
          if (!a) return null;
          return (
            <button
              key={th.key}
              data-testid="onboarding-theme"
              data-assistant={a.name}
              onClick={() => onPickTheme(a)}
              className="flex items-center gap-3 text-left bg-white border-2 border-transparent hover:border-blue-500 shadow-md hover:shadow-xl rounded-2xl p-4 transition-all active:scale-95"
            >
              <span className="text-2xl flex-shrink-0">{th.emoji}</span>
              <span className="font-semibold text-gray-900">{t(`onboarding.${th.key}`)}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onShowAll}
        data-testid="onboarding-show-all"
        className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline"
      >
        {t('onboarding.show_all')}
      </button>
    </div>
  );
};

export default OnboardingMatch;
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd spirits_front && node_modules/.bin/tsc --noEmit` (новых ошибок нет)
```bash
git add src/components/onboarding/OnboardingMatch.tsx src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "feat(onboarding): компонент OnboardingMatch + темы + i18n (9d543af5)"
```

---

## Task 5: Фронт — встроить экран в ChatPage + кнопка reopen + generic-приветствие

**Files:**
- Modify: `spirits_front/src/pages/ChatPage.tsx`
- Modify: `spirits_front/src/components/chat/ChatInterface.tsx` (кнопка в шапке + проп onOpenMatch)

- [ ] **Step 1: Логика показа в ChatPage**

Переписать `ChatPage.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import ChatInterface from '../components/chat/ChatInterface';
import ChatLayout from '../components/chat/ChatLayout';
import OnboardingMatch from '../components/onboarding/OnboardingMatch';
import { useAuth } from '../contexts/AuthContext';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, completeOnboarding } = useAuth();
  const [openTokens, setOpenTokens] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);   // принудительное открытие по кнопке
  const [dismissed, setDismissed] = useState(false);    // пользователь только что прошёл match в этой сессии
  const [greeting, setGreeting] = useState<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'tokens') setOpenTokens(true);
  }, [location.search]);

  // Показ ТОЛЬКО при onboarded === false (явно). undefined/неизвестно → fail-open в чат.
  const showMatch = matchOpen || (user?.onboarded === false && !dismissed);

  return (
    <ChatLayout>
      {({ selectedAssistant, onSelectAssistant, assistants }) =>
        showMatch ? (
          <OnboardingMatch
            assistants={assistants}
            onPickTheme={(a) => {
              setGreeting(t('onboarding.greeting', { name: a.displayName || a.name, role: a.description || '' }));
              onSelectAssistant(a);
              setDismissed(true);
              setMatchOpen(false);
              if (user?.onboarded === false) completeOnboarding();
            }}
            onShowAll={() => {
              setDismissed(true);
              setMatchOpen(false);
              if (user?.onboarded === false) completeOnboarding();
            }}
          />
        ) : (
          <ChatInterface
            title={t('chat.title')}
            welcomeMessage={greeting ?? t('chat.welcome_message')}
            initialShowTokens={openTokens}
            preSelectedAssistant={selectedAssistant}
            onAssistantSelected={onSelectAssistant}
            allAssistants={assistants}
            onOpenMatch={() => setMatchOpen(true)}
          />
        )
      }
    </ChatLayout>
  );
};

export default ChatPage;
```

- [ ] **Step 2: Принять и отрисовать кнопку в ChatInterface**

В props-типе `ChatInterface` добавить `onOpenMatch?: () => void;` и в деструктуризацию пропсов. В шапке чата (рядом с заголовком/иконками, найти контейнер заголовка) добавить кнопку, видимую когда выбран ассистент:
```tsx
{onOpenMatch && (
  <button
    onClick={onOpenMatch}
    data-testid="reopen-match"
    className="text-xs text-gray-500 hover:text-blue-600 underline whitespace-nowrap"
  >
    {t('onboarding.reopen')}
  </button>
)}
```
(Разместить в существующем header-flex; точное место — рядом с переключателем ассистента.)

- [ ] **Step 3: Typecheck**

Run: `cd spirits_front && node_modules/.bin/tsc --noEmit`
Expected: новых ошибок нет.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChatPage.tsx src/components/chat/ChatInterface.tsx
git commit -m "feat(onboarding): match-экран в ChatPage + кнопка «Подобрать специалиста» + приветствие (9d543af5)"
```

---

## Task 6: Тест Playwright (happy path)

**Files:**
- Modify: `spirits_back/tests/playwright/smoke.spec.js` (или добавить spec)

- [ ] **Step 1: Сценарий**

Добавить тест: залогиниться debug-OTP тест-номером, через API выставить `onboarded=false` (нужен хелпер; если нет — сбросить через прямой psql в setup или пропустить reset и проверять идемпотентно). Минимальный устойчивый вариант без reset:
```js
test('onboarding match: theme pick lands in chat', async ({ page }) => {
  // login via debug OTP (reuse existing login helper in this spec file)
  await loginViaDebugOtp(page, '79656445804');
  // match screen visible only if onboarded=false; tolerate already-onboarded by reopening
  const reopen = page.getByTestId('reopen-match');
  if (await reopen.isVisible().catch(() => false)) await reopen.click();
  const theme = page.getByTestId('onboarding-theme').filter({ hasText: 'Разобраться в себе' });
  await theme.click();
  // landed in chat: input present, header shows an assistant
  await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible();
});
```
(Сверить имя/наличие `loginViaDebugOtp` в файле; если другой — использовать существующий логин-хелпер этого spec.)

- [ ] **Step 2: Прогон локально не делаем (Playwright гоняется в smoke на деплое). Commit**

```bash
cd spirits_back && git add tests/playwright/smoke.spec.js
git commit -m "test(onboarding): playwright happy-path match→chat (9d543af5)"
```

---

## Task 7: Деплой + верификация + закрытие задачи

- [ ] **Step 1: Двухфазный деплой**

Run (фон): `bash ~/Downloads/spirits_back/scripts/deploy.sh` → дождаться `ALL PHASES GREEN`.
Если deploy.sh не применяет миграции — после зелёного деплоя выполнить `npm run migrate` на проде.

- [ ] **Step 2: Прод-верификация флага**

```bash
# профиль отдаёт onboarded; complete ставит true (через тест-номер JWT)
curl -s https://my.linkeon.io/webhook/profile -H "Authorization: Bearer $TOK" | python3 -c "import sys,json;d=json.load(sys.stdin);print('onboarded=',(d[0] if isinstance(d,list) else d)['profileJson']['onboarded'])"
```
Expected: поле присутствует (boolean).

- [ ] **Step 3: Бэклог — комментарий с итогом реализации + перевод в done**

Комментарий: какие файлы, миграция+бэкфилл, поведение, что проверено на проде, что осталось вне scope (контент под темы, аналитика воронки). Затем `action:update status:done`.

---

## Заметки по реализации (для комментариев к задаче)

- Бэкфилл `onboarded=true` по наличию истории — единственное допущение в формате `session_id`; сверить SELECT'ом до прода (Task 1 Step 2).
- Generic-приветствие реализовано через существующий проп `welcomeMessage` (override из ChatPage) — изолировано, не меняет глобальное поведение чата.
- Показ строго при `onboarded === false`; `undefined` (профиль не догрузился) → fail-open в чат, возвращающихся не блокируем.
- Кнопка «Подобрать специалиста» работает всегда (через `matchOpen`), независимо от флага.
