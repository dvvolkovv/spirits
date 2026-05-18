# SMM Producer Plan 4d — Social Accounts UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый авторизованный клиент my.linkeon.io может подключать свои соцсети (Telegram, VK, YouTube Shorts, TikTok, Instagram) через inline-блоки в чате с AI-продюсером + через отдельную страницу `/settings/social`. Закрывает фронт-сторону Plan 4 (бэкенд уже задеплоен).

**Architecture:** Две поверхности UI переиспользуют 2 React-компонента (`SocialConnectButton`, `TelegramConnectForm`). Бэкенд снимает `AdminGuard` с `/oauth/*` и `/social-accounts/*` (любой авторизованный юзер), добавляет per-user rate-limit, и меняет OAuth-redirect destination на `/chat?smm_oauth_success=<platform>` (или на `redirect` из state). Фронт обрабатывает query-параметры через `useEffect`+toast, авто-резюмирует диалог в чате.

**Tech Stack:** Backend — NestJS 10 (`IpRateLimiter` уже есть в `src/common/guards/`). Frontend — React 18 + Vite + Tailwind, `react-router-dom v6`, новая зависимость `react-hot-toast` (~5KB gzipped). `lucide-react` для иконок.

**End-state demo:**
- Клиент пишет в чат "хочу постить в Telegram про долги" → AI зовёт `connect_social(telegram)` (т.к. аккаунта нет) → в чате появляется inline-форма с полями `botToken`/`chatId` → клиент вводит → форма валидирует → AI продолжает с публикацией
- Клиент пишет "опубликуй в VK" → AI зовёт `connect_social(vk)` → кнопка "Подключить VK" в чате → клик → vk.com consent → редирект на `/chat?smm_oauth_success=vk` → toast "VK подключён", query чистится, AI продолжает
- Клиент идёт в `/settings/social` → видит список аккаунтов → кликает "Подключить YouTube" → проходит OAuth → возвращается в settings со списком обновлённым

---

## File Structure

**Backend (создаётся/модифицируется):**
```
spirits_back/
└── src/smm/
    ├── oauth/oauth.controller.ts                          # MODIFY: drop AdminGuard, add rate-limit, change redirect
    └── social-accounts/social-account.controller.ts       # MODIFY: drop AdminGuard, add rate-limit on POST
```

**Frontend (создаётся):**
```
spirits_front/
├── src/
│   ├── types/smm.ts                                       # NEW: SmmPlatform, SocialAccount
│   ├── services/socialAccountApi.ts                       # NEW: API wrappers
│   ├── components/
│   │   ├── chat/
│   │   │   ├── SocialConnectButton.tsx                    # NEW
│   │   │   └── TelegramConnectForm.tsx                    # NEW
│   │   ├── settings/
│   │   │   └── SettingsSocialView.tsx                     # NEW
│   │   └── layout/Navigation.tsx                          # MODIFY: add Соцсети link
│   ├── pages/
│   │   └── SettingsSocialPage.tsx                         # NEW
│   ├── utils/customMarkdown.tsx                           # MODIFY: 2 new block parsers
│   ├── components/chat/ChatInterface.tsx                  # MODIFY: tool_result connect_social → inject markdown + OAuth callback handler
│   ├── i18n/locales/ru.json                               # MODIFY: add settings.social.* keys
│   ├── i18n/locales/en.json                               # MODIFY: same
│   └── App.tsx                                            # MODIFY: register /settings/social route + <Toaster />
└── package.json                                           # MODIFY: add react-hot-toast
```

---

## Task 1: Backend — снять AdminGuard, добавить rate-limit, обновить redirect

**Files:**
- Modify: `src/smm/oauth/oauth.controller.ts`
- Modify: `src/smm/social-accounts/social-account.controller.ts`

Целая работа на бэке для Plan 4d — это снятие admin-only ограничения. Per-user rate-limit чтобы не было абьюза. `OAuthController.callback` — единственное место где меняется логика редиректа.

- [ ] **Step 1.1: Inspect existing rate-limit pattern**

```bash
cd /Users/dmitry/Downloads/spirits_back
cat src/common/guards/ip-rate-limit.ts
grep -A5 "IpRateLimiter" src/video/video.controller.ts | head -20
```

Expected: `IpRateLimiter.check(key, bucket, limit, windowSeconds)` — throws 429 HttpException. Injectable, ключ передаётся как первый аргумент (IP или userId).

- [ ] **Step 1.2: Modify OAuthController**

Open `src/smm/oauth/oauth.controller.ts`. Сделать 3 правки:

**a) Снять AdminGuard со `start`:**
```typescript
// БЫЛО:
@Get(':platform/start')
@UseGuards(JwtGuard, AdminGuard)
async start(...)

// СТАЛО:
@Get(':platform/start')
@UseGuards(JwtGuard)
async start(...)
```

Удалить импорт `AdminGuard`, если он больше нигде в файле не используется.

**b) Добавить rate-limit в `start`:**

Добавить `IpRateLimiter` в конструктор:
```typescript
import { IpRateLimiter } from '../../common/guards/ip-rate-limit';

constructor(
  private readonly state: OAuthStateService,
  private readonly vk: VkOAuthService,
  private readonly yt: YouTubeOAuthService,
  private readonly tt: TikTokOAuthService,
  private readonly meta: MetaOAuthService,
  private readonly accounts: SocialAccountService,
  private readonly limiter: IpRateLimiter,
) {}
```

В начале `start()` после валидации platform добавить:
```typescript
await this.limiter.check(req.user.phone, 'smm_oauth_start', 5, 3600);
```

**c) Обновить `callback()` redirect destination:**

Заменить эти 2 строки в `callback()`:
```typescript
// БЫЛО:
const dest = userRedirect ?? `/?smm_oauth_success=${platform}`;

// СТАЛО:
const successBase = userRedirect ?? '/chat';
const sep = successBase.includes('?') ? '&' : '?';
const dest = `${successBase}${sep}smm_oauth_success=${platform}`;
```

Аналогично для error-веток заменить `/?smm_oauth_error=...` на `/chat?smm_oauth_error=...` во всех 4 местах (платформа неподдерживаемая, missing params, invalid state, exchange failure).

- [ ] **Step 1.3: Modify SocialAccountController**

Open `src/smm/social-accounts/social-account.controller.ts`.

**a) Снять AdminGuard:**
```typescript
// БЫЛО:
@Controller('smm/social-accounts')
@UseGuards(JwtGuard, AdminGuard)

// СТАЛО:
@Controller('smm/social-accounts')
@UseGuards(JwtGuard)
```

Удалить импорт `AdminGuard`.

**b) Добавить rate-limit на POST /telegram:**

Добавить `IpRateLimiter` в конструктор:
```typescript
import { IpRateLimiter } from '../../common/guards/ip-rate-limit';

constructor(
  private readonly accounts: SocialAccountService,
  private readonly limiter: IpRateLimiter,
) {}
```

В начале `createTelegram()` (первая строка после `async createTelegram(...)`):
```typescript
await this.limiter.check(req.user.phone, 'smm_social_create', 10, 3600);
```

- [ ] **Step 1.4: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back
rm -rf dist && npm run build 2>&1 | tail -5
```

Expected: clean build (нет TS-ошибок).

- [ ] **Step 1.5: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/oauth/oauth.controller.ts src/smm/social-accounts/social-account.controller.ts
git -c commit.gpgsign=false commit -m "feat(smm): открыть OAuth/social-accounts для всех авторизованных юзеров

- OAuthController.start + SocialAccountController перестают требовать
  AdminGuard. Теперь любой авторизованный юзер my.linkeon.io может
  подключать свои соцсети.
- IpRateLimiter (per-user): 5 OAuth-стартов/час + 10 manual-Telegram
  созданий/час.
- OAuth callback редирект изменён с /?smm_oauth_success=<p> на
  /chat?smm_oauth_success=<p> (или на userRedirect из state, если был).
  Это позволяет фронт-чату ловить query и резюмировать диалог.

Безопасность не падает: credentials шифруются как раньше, userId
берётся из state-токена, ownership-checks на DELETE остаются.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 1.6: Deploy backend**

```bash
rsync -az --timeout=30 \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='.worktrees/' --exclude='.env' \
  --exclude='tests/node_modules/' --exclude='public/generated/' \
  ~/Downloads/spirits_back/ dvolkov@212.113.106.202:/home/dvolkov/spirits_back/

ssh dvolkov@212.113.106.202 'cd ~/spirits_back && npm run build 2>&1 | tail -3 && pm2 restart linkeon-api && sleep 4 && pm2 list | head -7'
```

Expected: оба процесса online, никаких errors в логах. Worker не трогаем — Plan 4d его не меняет.

Verify:
```bash
# Test that JwtGuard still works (no auth → 401)
curl -s -o /dev/null -w "no auth: %{http_code}\n" https://my.linkeon.io/webhook/smm/oauth/vk/start
# Expected: 401
```

---

## Task 2: Frontend types + API client + react-hot-toast

**Files:**
- Create: `src/types/smm.ts`
- Create: `src/services/socialAccountApi.ts`
- Modify: `package.json` (add `react-hot-toast`)
- Modify: `src/App.tsx` (add `<Toaster />`)

- [ ] **Step 2.1: Install react-hot-toast**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm add react-hot-toast 2>&1 | tail -3
```

Expected: добавилось в `dependencies` (~5KB gzipped).

- [ ] **Step 2.2: Create `src/types/smm.ts`**

```typescript
// src/types/smm.ts
export type SmmPlatform = 'telegram' | 'vk' | 'youtube' | 'tiktok' | 'instagram';

export interface SocialAccount {
  id: string;
  platform: SmmPlatform;
  displayName: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
}

export interface SocialConnectResult {
  platform: SmmPlatform;
  method: 'oauth' | 'manual';
  authorizeUrl?: string;       // when method=oauth
  instructions?: string;       // when method=manual (Telegram)
}

export const PLATFORM_LABELS: Record<SmmPlatform, string> = {
  telegram: 'Telegram',
  vk: 'VK',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};
```

- [ ] **Step 2.3: Create `src/services/socialAccountApi.ts`**

```typescript
// src/services/socialAccountApi.ts
import { apiClient } from './apiClient';
import { SmmPlatform, SocialAccount } from '../types/smm';

export const socialAccountApi = {
  async list(): Promise<SocialAccount[]> {
    const r = await apiClient.get('/webhook/smm/social-accounts');
    return r.data ?? [];
  },

  async createTelegram(body: {
    botToken: string;
    chatId: string;
    displayName?: string;
  }): Promise<{ id: string; displayName: string; platform: 'telegram' }> {
    const r = await apiClient.post('/webhook/smm/social-accounts/telegram', body);
    return r.data;
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    const r = await apiClient.delete(`/webhook/smm/social-accounts/${id}`);
    return r.data;
  },

  async getOAuthStartUrl(
    platform: Exclude<SmmPlatform, 'telegram'>,
    redirect?: string,
  ): Promise<{ authorizeUrl: string }> {
    const qs = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
    const r = await apiClient.get(`/webhook/smm/oauth/${platform}/start${qs}`);
    return r.data;
  },
};
```

Examine your `src/services/apiClient.ts` to confirm the exact `.get/.post/.delete` signature (may be `.fetch`, `.request`, etc). Match style. If apiClient throws on non-2xx, no try/catch needed; if it returns raw, add status check.

- [ ] **Step 2.4: Mount `<Toaster />` in App.tsx**

Open `src/App.tsx`. Импорт:
```typescript
import { Toaster } from 'react-hot-toast';
```

В `AppContent` рядом с `<Router>` (или внутри, перед `<Routes>`):
```typescript
return (
  <>
    <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    {/* existing JSX */}
  </>
);
```

Если возвращаемое JSX уже обёрнуто в один корневой элемент (`<div>` или `<Router>`), вставить `<Toaster />` первым ребёнком.

- [ ] **Step 2.5: Verify build**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm build 2>&1 | tail -3
```

Expected: clean build (TS-ошибок нет; bundle size +~5KB).

- [ ] **Step 2.6: Commit**

```bash
git add package.json pnpm-lock.yaml src/types/smm.ts src/services/socialAccountApi.ts src/App.tsx
git -c commit.gpgsign=false commit -m "feat(smm): типы + API-клиент для social accounts + react-hot-toast

- types/smm.ts: SmmPlatform union + SocialAccount entity +
  PLATFORM_LABELS константа для UI.
- services/socialAccountApi.ts: тонкие обёртки над apiClient для
  list/createTelegram/remove/getOAuthStartUrl.
- react-hot-toast добавлен (для OAuth callback toast'ов в Task 4).
  <Toaster /> смонтирован в App.tsx с position=top-right.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: CustomMarkdown blocks + React-компоненты `SocialConnectButton`/`TelegramConnectForm`

**Files:**
- Modify: `src/utils/customMarkdown.tsx`
- Create: `src/components/chat/SocialConnectButton.tsx`
- Create: `src/components/chat/TelegramConnectForm.tsx`

CustomMarkdown расширяется двумя блоками, которые AI-продюсер сможет инъектировать в свои ответы (через перехват `tool_result` в Task 4).

- [ ] **Step 3.1: Extend customMarkdown.tsx**

Open `src/utils/customMarkdown.tsx`. Найти блок где определены SMM_SCENARIO_REGEX и SMM_VIDEO_REGEX (примерно строка 22). Под ними добавить:

```typescript
// SMM Producer Plan 4d — social connect blocks
const SMM_SOCIAL_BUTTON_REGEX =
  /\{\{smm_social_connect_button:platform=([a-z]+),authorize_url=([^}]+)\}\}/g;
const SMM_SOCIAL_TELEGRAM_REGEX = /\{\{smm_social_connect_telegram\}\}/g;
```

В типе возвращаемого значения `parseCustomMarkdown` добавить:
```typescript
  socialButtons: Map<string, { platform: string; authorizeUrl: string }>;
  socialTelegram: Set<string>;  // just IDs to render placeholder for
```

В функции тела парсера добавить:
```typescript
const socialButtons = new Map<string, { platform: string; authorizeUrl: string }>();
const socialTelegram = new Set<string>();

parsedContent = parsedContent.replace(SMM_SOCIAL_BUTTON_REGEX, (match, platform, authorizeUrl) => {
  const id = `socbtn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  socialButtons.set(id, { platform: platform.trim(), authorizeUrl: authorizeUrl.trim() });
  return `__SOCIAL_BUTTON_${id}__`;
});

parsedContent = parsedContent.replace(SMM_SOCIAL_TELEGRAM_REGEX, () => {
  const id = `soctg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  socialTelegram.add(id);
  return `__SOCIAL_TELEGRAM_${id}__`;
});
```

Не забудь вернуть их в финальном `return { content, buttons, links, videos, smmScenarios, smmVideos, socialButtons, socialTelegram }`.

- [ ] **Step 3.2: Update consumer in ChatInterface.tsx**

Open `src/components/chat/ChatInterface.tsx`. Найти место где результат `parseCustomMarkdown` используется (там должен быть render-loop, который вставляет `<ScenarioCard>` / `<SmmVideoPlayer>` на места плейсхолдеров `__SMM_SCENARIO_...`). По тому же паттерну добавить рендер для `__SOCIAL_BUTTON_...` и `__SOCIAL_TELEGRAM_...`:

```typescript
// при сплите по плейсхолдерам — добавить обработку:
if (token.startsWith('__SOCIAL_BUTTON_')) {
  const id = token.replace('__SOCIAL_BUTTON_', '').replace(/__$/, '');
  const config = socialButtons.get(id);
  if (config) {
    return <SocialConnectButton
      key={id}
      platform={config.platform as SmmPlatform}
      authorizeUrl={config.authorizeUrl}
    />;
  }
}
if (token.startsWith('__SOCIAL_TELEGRAM_')) {
  const id = token.replace('__SOCIAL_TELEGRAM_', '').replace(/__$/, '');
  return <TelegramConnectForm
    key={id}
    onConnected={(displayName) => {
      // Resume conversation: send "Telegram подключил, продолжай"
      handleSendMessage(`Telegram подключил (${displayName}), продолжай.`);
    }}
  />;
}
```

(Match exact existing pattern — token name might differ.)

- [ ] **Step 3.3: Create SocialConnectButton.tsx**

```typescript
// src/components/chat/SocialConnectButton.tsx
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { SmmPlatform, PLATFORM_LABELS } from '../../types/smm';

interface Props {
  platform: SmmPlatform;
  authorizeUrl: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  vk: 'bg-blue-600 hover:bg-blue-700',
  youtube: 'bg-red-600 hover:bg-red-700',
  tiktok: 'bg-black hover:bg-gray-800',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90',
  telegram: 'bg-sky-500 hover:bg-sky-600',
};

export const SocialConnectButton: React.FC<Props> = ({ platform, authorizeUrl }) => {
  const label = PLATFORM_LABELS[platform] ?? platform;
  const colorClass = PLATFORM_COLORS[platform] ?? 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="my-3">
      <button
        onClick={() => { window.location.href = authorizeUrl; }}
        className={`${colorClass} text-white px-5 py-3 rounded-lg font-medium flex items-center gap-2 transition`}
      >
        <ExternalLink className="w-4 h-4" />
        Подключить {label}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        Откроется страница авторизации {label}. После одобрения вернёшься в чат.
      </p>
    </div>
  );
};

export default SocialConnectButton;
```

- [ ] **Step 3.4: Create TelegramConnectForm.tsx**

```typescript
// src/components/chat/TelegramConnectForm.tsx
import React, { useState } from 'react';
import { Send, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { socialAccountApi } from '../../services/socialAccountApi';

interface Props {
  /** Called when account is created successfully. Parent uses to resume chat. */
  onConnected?: (displayName: string) => void;
}

export const TelegramConnectForm: React.FC<Props> = ({ onConnected }) => {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim() || !chatId.trim()) {
      setError('Заполни bot token и chat id');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const acc = await socialAccountApi.createTelegram({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        displayName: displayName.trim() || undefined,
      });
      setSuccess(true);
      toast.success(`Telegram подключён: ${acc.displayName}`);
      onConnected?.(acc.displayName);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Не удалось подключить');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="my-3 p-4 rounded-lg border border-green-200 bg-green-50 flex items-center gap-2">
        <Check className="w-5 h-5 text-green-600" />
        <span className="text-green-800 font-medium">Telegram подключён</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="my-3 p-4 rounded-lg border border-gray-200 bg-white">
      <div className="text-sm font-medium mb-3">Подключить Telegram-канал</div>

      <input
        type="text"
        placeholder="Bot token (от @BotFather)"
        value={botToken}
        onChange={(e) => setBotToken(e.target.value)}
        className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm font-mono"
        autoComplete="off"
        disabled={loading}
      />
      <input
        type="text"
        placeholder="Chat ID или @username канала"
        value={chatId}
        onChange={(e) => setChatId(e.target.value)}
        className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm"
        autoComplete="off"
        disabled={loading}
      />
      <input
        type="text"
        placeholder="Название (опционально)"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded text-sm"
        autoComplete="off"
        disabled={loading}
      />

      <button
        type="button"
        onClick={() => setShowHelp(!showHelp)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-3"
      >
        {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Как получить bot_token и chat_id?
      </button>

      {showHelp && (
        <div className="text-xs text-gray-600 mb-3 p-3 bg-gray-50 rounded space-y-1">
          <p><strong>Bot token:</strong> Напиши @BotFather, команда /newbot, следуй инструкциям. Получишь токен вида <code>123:ABC-XYZ</code>.</p>
          <p><strong>Chat ID:</strong> Создай канал, добавь своего бота как админа с правом постить, затем chat_id = <code>@my_channel</code> (для публичных) или числовой ID вида <code>-1001234567890</code> (получи через @userinfobot — добавь его в канал на минуту).</p>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !botToken.trim() || !chatId.trim()}
        className="bg-sky-500 hover:bg-sky-600 disabled:bg-gray-300 text-white px-4 py-2 rounded font-medium flex items-center gap-2 text-sm"
      >
        <Send className="w-4 h-4" />
        {loading ? 'Подключаем…' : 'Подключить'}
      </button>
    </form>
  );
};

export default TelegramConnectForm;
```

- [ ] **Step 3.5: Wire tool_result handling in ChatInterface for connect_social**

В ChatInterface, рядом с уже существующими handler'ами для `tool_result` (там обрабатываются generate_video, generate_scenarios, approve_scenarios, regenerate_scenario), добавить новый ветка для `connect_social`:

```typescript
if (data.type === 'tool_result' && data.tool === 'connect_social') {
  const result = data.result as { platform: string; method: 'oauth' | 'manual'; authorizeUrl?: string };
  if (result.method === 'oauth' && result.authorizeUrl) {
    accumulatedContent += `\n\n{{smm_social_connect_button:platform=${result.platform},authorize_url=${result.authorizeUrl}}}`;
  } else if (result.method === 'manual' && result.platform === 'telegram') {
    accumulatedContent += `\n\n{{smm_social_connect_telegram}}`;
  }
}
```

- [ ] **Step 3.6: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 3.7: Commit**

```bash
git add src/utils/customMarkdown.tsx \
        src/components/chat/SocialConnectButton.tsx \
        src/components/chat/TelegramConnectForm.tsx \
        src/components/chat/ChatInterface.tsx
git -c commit.gpgsign=false commit -m "feat(smm): inline social-connect блоки в чате — кнопка + Telegram-форма

Два новых CustomMarkdown-тега:
  {{smm_social_connect_button:platform=vk,authorize_url=...}} →
    <SocialConnectButton> кнопка с брендовым цветом, открывает OAuth
  {{smm_social_connect_telegram}} →
    <TelegramConnectForm> inline-форма с полями bot_token + chat_id,
    валидирует через POST /webhook/smm/social-accounts/telegram,
    по успеху резюмирует диалог сообщением 'Telegram подключил'

ChatInterface.tsx ловит tool_result от connect_social в NDJSON-стриме
и инъектит соответствующий markdown-тег в ответ AI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: OAuth callback handler в ChatPage (toast + auto-resume)

**Files:**
- Modify: `src/pages/ChatPage.tsx` (или wrap-around компонент где надо)

После того как клиент авторизовался в VK/YT/TT/IG, провайдер редиректит на `/chat?smm_oauth_success=vk`. Чат должен показать toast, очистить query, и автоматически продолжить диалог.

- [ ] **Step 4.1: Inspect ChatPage**

```bash
cat /Users/dmitry/Downloads/spirits_front/src/pages/ChatPage.tsx | head -50
```

Expected: видно как страница инициализируется и где можно добавить useEffect для query-handler. Если в ChatPage пробрасывается `sendMessage` или подобный API в ChatInterface — useEffect лучше делать там, где можно отправить сообщение.

- [ ] **Step 4.2: Add OAuth callback handler**

Лучшее место для handler'а — `ChatInterface.tsx` (там доступна функция `handleSendMessage` или аналог). Найти `useEffect` для initial state и добавить рядом новый:

```typescript
import toast from 'react-hot-toast';
import { PLATFORM_LABELS, SmmPlatform } from '../../types/smm';

// ...inside component, after other useEffects:
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const success = params.get('smm_oauth_success');
  const error = params.get('smm_oauth_error');

  if (success) {
    const label = PLATFORM_LABELS[success as SmmPlatform] ?? success;
    toast.success(`${label} подключён`);
    window.history.replaceState({}, '', window.location.pathname);
    // resume the chat
    setTimeout(() => {
      handleSendMessage(`Подключил ${label}, продолжай.`);
    }, 200);
  } else if (error) {
    toast.error(`Не удалось подключить: ${decodeURIComponent(error)}`);
    window.history.replaceState({}, '', window.location.pathname);
  }
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

NOTE: если `handleSendMessage` создаётся через useCallback с зависимостями, может понадобиться его в deps массиве. Проверь на practice.

- [ ] **Step 4.3: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm build 2>&1 | tail -3
```

- [ ] **Step 4.4: Commit**

```bash
git add src/components/chat/ChatInterface.tsx
git -c commit.gpgsign=false commit -m "feat(smm): OAuth-callback handler в чате — toast + автопродолжение

После OAuth-провайдер редиректит на /chat?smm_oauth_success=vk.
ChatInterface useEffect ловит query на mount:
  - smm_oauth_success → зелёный toast + автоотправка
    'Подключил <Platform>, продолжай.' (продюсер сразу пробует
    schedule_publication снова)
  - smm_oauth_error → красный toast с расшифровкой
В обоих случаях history.replaceState чистит query чтоб refresh
не повторял эффект.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `/settings/social` страница + route + Navigation

**Files:**
- Create: `src/components/settings/SettingsSocialView.tsx`
- Create: `src/pages/SettingsSocialPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Navigation.tsx`
- Modify: `src/i18n/locales/ru.json`
- Modify: `src/i18n/locales/en.json`

Отдельная страница для управления подключёнными аккаунтами вне контекста чата.

- [ ] **Step 5.1: Create SettingsSocialView.tsx**

```typescript
// src/components/settings/SettingsSocialView.tsx
import React, { useEffect, useState } from 'react';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { socialAccountApi } from '../../services/socialAccountApi';
import { SocialAccount, SmmPlatform, PLATFORM_LABELS } from '../../types/smm';
import TelegramConnectForm from '../chat/TelegramConnectForm';

const PLATFORMS: SmmPlatform[] = ['telegram', 'vk', 'youtube', 'tiktok', 'instagram'];

const SettingsSocialView: React.FC = () => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [tgModalOpen, setTgModalOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<SmmPlatform | null>(null);

  const refresh = async () => {
    try {
      const data = await socialAccountApi.list();
      setAccounts(data);
    } catch (e: any) {
      toast.error(`Не удалось загрузить список: ${e?.message ?? 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // OAuth callback handler (same as ChatInterface, but resumes nothing)
    const params = new URLSearchParams(window.location.search);
    const success = params.get('smm_oauth_success');
    const error = params.get('smm_oauth_error');
    if (success) {
      const label = PLATFORM_LABELS[success as SmmPlatform] ?? success;
      toast.success(`${label} подключён`);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      toast.error(`Не удалось подключить: ${decodeURIComponent(error)}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async (platform: SmmPlatform) => {
    if (platform === 'telegram') {
      setTgModalOpen(true);
      return;
    }
    setConnectingPlatform(platform);
    try {
      const { authorizeUrl } = await socialAccountApi.getOAuthStartUrl(
        platform as Exclude<SmmPlatform, 'telegram'>,
        '/settings/social',
      );
      window.location.href = authorizeUrl;
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'ошибка';
      toast.error(`${PLATFORM_LABELS[platform]}: ${msg}`);
      setConnectingPlatform(null);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Удалить подключение ${label}?`)) return;
    try {
      await socialAccountApi.remove(id);
      toast.success('Удалено');
      await refresh();
    } catch (e: any) {
      toast.error(`Не удалось удалить: ${e?.message ?? 'ошибка'}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Социальные сети</h1>
      <p className="text-gray-600 mb-6">
        Подключи свои каналы и аккаунты — AI-продюсер сможет публиковать видео туда.
      </p>

      {/* Connect grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => handleConnect(p)}
            disabled={connectingPlatform === p}
            className="border border-gray-200 hover:border-blue-400 rounded-lg p-4 text-left transition"
          >
            <div className="flex items-center gap-2 mb-1">
              {connectingPlatform === p
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4 text-blue-600" />}
              <span className="font-medium">{PLATFORM_LABELS[p]}</span>
            </div>
            <div className="text-xs text-gray-500">Подключить</div>
          </button>
        ))}
      </div>

      {/* Accounts list */}
      <h2 className="text-lg font-semibold mb-3">Подключённые аккаунты</h2>
      {loading ? (
        <div className="text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загружаем…
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-gray-500 text-sm py-4 px-3 bg-gray-50 rounded">
          Пока пусто. Подключи первый аккаунт выше.
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 px-3">Платформа</th>
              <th className="py-2 px-3">Название</th>
              <th className="py-2 px-3">Статус</th>
              <th className="py-2 px-3">Подключён</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3">{PLATFORM_LABELS[a.platform]}</td>
                <td className="py-2 px-3 font-mono text-xs">{a.displayName}</td>
                <td className="py-2 px-3">
                  <span className={a.status === 'active' ? 'text-green-600' : 'text-orange-500'}>
                    {a.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-500">
                  {new Date(a.createdAt).toLocaleDateString('ru-RU')}
                </td>
                <td className="py-2 px-3">
                  <button
                    onClick={() => handleDelete(a.id, PLATFORM_LABELS[a.platform])}
                    className="text-red-500 hover:text-red-700"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Telegram modal */}
      {tgModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setTgModalOpen(false); }}
        >
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Telegram-канал</h3>
              <button onClick={() => setTgModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <TelegramConnectForm onConnected={() => { setTgModalOpen(false); refresh(); }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsSocialView;
```

- [ ] **Step 5.2: Create SettingsSocialPage.tsx**

```typescript
// src/pages/SettingsSocialPage.tsx
import React from 'react';
import SettingsSocialView from '../components/settings/SettingsSocialView';

const SettingsSocialPage: React.FC = () => {
  return <SettingsSocialView />;
};

export default SettingsSocialPage;
```

- [ ] **Step 5.3: Register route in App.tsx**

В `App.tsx` в блоке `<Routes>`:

```typescript
import SettingsSocialPage from './pages/SettingsSocialPage';
// ...
<Route path="/settings/social" element={<SettingsSocialPage />} />
```

Auth-guard уже работает на уровне `AppContent` (если `!isAuthenticated` → `<OnboardingPage />` для всех роутов).

- [ ] **Step 5.4: Add Navigation link**

Open `src/components/layout/Navigation.tsx`. Найти массив navItems или подобный (где определены `Chat`, `Profile`, etc.). Добавить:

```typescript
import { Share2 } from 'lucide-react';
// in navItems:
{ to: '/settings/social', label: t('nav.socialAccounts'), icon: Share2 },
```

(точная структура зависит от существующего паттерна; следовать ему).

- [ ] **Step 5.5: Add i18n keys**

`src/i18n/locales/ru.json`:
```json
{
  "nav": {
    "socialAccounts": "Соцсети"
  }
}
```

`src/i18n/locales/en.json`:
```json
{
  "nav": {
    "socialAccounts": "Social"
  }
}
```

Если уже есть секция `nav`, добавить ключ внутрь неё (не дублировать).

- [ ] **Step 5.6: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/settings/SettingsSocialView.tsx \
        src/pages/SettingsSocialPage.tsx \
        src/App.tsx \
        src/components/layout/Navigation.tsx \
        src/i18n/locales/ru.json \
        src/i18n/locales/en.json
git -c commit.gpgsign=false commit -m "feat(smm): страница /settings/social для управления соц-аккаунтами

- SettingsSocialView: список подключённых с display_name/status/датой,
  кнопка удаления с confirm. 5 карточек 'Подключить' для каждой
  платформы. Telegram открывает модал с переиспользуемым
  TelegramConnectForm; остальные 4 редиректят на OAuth с
  redirect=/settings/social, чтобы возврат был сюда же.
- Page mounted at /settings/social, добавлена в Navigation как 'Соцсети'.
- OAuth callback handler внутри страницы (toast + history.replaceState)
  без auto-resume — клиент тут уже не в чате.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Deploy + smoke E2E

**Files:**
- (deploy only)

- [ ] **Step 6.1: Deploy frontend**

Plan 4d не трогает фронт-инфраструктуру (только новые компоненты + один env-уровневый файл `react-hot-toast` в `node_modules`). Стандартный путь:

```bash
cd /Users/dmitry/Downloads/spirits_front
echo "VITE_BACKEND_URL=https://my.linkeon.io" > .env
pnpm build
rsync -az --delete dist/ dvolkov@212.113.106.202:/home/dvolkov/spirits_front/
```

Expected: rsync uploads new bundle, Nginx раздаёт.

- [ ] **Step 6.2: Verify deploy via curl + health check**

```bash
# Hit /settings/social — should return 200 (SPA serves index.html for all routes)
curl -s -o /dev/null -w "settings/social: %{http_code}\n" https://my.linkeon.io/settings/social

# Verify Toaster code shipped in bundle
curl -s https://my.linkeon.io/ | grep -o "react-hot-toast" | head -1 || echo "(not found in HTML — that's fine, it's inside JS bundle)"

# Hit a script tag and grep
SCRIPT=$(curl -s https://my.linkeon.io/ | grep -oE 'assets/index-[a-f0-9]+\.js' | head -1)
curl -s "https://my.linkeon.io/$SCRIPT" | grep -c "smm_social_connect_telegram" 2>&1 | head -1
# Expected: > 0 — confirms new tag-парсер shipped
```

- [ ] **Step 6.3: Manual smoke — Telegram E2E**

Это финальная демка. Понадобится:
1. Telegram bot (через @BotFather) — получи bot_token
2. Telegram канал, добавь бота как админа с правом постить
3. chat_id канала (через @userinfobot, или просто `@username` для публичных)

Пройди вживую:

```
1. Зайди на https://my.linkeon.io/, залогинься как тестовый юзер (или 79030169187)
2. Перейди в чат с SMM Producer agent (id=15)
3. Напиши: "Сгенерируй 1 короткий ролик про долги"
4. Дождись результата → подтверди ("первый ок")
5. Дождись пока ролик отрендерится (~75 сек)
6. Подтверди видео ("норм")
7. Напиши: "Опубликуй в Telegram сейчас"
8. AI должен позвать connect_social(telegram) (т.к. ещё не подключал)
9. В чате появится inline-форма Telegram → введи bot_token + chat_id
10. Submit → форма зелёная "Telegram подключён ✓" → toast наверху → AI продолжает
11. AI должен позвать schedule_publication(...) → result.scheduled = [{ platform: 'telegram', ... }]
12. В течение ~5 сек worker подхватит BullMQ-job → проверь канал в Telegram → ролик должен опубликоваться
13. AI напишет URL поста — клик → откроется пост в TG
```

Если что-то ломается:
- Pm2 logs: `ssh dvolkov@212.113.106.202 'pm2 logs linkeon-api --lines 30 --nostream'`
- Worker logs: `ssh dvolkov@212.113.106.202 'pm2 logs linkeon-smm-worker --lines 30 --nostream'`
- Браузерная консоль на /chat (F12)

- [ ] **Step 6.4: Manual smoke — Settings page**

```
1. Перейди в /settings/social
2. Должна загрузиться страница со списком (Telegram там должен быть после Step 6.3)
3. Кликни "Удалить" → confirm → аккаунт пропадает
4. Кликни "Подключить Telegram" → модал → введи данные → submit → закроется модал → аккаунт появится в списке
```

- [ ] **Step 6.5: Tag release**

```bash
cd /Users/dmitry/Downloads/spirits_back
git tag -a smm-plan-4d-deployed -m "Plan 4d (Social Accounts UX) deployed to PROD

Frontend inline-блоки для подключения соцсетей + страница /settings/social.
Backend AdminGuard снят с /oauth/* и /social-accounts/*, добавлен
per-user rate-limit. OAuth redirect перенаправлен в /chat для
автопродолжения диалога.

E2E Telegram flow проверен вручную: чат → connect_social → форма →
schedule_publication → реальный пост в TG-канале.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin smm-plan-4d-deployed
```

---

## Self-Review Checklist

**1. Спецификация vs план:**
- Snять AdminGuard на 2 контроллерах → Task 1 ✓
- Per-user rate-limit → Task 1 ✓
- OAuth redirect destination → Task 1 ✓
- Типы + API клиент → Task 2 ✓
- CustomMarkdown 2 новых блока → Task 3 ✓
- SocialConnectButton + TelegramConnectForm → Task 3 ✓
- tool_result connect_social в стриме → Task 3 ✓
- OAuth callback toast + auto-resume → Task 4 ✓
- /settings/social page → Task 5 ✓
- Navigation link → Task 5 ✓
- E2E smoke Telegram → Task 6 ✓

**2. Placeholder scan:** каждый шаг имеет TS-код или конкретные команды. Нет TBD / TODO / "fill in details".

**3. Type consistency:**
- `SmmPlatform` определён в `src/types/smm.ts` — используется во всех 5 фронт-задачах
- `SocialAccount` тип в `src/types/smm.ts` — используется в `socialAccountApi.ts`, `SettingsSocialView`
- `PLATFORM_LABELS` константа — переиспользуется в SocialConnectButton, TelegramConnectForm, SettingsSocialView, ChatInterface callback handler
- Backend `OAuthController.callback` signature не меняется (только redirect destination внутри тела)
- `IpRateLimiter.check(key, bucket, limit, windowSeconds)` — сигнатура соблюдена в обоих местах (Task 1.2 + 1.3)

**4. Cross-task coherence:**
- Task 2 (`<Toaster />` mounted in App.tsx) обеспечивает Task 4 (`toast.success/error`) и Task 5 (модал использует toast)
- Task 3 (TelegramConnectForm) переиспользуется в Task 5 (модал на settings page)
- Task 4 OAuth handler в ChatInterface работает вместе с Task 1.2 redirect change
- Task 6 smoke может протестировать всё end-to-end только если все предыдущие задачи зелёные

**5. Известные риски / mitigations:**
- Если в проекте уже есть свой toast — Task 2.4 будет дублировать функционал. Mitigation: проверить через grep `grep -r "toast\|Toaster" src/` перед добавлением react-hot-toast.
- ChatInterface вероятно большой и имеет специфичный паттерн рендера CustomMarkdown placeholders. Mitigation: Task 3.2 говорит "Match exact existing pattern — token name might differ" — даёт implementor'у право скопировать существующий способ.
- Telegram getChat валидация на бэке (Task 6.3 step 9 → 10) может упасть если bot не админ канала. Mitigation: ошибка вернётся в форму, клиент поправит — нормальный UX.

---

## Out of scope / Follow-ups

- **Множественные TG-каналы на одного юзера** — `smm_social_account` UNIQUE на (user_id, platform) пока. Расширение — отдельный план.
- **Tooltips/onboarding-tutorial для первого подключения** — простой UX уже учит через линки "Как получить chat_id?". Если будут запросы — добавить пошаговый wizard.
- **Платформенные иконки** — `lucide-react` имеет общие иконки, но не брендовые. Использовали `Share2`/`Plus`/`ExternalLink`. Если хочется аутентичных лого — SVG inline или `react-icons`.
- **Server-side rate-limit refinement** — текущий `IpRateLimiter` использует фиксированные buckets (sliding window лучше для smoothing). Достаточно для MVP, фиксить только если abuse-сценарии материализуются.
- **Reviewer-флаги от Plan 4** (admin gate на agent, IG shortcode, TikTok username, YT refresh persistence) — отдельный план; не блокируют Plan 4d.
