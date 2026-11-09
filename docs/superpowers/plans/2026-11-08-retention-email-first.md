# Retention Email-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать email основным каналом ручной retention-рассылки, сохранить SMS только для пользователей без известного email, расширить сегмент на UUID и добавить необходимую отписку.

**Architecture:** Новый NestJS-модуль `retention` инкапсулирует сегменты, разрешение контактов, локализованные письма, отправку и suppression. Существующий admin API делегирует в него, а React-экран показывает смешанные каналы и отправляет `userIds[]`.

**Tech Stack:** NestJS 10, TypeScript 5, PostgreSQL, Nodemailer, Axios, Jest 29, React 18, Vitest, Vite 5, Tailwind CSS 3, pnpm.

**Спецификация:** [2026-11-08-retention-email-first-design.md](../specs/2026-11-08-retention-email-first-design.md).

---

## Правила исполнения и проверки

1. Работа ведётся в отдельных worktrees, а не в основных чекаутах. Backend-ветка начинается с актуального `origin/main`; frontend-ветка — с коммита спецификации `738836b`.
2. Код на тестовую ноду попадает только через git. Каждый прогон использует конкретный `git rev-parse HEAD`, а не имя ветки внутри общего CI-клона.
3. Локально на маке `jest`, `tsc` и `build` не запускать. Команды `back-ci` и `front-ci` ниже выполняют их на `dv@85.192.61.231`.
4. Не отправлять реальные письма или SMS. В тестах `MailService` и SMS Aero подменяются.
5. Каждый `git add` перечисляет файлы явно. Не добавлять чужие изменения и не катить на test/prod: выкат — отдельное решение после завершения плана.

### Task 0: Изолированные worktrees и CI-команды

**Files:**
- Create outside repositories: `/Users/dmitry/Downloads/spirits_back/.worktrees/retention-email-first`
- Create outside repositories: `/Users/dmitry/Downloads/spirits_front/.worktrees/retention-email-first`

- [ ] **Step 1: Создать worktrees и скопировать план для исполнителя**

```bash
mkdir -p /Users/dmitry/Downloads/spirits_back/.worktrees
mkdir -p /Users/dmitry/Downloads/spirits_front/.worktrees
git -C /Users/dmitry/Downloads/spirits_back fetch -q origin
git -C /Users/dmitry/Downloads/spirits_back worktree add \
  -b feat/retention-email-first-2026-11-08 \
  /Users/dmitry/Downloads/spirits_back/.worktrees/retention-email-first \
  origin/main

git -C /Users/dmitry/Downloads/spirits_front worktree add \
  -b feat/retention-email-first-2026-11-08 \
  /Users/dmitry/Downloads/spirits_front/.worktrees/retention-email-first \
  738836b
mkdir -p /Users/dmitry/Downloads/spirits_front/.worktrees/retention-email-first/docs/superpowers/plans
cp \
  /Users/dmitry/Downloads/spirits_front/docs/superpowers/plans/2026-11-08-retention-email-first.md \
  /Users/dmitry/Downloads/spirits_front/.worktrees/retention-email-first/docs/superpowers/plans/2026-11-08-retention-email-first.md
```

Expected: оба worktrees существуют; `git -C <worktree> status --short` показывает только скопированный план во frontend.

- [ ] **Step 2: Определить backend-команду прогона в каждой backend-shell**

Выполнять из backend-worktree. Функция публикует текущий коммит только в рабочую wip-ветку и запускает переданную команду на ноде на точном SHA.

```bash
back-ci() {
  local sha
  sha=$(git rev-parse HEAD) || return 1
  git push -q origin HEAD:refs/heads/wip/retention-email-first-back-2026-11-08 || return 1
  ssh dv@85.192.61.231 "git -C ~/ci/spirits_back fetch -q origin && git -C ~/ci/spirits_back checkout -q $sha && source ~/.nvm/nvm.sh && cd ~/ci/spirits_back && $*"
}
```

- [ ] **Step 3: Определить frontend-команду прогона в каждой frontend-shell**

Выполнять из frontend-worktree.

```bash
front-ci() {
  local sha
  sha=$(git rev-parse HEAD) || return 1
  git push -q origin HEAD:refs/heads/wip/retention-email-first-front-2026-11-08 || return 1
  ssh dv@85.192.61.231 "git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front checkout -q $sha && source ~/.nvm/nvm.sh && cd ~/ci/spirits_front && $*"
}
```

- [ ] **Step 4: Установить зависимости один раз**

```bash
back-ci "npm ci"
front-ci "pnpm install"
```

Expected: обе команды завершаются с exit code 0. Последующие задачи не меняют зависимости, поэтому повторная установка не нужна.

---

### Task 1: Типы и чистые правила контакта/канала

**Files:**
- Create: `src/retention/retention.types.ts`
- Create: `src/retention/retention-recipient.ts`
- Test: `src/retention/retention-recipient.spec.ts`

- [ ] **Step 1: Написать красный тест правил**

```ts
import {
  isRetentionUserId,
  normalizeEmail,
  normalizePhone,
  selectRetentionChannel,
} from './retention-recipient';

describe('retention recipient rules', () => {
  it('нормализует email и отбрасывает невалидные значения', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it('нормализует +7 и не принимает произвольный номер', () => {
    expect(normalizePhone('+79001112233')).toBe('79001112233');
    expect(normalizePhone('79001112233')).toBe('79001112233');
    expect(normalizePhone('8 900 111 22 33')).toBeNull();
    expect(normalizePhone('dozvon_123')).toBeNull();
  });

  it('принимает телефонный ID и canonical UUID, но не служебные префиксы', () => {
    expect(isRetentionUserId('79001112233')).toBe(true);
    expect(isRetentionUserId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isRetentionUserId('dozvon')).toBe(false);
    expect(isRetentionUserId('11111111-1111-4111-8111-11111111111g')).toBe(false);
  });

  it('email имеет приоритет даже при наличии телефона', () => {
    expect(selectRetentionChannel({ email: 'u@example.com', phone: '79001112233' })).toBe('email');
  });

  it('без email выбирает SMS, а без обоих контактов — no_channel', () => {
    expect(selectRetentionChannel({ email: null, phone: '79001112233' })).toBe('sms');
    expect(selectRetentionChannel({ email: null, phone: null })).toBe('no_channel');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест**

```bash
git add src/retention/retention-recipient.spec.ts
git commit -m "test(retention): правила email-first контактов (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить отсутствие реализации на ноде**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-recipient.spec.ts --runInBand"`
Expected: FAIL — `./retention-recipient` не найден.

- [ ] **Step 4: Добавить типы и минимальную реализацию**

`src/retention/retention.types.ts`:

```ts
export type RetentionMode = 'general' | 'curious';
export type RetentionChannel = 'email' | 'sms' | 'no_channel';

export interface RetentionContact {
  userId: string;
  email: string | null;
  phone: string | null;
  language: string;
  unsubscribed: boolean;
}

export interface RetentionDraft {
  user_id: string;
  phone: string | null;
  email: string | null;
  channel: RetentionChannel;
  language: string;
  subject: string | null;
  message: string;
  assistant_id?: string;
  assistant_name?: string | null;
  last_at: Date | string;
  days_inactive?: number;
  hours_inactive?: number;
  last_sent_at: Date | string | null;
  in_cooldown: boolean;
}

export interface RetentionSummary {
  email: number;
  sms: number;
  no_channel: number;
  skipped_unsubscribed: number;
}

export interface RetentionPreview {
  channel: 'mixed';
  campaign: string;
  window: { min_days?: number; max_days?: number; min_hours?: number; max_hours?: number };
  cooldown_days: number;
  count: number;
  summary: RetentionSummary;
  drafts: RetentionDraft[];
}

export interface RetentionSendRequest {
  confirm?: boolean;
  userIds?: string[];
  phones?: string[];
  resend?: boolean;
  minDays?: number;
  maxDays?: number;
}

export interface RetentionResultRow {
  user_id: string;
  phone: string | null;
  email: string | null;
  channel: Exclude<RetentionChannel, 'no_channel'>;
  status: 'sent' | 'failed';
  error: string | null;
  log_error?: boolean;
}

export interface RetentionSendResult {
  campaign: string;
  sent: number;
  sent_email: number;
  sent_sms: number;
  failed: number;
  skipped_cooldown: number;
  skipped_unsubscribed: number;
  no_channel: number;
  results: RetentionResultRow[];
}

export type RetentionSendResponse =
  | RetentionSendResult
  | { error: 'confirm_required' | 'ambiguous_recipient_filter'; message: string };
```

`src/retention/retention-recipient.ts`:

```ts
import type { RetentionChannel } from './retention.types';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^7[0-9]{10}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RETENTION_UID_SQL_RE = '^(7[0-9]{10}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$';

export function normalizeEmail(raw: unknown): string | null {
  const value = String(raw ?? '').trim().toLowerCase();
  return EMAIL_RE.test(value) ? value : null;
}

export function normalizePhone(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  const normalized = value.startsWith('+') ? value.slice(1) : value;
  return PHONE_RE.test(normalized) ? normalized : null;
}

export function isRetentionUserId(raw: unknown): boolean {
  const value = String(raw ?? '');
  return PHONE_RE.test(value) || UUID_RE.test(value);
}

export function selectRetentionChannel(contact: { email: string | null; phone: string | null }): RetentionChannel {
  if (contact.email) return 'email';
  if (contact.phone) return 'sms';
  return 'no_channel';
}
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/retention/retention.types.ts src/retention/retention-recipient.ts
git commit -m "feat(retention): нормализация контактов и выбор канала" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить зелёный прогон**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-recipient.spec.ts --runInBand"`
Expected: PASS, 5 tests.

---

### Task 2: Миграция и сервис отписки

**Files:**
- Create: `src/retention/migrations/001_retention_email_unsubscribes.sql`
- Create: `src/retention/retention-unsubscribe.service.ts`
- Test: `src/retention/retention-unsubscribe.service.spec.ts`

- [ ] **Step 1: Написать красный тест хранения токена и идемпотентной отписки**

```ts
import { maskRetentionEmail, RetentionUnsubscribeService } from './retention-unsubscribe.service';

describe('RetentionUnsubscribeService', () => {
  const pg = { query: jest.fn() };
  let svc: RetentionUnsubscribeService;

  beforeEach(() => {
    pg.query.mockReset();
    svc = new RetentionUnsubscribeService(pg as any);
  });

  it('возвращает новый токен после вставки', async () => {
    pg.query.mockResolvedValueOnce({ rows: [{ token: 'a'.repeat(43) }] });
    await expect(svc.ensureToken('User@Example.com')).resolves.toBe('a'.repeat(43));
    expect(pg.query.mock.calls[0][1][0]).toBe('user@example.com');
    expect(pg.query.mock.calls[0][1][1]).toHaveLength(43);
  });

  it('при конфликте читает существующий стабильный токен', async () => {
    pg.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ token: 'b'.repeat(43) }] });
    await expect(svc.ensureToken('user@example.com')).resolves.toBe('b'.repeat(43));
    expect(pg.query).toHaveBeenCalledTimes(2);
  });

  it('не ищет заведомо невалидный токен', async () => {
    await expect(svc.findByToken('../secret')).resolves.toBeNull();
    expect(pg.query).not.toHaveBeenCalled();
  });

  it('отписка сохраняет первое время через COALESCE', async () => {
    pg.query.mockResolvedValueOnce({ rows: [{ email: 'u@example.com', unsubscribed_at: new Date('2026-11-08T10:00:00Z') }] });
    const result = await svc.unsubscribe('x'.repeat(43));
    expect(result?.email).toBe('u@example.com');
    expect(pg.query.mock.calls[0][0]).toContain('COALESCE(unsubscribed_at, now())');
  });

  it('suppression проверяется по нормализованному адресу', async () => {
    pg.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    await expect(svc.isUnsubscribed(' User@Example.com ')).resolves.toBe(true);
    expect(pg.query.mock.calls[0][1]).toEqual(['user@example.com']);
  });

  it('маскирует адрес на публичной странице', () => {
    expect(maskRetentionEmail('person@example.com')).toBe('p***n@example.com');
    expect(maskRetentionEmail('ab@example.com')).toBe('a***@example.com');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест**

```bash
git add src/retention/retention-unsubscribe.service.spec.ts
git commit -m "test(retention): токены и идемпотентная отписка (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить FAIL на ноде**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-unsubscribe.service.spec.ts --runInBand"`
Expected: FAIL — сервис не найден.

- [ ] **Step 4: Добавить миграцию и сервис**

`src/retention/migrations/001_retention_email_unsubscribes.sql`:

```sql
CREATE TABLE IF NOT EXISTS retention_email_unsubscribes (
  email_normalized text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz
);
```

`src/retention/retention-unsubscribe.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PgService } from '../common/services/pg.service';
import { normalizeEmail } from './retention-recipient';

export interface RetentionUnsubscribeRecord {
  email: string;
  unsubscribedAt: Date | null;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function maskRetentionEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

@Injectable()
export class RetentionUnsubscribeService {
  constructor(private readonly pg: PgService) {}

  async ensureToken(rawEmail: string): Promise<string> {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new Error('invalid_email');
    const token = randomBytes(32).toString('base64url');
    const inserted = await this.pg.query(
      `INSERT INTO retention_email_unsubscribes (email_normalized, token)
       VALUES ($1, $2)
       ON CONFLICT (email_normalized) DO NOTHING
       RETURNING token`,
      [email, token],
    );
    if (inserted.rows[0]) return inserted.rows[0].token;
    const existing = await this.pg.query(
      'SELECT token FROM retention_email_unsubscribes WHERE email_normalized=$1',
      [email],
    );
    if (!existing.rows[0]) throw new Error('unsubscribe_token_unavailable');
    return existing.rows[0].token;
  }

  async findByToken(token: string): Promise<RetentionUnsubscribeRecord | null> {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const r = await this.pg.query(
      `SELECT email_normalized AS email, unsubscribed_at
         FROM retention_email_unsubscribes WHERE token=$1`,
      [token],
    );
    if (!r.rows[0]) return null;
    return { email: r.rows[0].email, unsubscribedAt: r.rows[0].unsubscribed_at };
  }

  async unsubscribe(token: string): Promise<RetentionUnsubscribeRecord | null> {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const r = await this.pg.query(
      `UPDATE retention_email_unsubscribes
          SET unsubscribed_at=COALESCE(unsubscribed_at, now()), updated_at=now()
        WHERE token=$1
        RETURNING email_normalized AS email, unsubscribed_at`,
      [token],
    );
    if (!r.rows[0]) return null;
    return { email: r.rows[0].email, unsubscribedAt: r.rows[0].unsubscribed_at };
  }

  async isUnsubscribed(rawEmail: string): Promise<boolean> {
    const email = normalizeEmail(rawEmail);
    if (!email) return false;
    const r = await this.pg.query(
      `SELECT 1 FROM retention_email_unsubscribes
        WHERE email_normalized=$1 AND unsubscribed_at IS NOT NULL LIMIT 1`,
      [email],
    );
    return r.rows.length > 0;
  }
}
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/retention/migrations/001_retention_email_unsubscribes.sql src/retention/retention-unsubscribe.service.ts
git commit -m "feat(retention): хранение токенов и suppression email" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить зелёный прогон**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-unsubscribe.service.spec.ts --runInBand"`
Expected: PASS, 6 tests.

### Task 2 — итоговая замена registry на stateless-ссылки (выполнено)

Владелец 2026-11-09 выбрал шифрованные stateless-ссылки. Первоначальные registry- и cleanup-шаги Task 2 заменены следующей реализацией:

- `retention-token-cipher.ts` — AES-256-GCM конверт нормализованного email: version byte `1`, 12-byte random IV, 16-byte auth tag и ciphertext в base64url. Секрет — `RETENTION_UNSUBSCRIBE_SECRET`, ровно 64 hex-символа из окружения test/prod, не из git.
- `ensureToken` больше не пишет в БД. До реальной отписки таблица пустая; `ProfileService` и `account-deletion.spec.ts` оставлены точно как в `origin/main`; cleanup-файлы удалены.
- `findByToken` дешифрует email и ищет suppression по `email_normalized`. `unsubscribe` делает UPSERT по адресу, обновляет последний предъявленный token и сохраняет первое `unsubscribed_at` через `COALESCE`. Разные токены одного адреса работают независимо и видят одну первую отписку.
- Startup-миграция сохраняется через dist/src candidates, но отказ всех найденных SQL вызывает reject вместо молчаливой готовности без схемы.
- Маска считает кодовые точки через `Array.from` и по длине, и по краям: `a😀` и `😀😀` не раскрывают весь local-part.
- Финальный HEAD: `1c56afd81fe997695b75e2de19826348e1324107`. CI: 5 suites, 30/30 PASS. Spec review и code-quality review одобрены. Дополнительные проверки: ноль строк до opt-out, 8 разных токенов, tamper rejection, явный non-null первый timestamp, старые токены после UPSERT.

Применение этой замены обязательно для Tasks 6–8: `RETENTION_UNSUBSCRIBE_SECRET` должен быть установлен в окружении перед реальной отправкой, но его значение не проверяется и не коммитится в этом плане.

---

### Task 3: Локализованные письма и plain text в MailService

**Files:**
- Create: `src/retention/retention-mail.ts`
- Modify: `src/common/services/mail.service.ts:50-74`
- Test: `src/retention/retention-mail.spec.ts`
- Modify test: `src/common/services/mail.service.spec.ts:17-50`

- [ ] **Step 1: Написать красные тесты шаблонов и plain text**

`src/retention/retention-mail.spec.ts`:

```ts
import { buildRetentionEmail, buildRetentionSmsMessage, retentionChatUrl } from './retention-mail';

const LANGS = ['ru', 'en', 'es', 'de', 'fr', 'zh', 'pt'];

describe('retention mail', () => {
  it.each(LANGS)('%s: тема, текст, чат и отписка локализованы', (language) => {
    const mail = buildRetentionEmail({
      mode: 'general', language, assistantName: 'Роман',
      chatUrl: retentionChatUrl(language), unsubscribeUrl: 'https://my.linkeon.io/webhook/retention/unsubscribe?token=x',
    });
    expect(mail.subject.length).toBeGreaterThan(10);
    expect(mail.text).toContain(`https://my.linkeon.io/chat?lang=${language}`);
    expect(mail.text).toContain('unsubscribe?token=x');
    expect(mail.html).toContain('unsubscribe?token=x');
    if (language !== 'ru') expect(mail.text).not.toContain('Здравствуйте');
  });

  it('экранирует имя ассистента в HTML, но оставляет его в plain text', () => {
    const mail = buildRetentionEmail({
      mode: 'general', language: 'en', assistantName: '<img src=x>',
      chatUrl: retentionChatUrl('en'), unsubscribeUrl: null,
    });
    expect(mail.text).toContain('<img src=x>');
    expect(mail.html).not.toContain('<img src=x>');
    expect(mail.html).toContain('&lt;img src=x&gt;');
  });

  it('Curious не использует имя ассистента', () => {
    const mail = buildRetentionEmail({
      mode: 'curious', language: 'en', assistantName: 'Hidden Name',
      chatUrl: retentionChatUrl('en'), unsubscribeUrl: null,
    });
    expect(mail.text).not.toContain('Hidden Name');
  });

  it('неизвестный язык получает русский fallback', () => {
    const mail = buildRetentionEmail({
      mode: 'general', language: 'xx-YY', assistantName: null,
      chatUrl: retentionChatUrl('xx-YY'), unsubscribeUrl: null,
    });
    expect(mail.subject).toBe('Ваш ассистент Linkeon будет рад продолжить разговор');
    expect(mail.text).toContain('Здравствуйте!');
  });

  it('SMS сохраняет текущие русские тексты', () => {
    expect(buildRetentionSmsMessage('general', 'Роман')).toContain('Роман из LINKEON');
    expect(buildRetentionSmsMessage('curious')).toContain('ассистенты под любые задачи');
  });
});
```

Добавить в `src/common/services/mail.service.spec.ts` внутрь `describe('MailService')`:

```ts
  it('передаёт plain text в nodemailer, не ломая старую сигнатуру', async () => {
    let payload: any;
    const svc = withTransport((p?: any) => { payload = p; return Promise.resolve({ messageId: 'x' }); });
    await svc.send('a@example.com', 'тема', '<p>HTML</p>', 'Текст');
    expect(payload).toMatchObject({ subject: 'тема', html: '<p>HTML</p>', text: 'Текст' });
  });
```

- [ ] **Step 2: Закоммитить красные тесты**

```bash
git add src/retention/retention-mail.spec.ts src/common/services/mail.service.spec.ts
git commit -m "test(retention): семь локалей и plain text письма (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить FAIL на ноде**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-mail.spec.ts src/common/services/mail.service.spec.ts --runInBand"`
Expected: FAIL — `retention-mail` отсутствует.

- [ ] **Step 4: Реализовать локализованные шаблоны**

`src/retention/retention-mail.ts`:

```ts
import { LanguageService } from '../common/services/language.service';
import type { RetentionMode } from './retention.types';

interface Strings {
  generalSubject: string;
  curiousSubject: string;
  defaultAssistant: string;
  fromLinkeon: string;
  generalBody: string;
  curiousBody: string;
  cta: string;
  footer: string;
  unsubscribe: string;
}

const STRINGS: Record<string, Strings> = {
  ru: {
    generalSubject: 'Ваш ассистент Linkeon будет рад продолжить разговор',
    curiousSubject: 'Продолжим знакомство с Linkeon?', defaultAssistant: 'Ваш ассистент', fromLinkeon: ' из LINKEON',
    generalBody: 'Здравствуйте! {assistant} будет рад продолжить разговор, если будет желание — можно вернуться в чат: {url} Если сейчас не до этого, это совершенно нормально, не отвлекаем.',
    curiousBody: 'Здравствуйте! Напомним, что у нас есть ассистенты под любые задачи. Если есть время и желание — приходите в {url} и повышайте свою эффективность 👍',
    cta: 'Вернуться в чат', footer: 'Вы получили это письмо возврата, потому что регистрировались в Linkeon.', unsubscribe: 'Отписаться от рассылки возврата',
  },
  en: {
    generalSubject: 'Your Linkeon assistant would be happy to continue',
    curiousSubject: 'Shall we continue getting to know Linkeon?', defaultAssistant: 'Your assistant', fromLinkeon: ' from Linkeon',
    generalBody: 'Hello! {assistant} would be happy to continue the conversation whenever you wish: {url} If now is not the right time, that is completely fine.',
    curiousBody: 'Hello! A quick reminder that Linkeon has assistants for a wide range of tasks. Whenever you have time, visit {url} and explore how they can help 👍',
    cta: 'Return to chat', footer: 'You received this re-engagement email because you registered with Linkeon.', unsubscribe: 'Unsubscribe from re-engagement emails',
  },
  es: {
    generalSubject: 'Tu asistente de Linkeon estará encantado de continuar',
    curiousSubject: '¿Seguimos conociendo Linkeon?', defaultAssistant: 'Tu asistente', fromLinkeon: ' de Linkeon',
    generalBody: '¡Hola! {assistant} estará encantado de continuar la conversación cuando quieras: {url} Si ahora no es buen momento, no pasa nada.',
    curiousBody: '¡Hola! Te recordamos que Linkeon tiene asistentes para distintas tareas. Cuando tengas tiempo, visita {url} y descubre cómo pueden ayudarte 👍',
    cta: 'Volver al chat', footer: 'Recibiste este correo de reactivación porque te registraste en Linkeon.', unsubscribe: 'Cancelar la suscripción a los correos de reactivación',
  },
  de: {
    generalSubject: 'Ihr Linkeon-Assistent freut sich auf das weitere Gespräch',
    curiousSubject: 'Möchten Sie Linkeon weiter kennenlernen?', defaultAssistant: 'Ihr Assistent', fromLinkeon: ' von Linkeon',
    generalBody: 'Guten Tag! {assistant} freut sich darauf, das Gespräch fortzusetzen, wenn Sie möchten: {url} Wenn es gerade nicht passt, ist das völlig in Ordnung.',
    curiousBody: 'Guten Tag! Zur Erinnerung: Linkeon bietet Assistenten für viele verschiedene Aufgaben. Wenn Sie Zeit haben, besuchen Sie {url} und entdecken Sie die Möglichkeiten 👍',
    cta: 'Zum Chat zurückkehren', footer: 'Sie erhalten diese Rückgewinnungs-E-Mail, weil Sie sich bei Linkeon registriert haben.', unsubscribe: 'Rückgewinnungs-E-Mails abbestellen',
  },
  fr: {
    generalSubject: 'Votre assistant Linkeon sera ravi de poursuivre la conversation',
    curiousSubject: 'Envie de continuer à découvrir Linkeon ?', defaultAssistant: 'Votre assistant', fromLinkeon: ' de Linkeon',
    generalBody: 'Bonjour ! {assistant} sera ravi de poursuivre la conversation si vous le souhaitez : {url} Si ce n’est pas le bon moment, c’est tout à fait normal.',
    curiousBody: 'Bonjour ! Petite piqûre de rappel : Linkeon propose des assistants pour de nombreuses tâches. Quand vous avez un moment, rendez-vous sur {url} pour découvrir comment ils peuvent vous aider 👍',
    cta: 'Revenir au chat', footer: 'Vous avez reçu cet e-mail de réactivation car vous vous êtes inscrit à Linkeon.', unsubscribe: 'Se désabonner des e-mails de réactivation',
  },
  zh: {
    generalSubject: '您的 Linkeon 助手期待继续与您交流',
    curiousSubject: '要继续了解 Linkeon 吗？', defaultAssistant: '您的助手', fromLinkeon: '（来自 Linkeon）',
    generalBody: '您好！如果您愿意，{assistant}很乐意继续与您交流：{url} 如果现在不方便，也完全没有关系。',
    curiousBody: '您好！提醒您，Linkeon 有适合各种任务的助手。如果您有时间，欢迎访问 {url}，了解它们如何提高您的效率 👍',
    cta: '返回聊天', footer: '您收到这封回访邮件，是因为您注册过 Linkeon。', unsubscribe: '退订回访邮件',
  },
  pt: {
    generalSubject: 'O seu assistente Linkeon terá todo o gosto em continuar',
    curiousSubject: 'Vamos continuar a conhecer o Linkeon?', defaultAssistant: 'O seu assistente', fromLinkeon: ' do Linkeon',
    generalBody: 'Olá! {assistant} terá todo o gosto em continuar a conversa quando desejar: {url} Se agora não for conveniente, é perfeitamente normal.',
    curiousBody: 'Olá! Lembramos que o Linkeon tem assistentes para várias tarefas. Quando tiver tempo, visite {url} e descubra como podem ajudar 👍',
    cta: 'Voltar ao chat', footer: 'Recebeu este e-mail de reativação porque se registou no Linkeon.', unsubscribe: 'Cancelar a subscrição dos e-mails de reativação',
  },
};

export function escapeRetentionHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function retentionChatUrl(language: string): string {
  return `https://my.linkeon.io/chat?lang=${LanguageService.normalize(language)}`;
}

export function buildRetentionSmsMessage(mode: RetentionMode, assistantName?: string | null): string {
  if (mode === 'curious') {
    return 'Здравствуйте! Напомним, что у нас есть ассистенты под любые задачи. Если есть время и желание — приходите в https://my.linkeon.io/chat и повышайте свою эффективность 👍';
  }
  const who = assistantName ? `${assistantName} из LINKEON` : 'Ваш ассистент в LINKEON';
  return `Здравствуйте! ${who} будет рад продолжить разговор, если будет желание — можно вернуться в чат: https://my.linkeon.io/chat. Если сейчас не до этого, это совершенно нормально, не отвлекаем.`;
}

function fill(template: string, assistant: string): string {
  return template.split('{assistant}').join(assistant);
}

export function buildRetentionEmail(input: {
  mode: RetentionMode;
  language: string;
  assistantName?: string | null;
  chatUrl: string;
  unsubscribeUrl: string | null;
}): { subject: string; text: string; html: string } {
  const language = LanguageService.normalize(input.language);
  const s = STRINGS[language] || STRINGS.ru;
  const assistant = input.assistantName ? `${input.assistantName}${s.fromLinkeon}` : `${s.defaultAssistant}${s.fromLinkeon}`;
  const template = input.mode === 'general' ? s.generalBody : s.curiousBody;
  const body = fill(template, assistant).split('{url}').join(input.chatUrl);
  const subject = input.mode === 'general' ? s.generalSubject : s.curiousSubject;
  const [beforeUrl, afterUrl] = fill(template, assistant).split('{url}');
  const link = `<a href="${escapeRetentionHtml(input.chatUrl)}" style="color:#4f46e5">${escapeRetentionHtml(s.cta)}</a>`;
  let html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111"><p>${escapeRetentionHtml(beforeUrl)}${link}${escapeRetentionHtml(afterUrl || '')}</p>`;
  let text = body;
  if (input.unsubscribeUrl) {
    text += `\n\n${s.footer}\n${s.unsubscribe}: ${input.unsubscribeUrl}`;
    html += `<p style="color:#777;font-size:13px">${escapeRetentionHtml(s.footer)}<br><a href="${escapeRetentionHtml(input.unsubscribeUrl)}" style="color:#4f46e5">${escapeRetentionHtml(s.unsubscribe)}</a></p>`;
  }
  return { subject, text, html: `${html}</div>` };
}
```

В `src/common/services/mail.service.ts` заменить метод `send` целиком:

```ts
  async send(to: string, subject: string, html: string, text?: string): Promise<MailResult> {
    if (!this.transporter) return { ok: false, error: 'smtp_not_configured' };

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.transporter.sendMail({ from: this.from, to, subject, html, ...(text ? { text } : {}) }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`SMTP timeout: письмо на ${to} не ушло за ${SEND_TIMEOUT_MS} мс`)),
            SEND_TIMEOUT_MS,
          );
        }),
      ]);
      return { ok: true };
    } catch (e: any) {
      const error = String(e?.message || 'smtp error').slice(0, 200);
      this.logger.warn(`письмо на ${to} не ушло: ${error}`);
      return { ok: false, error };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/retention/retention-mail.ts src/common/services/mail.service.ts
git commit -m "feat(retention): локализованные email-шаблоны и текстовая версия" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить зелёный прогон**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-mail.spec.ts src/common/services/mail.service.spec.ts --runInBand"`
Expected: PASS, все 5 mail-тестов и 11 retention-mail tests.

---

### Task 4: Пакетный resolver email, телефона и языка

**Files:**
- Create: `src/retention/retention-recipient-resolver.ts`
- Test: `src/retention/retention-recipient-resolver.spec.ts`

- [ ] **Step 1: Написать красный тест приоритетов и suppression**

```ts
import { RetentionRecipientResolver } from './retention-recipient-resolver';

const UUID = '11111111-1111-4111-8111-111111111111';

function fakePg(rows: {
  profiles?: any[]; accounts?: any[]; identities?: any[]; suppressed?: string[];
}) {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM ai_profiles_consolidated')) return { rows: rows.profiles || [] };
      if (sql.includes('FROM user_identities')) return { rows: rows.identities || [] };
      if (sql.includes('FROM user_id')) return { rows: rows.accounts || [] };
      if (sql.includes('retention_email_unsubscribes')) {
        return { rows: (rows.suppressed || []).map((email_normalized) => ({ email_normalized })) };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
  };
}

describe('RetentionRecipientResolver', () => {
  const language = { resolveUserLanguage: jest.fn(async () => 'en') };

  it('пропускает невалидный profile email и выбирает primary_email', async () => {
    const pg = fakePg({
      profiles: [{ user_id: UUID, email: 'bad' }],
      accounts: [{ user_id: UUID, primary_email: ' Primary@Example.com ' }],
    });
    const result = await new RetentionRecipientResolver(pg as any, language as any).resolve([UUID]);
    expect(result.get(UUID)).toMatchObject({ email: 'primary@example.com', language: 'en', unsubscribed: false });
  });

  it('отписанный profile email пропускается в пользу другого активного адреса', async () => {
    const pg = fakePg({
      profiles: [{ user_id: UUID, email: 'old@example.com' }],
      identities: [{ user_id: UUID, provider: 'email', provider_sub: 'new@example.com', email: 'new@example.com', email_verified: true }],
      suppressed: ['old@example.com'],
    });
    const result = await new RetentionRecipientResolver(pg as any, language as any).resolve([UUID]);
    expect(result.get(UUID)).toMatchObject({ email: 'new@example.com', unsubscribed: false });
  });

  it('если все известные адреса отписаны, SMS не разрешён', async () => {
    const pg = fakePg({
      profiles: [{ user_id: UUID, email: 'old@example.com' }],
      identities: [{ user_id: UUID, provider: 'phone', provider_sub: '+79001112233', email_verified: false }],
      suppressed: ['old@example.com'],
    });
    const result = await new RetentionRecipientResolver(pg as any, language as any).resolve([UUID]);
    expect(result.get(UUID)).toMatchObject({ email: null, phone: '79001112233', unsubscribed: true });
  });

  it('UUID без email получает телефон из phone-identity', async () => {
    const pg = fakePg({
      identities: [{ user_id: UUID, provider: 'phone', provider_sub: '+79001112233', email_verified: false }],
    });
    const result = await new RetentionRecipientResolver(pg as any, language as any).resolve([UUID]);
    expect(result.get(UUID)).toMatchObject({ email: null, phone: '79001112233', unsubscribed: false });
  });

  it('один отписанный адрес блокирует оба аккаунта с этим email', async () => {
    const second = '44444444-4444-4444-8444-444444444444';
    const pg = fakePg({
      profiles: [{ user_id: UUID, email: 'same@example.com' }, { user_id: second, email: 'same@example.com' }],
      suppressed: ['same@example.com'],
    });
    const result = await new RetentionRecipientResolver(pg as any, language as any).resolve([UUID, second]);
    expect(result.get(UUID)?.unsubscribed).toBe(true);
    expect(result.get(second)?.unsubscribed).toBe(true);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест**

```bash
git add src/retention/retention-recipient-resolver.spec.ts
git commit -m "test(retention): источники email и suppression resolver (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить FAIL на ноде**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-recipient-resolver.spec.ts --runInBand"`
Expected: FAIL — resolver отсутствует.

- [ ] **Step 4: Реализовать resolver**

```ts
import { Injectable } from '@nestjs/common';
import { LanguageService } from '../common/services/language.service';
import { PgService } from '../common/services/pg.service';
import { normalizeEmail, normalizePhone } from './retention-recipient';
import type { RetentionContact } from './retention.types';

@Injectable()
export class RetentionRecipientResolver {
  constructor(private readonly pg: PgService, private readonly language: LanguageService) {}

  async resolve(userIds: string[]): Promise<Map<string, RetentionContact>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    const result = new Map<string, RetentionContact>();
    if (!ids.length) return result;

    const [profiles, accounts, identities] = await Promise.all([
      this.pg.query('SELECT user_id, email FROM ai_profiles_consolidated WHERE user_id=ANY($1::text[])', [ids]),
      this.pg.query('SELECT internal_id::text AS user_id, primary_email FROM user_id WHERE internal_id=ANY($1::text[])', [ids]),
      this.pg.query(
        `SELECT user_id, provider, provider_sub, email, email_verified, last_used_at, created_at
           FROM user_identities
          WHERE user_id=ANY($1::text[])
          ORDER BY user_id, email_verified DESC, last_used_at DESC NULLS LAST, created_at DESC`,
        [ids],
      ),
    ]);

    const profileById = new Map(profiles.rows.map((r: any) => [r.user_id, r]));
    const accountById = new Map(accounts.rows.map((r: any) => [r.user_id, r]));
    const identitiesById = new Map<string, any[]>();
    for (const row of identities.rows) {
      const list = identitiesById.get(row.user_id) || [];
      list.push(row);
      identitiesById.set(row.user_id, list);
    }

    const emailsById = new Map<string, string[]>();
    for (const id of ids) {
      const candidates = [
        profileById.get(id)?.email,
        accountById.get(id)?.primary_email,
        ...(identitiesById.get(id) || []).map((r) => r.email),
      ];
      const emails = [...new Set(candidates.map(normalizeEmail).filter((v): v is string => Boolean(v)))];
      emailsById.set(id, emails);
    }
    const allEmails = [...new Set([...emailsById.values()].flat())];
    const suppressed = new Set<string>();
    if (allEmails.length) {
      const rows = await this.pg.query(
        `SELECT email_normalized FROM retention_email_unsubscribes
          WHERE unsubscribed_at IS NOT NULL AND email_normalized=ANY($1::text[])`,
        [allEmails],
      );
      for (const row of rows.rows) suppressed.add(row.email_normalized);
    }

    await Promise.all(ids.map(async (id) => {
      const emails = emailsById.get(id) || [];
      const email = emails.find((value) => !suppressed.has(value)) || null;
      let phone = normalizePhone(id);
      if (!phone) {
        for (const row of identitiesById.get(id) || []) {
          if (row.provider !== 'phone') continue;
          phone = normalizePhone(row.provider_sub);
          if (phone) break;
        }
      }
      result.set(id, {
        userId: id,
        email,
        phone: phone || null,
        language: await this.language.resolveUserLanguage(id),
        unsubscribed: emails.length > 0 && !email,
      });
    }));
    return result;
  }
}
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/retention/retention-recipient-resolver.ts
git commit -m "feat(retention): пакетный выбор email и phone identity" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить зелёный прогон**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-recipient-resolver.spec.ts --runInBand"`
Expected: PASS, 5 tests.

---

### Task 5: SQL-сегменты и preview против реального PostgreSQL

**Files:**
- Create: `src/retention/retention-sql.ts`
- Create: `src/retention/retention.service.ts`
- Test: `src/retention/retention.preview.pg.spec.ts`

- [ ] **Step 1: Написать PG-тест UUID, SMS, Curious и suppression**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { RetentionRecipientResolver } from './retention-recipient-resolver';
import { RetentionUnsubscribeService } from './retention-unsubscribe.service';
import { RetentionService } from './retention.service';

const PG = process.env.PROVISIONING_PG_URL;
const maybe = PG ? describe : describe.skip;
const SCHEMA = `retention_preview_${process.pid}`;
const EMAIL_UUID = '11111111-1111-4111-8111-111111111111';
const SUPPRESSED_UUID = '22222222-2222-4222-8222-222222222222';
const CURIOUS_UUID = '33333333-3333-4333-8333-333333333333';
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 864e5).toISOString();
const TWENTY_FIVE_HOURS_AGO = new Date(Date.now() - 25 * 36e5).toISOString();

maybe('retention preview against PostgreSQL', () => {
  let admin: Pool;
  let pool: Pool;
  let service: RetentionService;

  beforeAll(async () => {
    admin = new Pool({ connectionString: PG, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    pool = new Pool({ connectionString: PG, max: 3, options: `-c search_path=${SCHEMA}` });
    await pool.query(`
      CREATE TABLE custom_chat_history (session_id text, sender_type text, created_at timestamptz);
      CREATE TABLE tg_bot_configs (id bigserial PRIMARY KEY, owner_user_id text, preset_agent_id text);
      CREATE TABLE tg_bot_messages (config_id bigint, role text, created_at timestamptz);
      CREATE TABLE agents (id serial PRIMARY KEY, name text, display_name text);
      CREATE TABLE ai_profiles_consolidated (user_id text PRIMARY KEY, email text, profile_data jsonb DEFAULT '{}', isadmin boolean DEFAULT false);
      CREATE TABLE user_id (internal_id varchar PRIMARY KEY, primary_email text);
      CREATE TABLE user_identities (
        user_id text, provider text, provider_sub text, email text,
        email_verified boolean DEFAULT false, last_used_at timestamptz, created_at timestamptz DEFAULT now()
      );
      CREATE TABLE events (user_id text, name text, props jsonb, ts timestamptz DEFAULT now());
    `);
    await pool.query(fs.readFileSync(path.join(__dirname, 'migrations', '001_retention_email_unsubscribes.sql'), 'utf8'));

    const pg = { query: (sql: string, params?: any[]) => pool.query(sql, params) } as any;
    const language = { resolveUserLanguage: async (id: string) => id === EMAIL_UUID ? 'en' : 'ru' } as any;
    const resolver = new RetentionRecipientResolver(pg, language);
    service = new RetentionService(pg, resolver, new RetentionUnsubscribeService(pg), { send: jest.fn() } as any);

    const chat = (uid: string, at: string) => pool.query(
      `INSERT INTO custom_chat_history VALUES ($1, 'human', $2)`,
      [`${uid}_7`, at],
    );
    await chat(EMAIL_UUID, THREE_DAYS_AGO);
    await chat(SUPPRESSED_UUID, THREE_DAYS_AGO);
    await chat('70001112233', THREE_DAYS_AGO);
    await chat('70000000000', THREE_DAYS_AGO);
    await pool.query(`INSERT INTO custom_chat_history VALUES ('dozvon_7', 'human', $1)`, [THREE_DAYS_AGO]);
    await chat(CURIOUS_UUID, TWENTY_FIVE_HOURS_AGO);

    await pool.query(`INSERT INTO ai_profiles_consolidated (user_id, email) VALUES
      ($1, 'uuid@example.com'), ($2, 'blocked@example.com'), ('70001112233', NULL), ('70000000000', 'test@example.com'), ($3, 'curious@example.com')`,
      [EMAIL_UUID, SUPPRESSED_UUID, CURIOUS_UUID]);
    await pool.query(`INSERT INTO user_identities VALUES
      ($1, 'phone', '+79009998877', NULL, false, NULL, now())`, [SUPPRESSED_UUID]);
    await pool.query(`INSERT INTO retention_email_unsubscribes (email_normalized, token, unsubscribed_at)
      VALUES ('blocked@example.com', $1, now())`, ['x'.repeat(43)]);
    await pool.query(`INSERT INTO events (user_id, name, props) VALUES ($1, 'message_sent', '{}')`, [CURIOUS_UUID]);
    await pool.query(`INSERT INTO agents (name, display_name) VALUES ('roman', 'Роман')`);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin?.end();
  });

  it('общий сегмент выбирает email для UUID, SMS для телефона и исключает служебные/тестовые/отписанные', async () => {
    const preview = await service.buildRetentionOutreach({ minDays: 2, maxDays: 30 });
    const byId = new Map(preview.drafts.map((d) => [d.user_id, d]));
    expect(byId.get(EMAIL_UUID)).toMatchObject({ channel: 'email', email: 'uuid@example.com', language: 'en' });
    expect(byId.get('70001112233')).toMatchObject({ channel: 'sms', phone: '70001112233' });
    expect(byId.has(SUPPRESSED_UUID)).toBe(false);
    expect(byId.has('70000000000')).toBe(false);
    expect(byId.has('dozvon')).toBe(false);
    expect(preview.summary.skipped_unsubscribed).toBe(1);
  });

  it('Curious сохраняет окно 24–48 часов и ограничение меньше пяти сообщений', async () => {
    const preview = await service.buildCuriousReturnOutreach();
    expect(preview.drafts).toHaveLength(1);
    expect(preview.drafts[0]).toMatchObject({ user_id: CURIOUS_UUID, channel: 'email' });
  });
});
```

- [ ] **Step 2: Закоммитить красный PG-тест**

```bash
git add src/retention/retention.preview.pg.spec.ts
git commit -m "test(retention): UUID и suppression в PostgreSQL сегментах (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Запустить PG-тест на одноразовой базе и увидеть FAIL**

```bash
back-ci 'DB=retention_ci_$(date +%s)_$$; createdb -h /var/run/postgresql "$DB"; PROVISIONING_PG_URL="postgres:///$DB?host=/var/run/postgresql" npx jest --runTestsByPath src/retention/retention.preview.pg.spec.ts --runInBand; RC=$?; dropdb -h /var/run/postgresql --if-exists "$DB"; exit $RC'
```

Expected: FAIL — `retention.service` отсутствует; одноразовая база удалена даже после FAIL.

- [ ] **Step 4: Реализовать SQL и preview**

`src/retention/retention-sql.ts`:

```ts
import { RETENTION_UID_SQL_RE } from './retention-recipient';

const UID = `split_part(session_id,'_',1) ~ '${RETENTION_UID_SQL_RE}'`;
const TG_UID = `tc.owner_user_id ~ '${RETENTION_UID_SQL_RE}'`;

export const GENERAL_SEGMENT_SQL = `WITH last_chat AS (
  SELECT split_part(session_id,'_',1) AS uid, split_part(session_id,'_',2) AS assistant_id, max(created_at) AS last_at
    FROM custom_chat_history
   WHERE sender_type='human' AND ${UID}
     AND split_part(session_id,'_',1) <> ALL($1) AND split_part(session_id,'_',1) !~ $2
   GROUP BY 1,2
  UNION ALL
  SELECT tc.owner_user_id AS uid, COALESCE(tc.preset_agent_id,'') AS assistant_id, max(m.created_at) AS last_at
    FROM tg_bot_messages m JOIN tg_bot_configs tc ON tc.id=m.config_id
   WHERE m.role='user' AND ${TG_UID}
     AND tc.owner_user_id <> ALL($1) AND tc.owner_user_id !~ $2
   GROUP BY 1,2
), per_user AS (
  SELECT DISTINCT ON (uid) uid, assistant_id, last_at FROM last_chat ORDER BY uid, last_at DESC
)
SELECT pu.uid AS user_id, pu.assistant_id, pu.last_at,
       COALESCE(a.display_name,a.name) AS assistant_name,
       EXTRACT(DAY FROM now()-pu.last_at)::int AS days_inactive
  FROM per_user pu
  LEFT JOIN agents a ON a.id=CASE WHEN pu.assistant_id ~ '^[0-9]+$' THEN pu.assistant_id::int END
 WHERE pu.last_at < now()-make_interval(days => $3)
   AND pu.last_at > now()-make_interval(days => $4)
 ORDER BY pu.last_at DESC`;

export const CURIOUS_SEGMENT_SQL = `WITH last_chat AS (
  SELECT uid, max(last_at) AS last_at FROM (
    SELECT split_part(session_id,'_',1) AS uid, max(created_at) AS last_at
      FROM custom_chat_history
     WHERE sender_type='human' AND ${UID}
       AND split_part(session_id,'_',1) <> ALL($1) AND split_part(session_id,'_',1) !~ $2
     GROUP BY 1
    UNION ALL
    SELECT tc.owner_user_id AS uid, max(m.created_at) AS last_at
      FROM tg_bot_messages m JOIN tg_bot_configs tc ON tc.id=m.config_id
     WHERE m.role='user' AND ${TG_UID}
       AND tc.owner_user_id <> ALL($1) AND tc.owner_user_id !~ $2
     GROUP BY 1
  ) src GROUP BY 1
), msgcnt AS (
  SELECT user_id, SUM(n) AS n FROM (
    SELECT user_id, COUNT(*) AS n FROM events WHERE name='message_sent' GROUP BY 1
    UNION ALL
    SELECT tc.owner_user_id AS user_id, COUNT(*) AS n
      FROM tg_bot_messages m JOIN tg_bot_configs tc ON tc.id=m.config_id
     WHERE m.role='user' GROUP BY 1
  ) src GROUP BY 1
)
SELECT lc.uid AS user_id, lc.last_at,
       round(EXTRACT(EPOCH FROM now()-lc.last_at)/3600.0)::int AS hours_inactive
  FROM last_chat lc JOIN msgcnt mc ON mc.user_id=lc.uid
 WHERE lc.last_at < now()-interval '24 hours'
   AND lc.last_at > now()-interval '48 hours'
   AND mc.n < 5
   AND lc.uid NOT IN (SELECT user_id FROM ai_profiles_consolidated WHERE isadmin=true)
 ORDER BY lc.last_at DESC`;
```

`src/retention/retention.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../common/services/mail.service';
import { PgService } from '../common/services/pg.service';
import { TEST_USERS, TEST_USER_PATTERN } from '../common/test-users';
import { buildRetentionEmail, buildRetentionSmsMessage, retentionChatUrl } from './retention-mail';
import { selectRetentionChannel } from './retention-recipient';
import { RetentionRecipientResolver } from './retention-recipient-resolver';
import { CURIOUS_SEGMENT_SQL, GENERAL_SEGMENT_SQL } from './retention-sql';
import type { RetentionDraft, RetentionMode, RetentionPreview } from './retention.types';
import { RetentionUnsubscribeService } from './retention-unsubscribe.service';

export const RETENTION_CAMPAIGN = 'retention_reengage_v1';
export const CURIOUS_CAMPAIGN = 'curious_return_v1';
export const RETENTION_COOLDOWN_DAYS = 14;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly pg: PgService,
    private readonly recipients: RetentionRecipientResolver,
    private readonly unsubscribes: RetentionUnsubscribeService,
    private readonly mail: MailService,
  ) {}

  async buildRetentionOutreach(opts?: { minDays?: number; maxDays?: number }): Promise<RetentionPreview> {
    const minDays = opts?.minDays ?? 3;
    const maxDays = opts?.maxDays ?? 30;
    const seg = await this.pg.query(GENERAL_SEGMENT_SQL, [TEST_USERS, TEST_USER_PATTERN, minDays, maxDays]);
    return this.buildPreview(seg.rows, 'general', { min_days: minDays, max_days: maxDays });
  }

  async buildCuriousReturnOutreach(): Promise<RetentionPreview> {
    const seg = await this.pg.query(CURIOUS_SEGMENT_SQL, [TEST_USERS, TEST_USER_PATTERN]);
    return this.buildPreview(seg.rows, 'curious', { min_hours: 24, max_hours: 48 });
  }

  private async buildPreview(rows: any[], mode: RetentionMode, window: RetentionPreview['window']): Promise<RetentionPreview> {
    const campaign = mode === 'general' ? RETENTION_CAMPAIGN : CURIOUS_CAMPAIGN;
    const ids = rows.map((r) => r.user_id);
    const contacts = await this.recipients.resolve(ids);
    const activeIds = ids.filter((id) => !contacts.get(id)?.unsubscribed);
    const lastSent = new Map<string, Date | string>();
    if (activeIds.length) {
      const curious = mode === 'curious';
      const sent = await this.pg.query(
        `SELECT user_id, max(ts) AS last_sent_at FROM events
          WHERE name='retention_outreach' AND user_id=ANY($1::text[])
            AND props->>'status'='sent'
            ${curious ? `AND props->>'campaign'=$2` : ''}
          GROUP BY user_id`,
        curious ? [activeIds, campaign] : [activeIds],
      );
      for (const row of sent.rows) lastSent.set(row.user_id, row.last_sent_at);
    }

    const drafts: RetentionDraft[] = [];
    for (const row of rows) {
      const contact = contacts.get(row.user_id) || {
        userId: row.user_id, email: null, phone: null, language: 'ru', unsubscribed: false,
      };
      if (contact.unsubscribed) continue;
      const channel = selectRetentionChannel(contact);
      const mail = channel === 'email' ? buildRetentionEmail({
        mode, language: contact.language, assistantName: row.assistant_name,
        chatUrl: retentionChatUrl(contact.language), unsubscribeUrl: null,
      }) : null;
      const lastSentAt = lastSent.get(row.user_id) || null;
      const inCooldown = lastSentAt
        ? Date.now() - new Date(lastSentAt).getTime() < RETENTION_COOLDOWN_DAYS * 864e5
        : false;
      drafts.push({
        user_id: row.user_id,
        phone: contact.phone,
        email: contact.email,
        channel,
        language: contact.language,
        subject: mail?.subject || null,
        message: mail?.text || (channel === 'sms' ? buildRetentionSmsMessage(mode, row.assistant_name) : ''),
        assistant_id: row.assistant_id,
        assistant_name: row.assistant_name || null,
        last_at: row.last_at,
        ...(mode === 'general' ? { days_inactive: row.days_inactive } : { hours_inactive: row.hours_inactive }),
        last_sent_at: lastSentAt,
        in_cooldown: inCooldown,
      });
    }

    return {
      channel: 'mixed', campaign, window, cooldown_days: RETENTION_COOLDOWN_DAYS,
      count: drafts.length,
      summary: {
        email: drafts.filter((d) => d.channel === 'email').length,
        sms: drafts.filter((d) => d.channel === 'sms').length,
        no_channel: drafts.filter((d) => d.channel === 'no_channel').length,
        skipped_unsubscribed: rows.length - activeIds.length,
      },
      drafts,
    };
  }
}
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/retention/retention-sql.ts src/retention/retention.service.ts
git commit -m "feat(retention): смешанный preview для телефонных и UUID аккаунтов" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить PG-тест зелёным и удалить базу**

```bash
back-ci 'DB=retention_ci_$(date +%s)_$$; createdb -h /var/run/postgresql "$DB"; PROVISIONING_PG_URL="postgres:///$DB?host=/var/run/postgresql" npx jest --runTestsByPath src/retention/retention.preview.pg.spec.ts --runInBand; RC=$?; dropdb -h /var/run/postgresql --if-exists "$DB"; exit $RC'
```

Expected: PASS, 2 tests; база удалена.

---

### Task 6: Отправка, запрет SMS-fallback и счётчики

**Files:**
- Modify: `src/retention/retention.service.ts`
- Test: `src/retention/retention-send.spec.ts`

- [ ] **Step 1: Написать красные тесты отправки**

```ts
import axios from 'axios';
import { RetentionService } from './retention.service';
import type { RetentionDraft, RetentionPreview } from './retention.types';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));

const draft = (patch: Partial<RetentionDraft> = {}): RetentionDraft => ({
  user_id: 'u1', phone: '79001112233', email: 'u@example.com', channel: 'email',
  language: 'en', subject: 'Subject', message: 'Body', last_at: new Date(),
  last_sent_at: null, in_cooldown: false, ...patch,
});
const preview = (drafts: RetentionDraft[]): RetentionPreview => ({
  channel: 'mixed', campaign: 'retention_reengage_v1', window: { min_days: 3, max_days: 30 },
  cooldown_days: 14, count: drafts.length,
  summary: {
    email: drafts.filter((d) => d.channel === 'email').length,
    sms: drafts.filter((d) => d.channel === 'sms').length,
    no_channel: drafts.filter((d) => d.channel === 'no_channel').length,
    skipped_unsubscribed: 0,
  },
  drafts,
});

function harness(drafts: RetentionDraft[]) {
  const svc = Object.create(RetentionService.prototype) as any;
  svc.buildRetentionOutreach = jest.fn().mockResolvedValue(preview(drafts));
  svc.buildCuriousReturnOutreach = jest.fn().mockResolvedValue({
    ...preview(drafts), campaign: 'curious_return_v1', window: { min_hours: 24, max_hours: 48 },
  });
  svc.pg = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  svc.mail = { send: jest.fn().mockResolvedValue({ ok: true }) };
  svc.unsubscribes = {
    ensureToken: jest.fn().mockResolvedValue('t'.repeat(43)),
    isUnsubscribed: jest.fn().mockResolvedValue(false),
  };
  svc.logger = { warn: jest.fn() };
  return svc;
}

describe('RetentionService send', () => {
  beforeEach(() => {
    process.env.SMSAERO_LOGIN = 'login';
    process.env.SMSAERO_API_KEY = 'key';
    (axios.get as jest.Mock).mockReset().mockResolvedValue({ status: 200, data: {} });
  });

  afterEach(() => {
    delete process.env.SMSAERO_LOGIN;
    delete process.env.SMSAERO_API_KEY;
  });

  it('email успешен — SMS не вызывается, plain text присутствует', async () => {
    const svc = harness([draft()]);
    const out = await svc.sendRetentionOutreach({ confirm: true });
    expect(out).toMatchObject({ sent: 1, sent_email: 1, sent_sms: 0 });
    expect(axios.get).not.toHaveBeenCalled();
    expect(svc.mail.send.mock.calls[0][3]).toContain('https://my.linkeon.io/chat?lang=en');
    const props = JSON.parse(svc.pg.query.mock.calls[0][1][1]);
    expect(props).toMatchObject({ status: 'sent', channel: 'email' });
    expect(props).not.toHaveProperty('body');
  });

  it('email ошибся — SMS не вызывается, событие содержит только безопасный код', async () => {
    const svc = harness([draft()]);
    svc.mail.send.mockResolvedValue({ ok: false, error: 'SMTP timeout: письмо на u@example.com' });
    const out = await svc.sendRetentionOutreach({ confirm: true });
    expect(out).toMatchObject({ sent: 0, failed: 1 });
    expect(out.results[0].error).toBe('smtp_timeout');
    expect(axios.get).not.toHaveBeenCalled();
    expect(svc.pg.query.mock.calls[0][1][1]).not.toContain('u@example.com');
  });

  it('без email отправляется SMS; no_channel не вызывает транспорт', async () => {
    const svc = harness([
      draft({ user_id: 'sms', email: null, channel: 'sms' }),
      draft({ user_id: 'none', email: null, phone: null, channel: 'no_channel' }),
    ]);
    const out = await svc.sendRetentionOutreach({ confirm: true });
    expect(out).toMatchObject({ sent_sms: 1, no_channel: 1 });
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(svc.mail.send).not.toHaveBeenCalled();
  });

  it('отписка между preview и send блокирует письмо даже с resend', async () => {
    const svc = harness([draft({ in_cooldown: true })]);
    svc.unsubscribes.isUnsubscribed.mockResolvedValue(true);
    const out = await svc.sendRetentionOutreach({ confirm: true, resend: true });
    expect(out.skipped_unsubscribed).toBe(1);
    expect(svc.mail.send).not.toHaveBeenCalled();
  });

  it('legacy phones[] выбирает телефонный аккаунт даже при канале email', async () => {
    const svc = harness([draft(), draft({ user_id: 'other', phone: '79009998877', email: 'other@example.com' })]);
    const out = await svc.sendRetentionOutreach({ confirm: true, phones: ['79001112233'] });
    expect(out.sent_email).toBe(1);
    expect(svc.mail.send).toHaveBeenCalledTimes(1);
    expect(svc.mail.send.mock.calls[0][0]).toBe('u@example.com');
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('skipped_cooldown считается только внутри userIds-фильтра', async () => {
    const svc = harness([
      draft({ user_id: 'a', in_cooldown: true }),
      draft({ user_id: 'b', email: 'b@example.com' }),
    ]);
    const out = await svc.sendRetentionOutreach({ confirm: true, userIds: ['b'] });
    expect(out).toMatchObject({ sent: 1, skipped_cooldown: 0 });
  });

  it('resend обходит cooldown, но не no_channel', async () => {
    const svc = harness([draft({ in_cooldown: true })]);
    const out = await svc.sendRetentionOutreach({ confirm: true, resend: true });
    expect(out.sent).toBe(1);
  });

  it('ошибка event insert не маскирует доставку и помечает log_error', async () => {
    const svc = harness([draft()]);
    svc.pg.query.mockRejectedValue(new Error('events unavailable'));
    const out = await svc.sendRetentionOutreach({ confirm: true });
    expect(out.results[0]).toMatchObject({ status: 'sent', log_error: true });
  });

  it('confirm и неоднозначные фильтры проверяются до транспорта', async () => {
    const svc = harness([draft()]);
    expect((await svc.sendRetentionOutreach({})).error).toBe('confirm_required');
    expect((await svc.sendRetentionOutreach({ confirm: true, userIds: ['u1'], phones: ['79001112233'] })).error)
      .toBe('ambiguous_recipient_filter');
    expect(svc.mail.send).not.toHaveBeenCalled();
  });

  it('Curious пишет свой campaign', async () => {
    const svc = harness([draft()]);
    await svc.sendCuriousReturnOutreach({ confirm: true });
    const props = JSON.parse(svc.pg.query.mock.calls[0][1][1]);
    expect(props.campaign).toBe('curious_return_v1');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест**

```bash
git add src/retention/retention-send.spec.ts
git commit -m "test(retention): канал отправки, cooldown и безопасные ошибки (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить FAIL на ноде**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-send.spec.ts --runInBand"`
Expected: FAIL — `sendRetentionOutreach` отсутствует.

- [ ] **Step 4: Добавить отправку в RetentionService**

Добавить в начало `src/retention/retention.service.ts`:

```ts
import axios from 'axios';
import type {
  RetentionDraft,
  RetentionMode,
  RetentionPreview,
  RetentionResultRow,
  RetentionSendRequest,
  RetentionSendResponse,
} from './retention.types';
```

Удалить прежний однострочный type-import из `retention.types`. Добавить следующие методы внутрь `RetentionService` после `buildPreview`:

```ts
  async sendRetentionOutreach(data: RetentionSendRequest): Promise<RetentionSendResponse> {
    return this.send('general', data);
  }

  async sendCuriousReturnOutreach(data: RetentionSendRequest): Promise<RetentionSendResponse> {
    return this.send('curious', data);
  }

  private async send(mode: RetentionMode, data: RetentionSendRequest): Promise<RetentionSendResponse> {
    if (!data?.confirm) {
      return { error: 'confirm_required', message: 'Отправка реальным пользователям требует confirm:true (подтверждение владельца).' };
    }
    const hasUsers = Array.isArray(data.userIds) && data.userIds.length > 0;
    const hasPhones = Array.isArray(data.phones) && data.phones.length > 0;
    if (hasUsers && hasPhones) {
      return { error: 'ambiguous_recipient_filter', message: 'Передайте либо userIds[], либо phones[], но не оба фильтра.' };
    }
    const preview = mode === 'general'
      ? await this.buildRetentionOutreach({ minDays: data.minDays, maxDays: data.maxDays })
      : await this.buildCuriousReturnOutreach();
    let selected = preview.drafts;
    if (hasUsers) {
      const set = new Set(data.userIds);
      selected = selected.filter((d) => set.has(d.user_id));
    } else if (hasPhones) {
      const set = new Set(data.phones);
      selected = selected.filter((d) => set.has(d.user_id) || (d.phone ? set.has(d.phone) : false));
    }

    const skippedCooldown = data.resend ? 0 : selected.filter((d) => d.in_cooldown).length;
    const noChannel = selected.filter((d) => d.channel === 'no_channel').length;
    const targets = selected.filter((d) => d.channel !== 'no_channel' && (data.resend || !d.in_cooldown));
    const results: RetentionResultRow[] = [];
    let skippedUnsubscribed = hasUsers || hasPhones ? 0 : preview.summary.skipped_unsubscribed;

    for (const d of targets) {
      const channel = d.channel as 'email' | 'sms';
      let status: 'sent' | 'failed' = 'failed';
      let error: string | null = null;
      let skipped = false;

      if (channel === 'email') {
        try {
          if (await this.unsubscribes.isUnsubscribed(d.email!)) {
            skipped = true;
            skippedUnsubscribed += 1;
          } else {
            const token = await this.unsubscribes.ensureToken(d.email!);
            const base = (process.env.BACKEND_URL || 'https://my.linkeon.io').replace(/\/$/, '');
            const unsubscribeUrl = `${base}/webhook/retention/unsubscribe?token=${encodeURIComponent(token)}&lang=${d.language}`;
            const content = buildRetentionEmail({
              mode, language: d.language, assistantName: d.assistant_name,
              chatUrl: retentionChatUrl(d.language), unsubscribeUrl,
            });
            const sent = await this.mail.send(d.email!, content.subject, content.html, content.text);
            status = sent.ok ? 'sent' : 'failed';
            error = sent.ok ? null : this.safeMailError(sent.error);
          }
        } catch {
          status = 'failed';
          error = 'delivery_preparation_failed';
        }
      } else {
        const sent = await this.sendOutreachSms(d.phone!, buildRetentionSmsMessage(mode, d.assistant_name));
        status = sent.ok ? 'sent' : 'failed';
        error = sent.ok ? null : sent.error || 'sms_error';
      }
      if (skipped) continue;

      const props = {
        status, channel, campaign: preview.campaign, error,
        assistant_id: d.assistant_id, days_inactive: d.days_inactive,
        hours_inactive: d.hours_inactive,
      };
      let logError = false;
      try {
        await this.pg.query(
          `INSERT INTO events (user_id, name, props) VALUES ($1, 'retention_outreach', $2::jsonb)`,
          [d.user_id, JSON.stringify(props)],
        );
      } catch (e: any) {
        logError = true;
        this.logger.warn(`retention log insert failed for ${d.user_id}: ${String(e?.message || e).slice(0, 120)}`);
      }
      results.push({
        user_id: d.user_id, phone: d.phone, email: d.email, channel,
        status, error, ...(logError ? { log_error: true } : {}),
      });
    }

    return {
      campaign: preview.campaign,
      sent: results.filter((r) => r.status === 'sent').length,
      sent_email: results.filter((r) => r.status === 'sent' && r.channel === 'email').length,
      sent_sms: results.filter((r) => r.status === 'sent' && r.channel === 'sms').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped_cooldown: skippedCooldown,
      skipped_unsubscribed: skippedUnsubscribed,
      no_channel: noChannel,
      results,
    };
  }

  private safeMailError(raw?: string): string {
    if (raw === 'smtp_not_configured') return raw;
    return /timeout/i.test(String(raw || '')) ? 'smtp_timeout' : 'smtp_error';
  }

  private async sendOutreachSms(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const login = process.env.SMSAERO_LOGIN;
    const apiKey = process.env.SMSAERO_API_KEY;
    if (!login || !apiKey) return { ok: false, error: 'SMS Aero credentials not set' };
    try {
      const auth = Buffer.from(`${login}:${apiKey}`).toString('base64');
      const resp = await axios.get('https://gate.smsaero.ru/v2/sms/send', {
        params: { number: phone, text, sign: 'SMSAero' },
        headers: { Authorization: `Basic ${auth}` },
        timeout: 10000,
        validateStatus: () => true,
      });
      if (resp.status >= 400) return { ok: false, error: `SMS Aero ${resp.status}` };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: 'sms_network_error' };
    }
  }
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/retention/retention.service.ts
git commit -m "feat(retention): email без SMS fallback и раздельные итоги" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить зелёный прогон**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-send.spec.ts --runInBand"`
Expected: PASS, 10 tests.

---

### Task 7: Публичная страница отписки без side effect на GET

**Files:**
- Create: `src/retention/retention-unsubscribe-page.ts`
- Create: `src/retention/retention-unsubscribe.controller.ts`
- Test: `src/retention/retention-unsubscribe.controller.spec.ts`

- [ ] **Step 1: Написать красный controller-тест**

```ts
import { RetentionUnsubscribeController } from './retention-unsubscribe.controller';

function fakeRes() {
  const r: any = { statusCode: 200, headers: {}, body: '' };
  r.status = (code: number) => { r.statusCode = code; return r; };
  r.set = (name: string, value: string) => { r.headers[name] = value; return r; };
  r.type = () => r;
  r.send = (body: string) => { r.body = body; return r; };
  return r;
}

describe('RetentionUnsubscribeController', () => {
  const svc = { findByToken: jest.fn(), unsubscribe: jest.fn() };
  let ctrl: RetentionUnsubscribeController;
  const token = 'x'.repeat(43);

  beforeEach(() => {
    svc.findByToken.mockReset();
    svc.unsubscribe.mockReset();
    ctrl = new RetentionUnsubscribeController(svc as any);
  });

  it('GET показывает форму и не меняет состояние', async () => {
    svc.findByToken.mockResolvedValue({ email: 'person@example.com', unsubscribedAt: null });
    const res = fakeRes();
    await ctrl.get(token, 'en', res);
    expect(svc.unsubscribe).not.toHaveBeenCalled();
    expect(res.body).toContain('method="post"');
    expect(res.body).toContain('p***n@example.com');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Robots-Tag']).toBe('noindex');
    expect(res.headers['Content-Security-Policy']).toContain("form-action 'self'");
  });

  it('POST выполняет идемпотентную отписку', async () => {
    svc.unsubscribe.mockResolvedValue({ email: 'person@example.com', unsubscribedAt: new Date() });
    const res = fakeRes();
    await ctrl.post({ token, lang: 'en' }, res);
    expect(svc.unsubscribe).toHaveBeenCalledWith(token);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Unsubscribed');
  });

  it('неверный токен не раскрывает email', async () => {
    svc.findByToken.mockResolvedValue(null);
    const res = fakeRes();
    await ctrl.get('bad', 'ru', res);
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('example.com');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест**

```bash
git add src/retention/retention-unsubscribe.controller.spec.ts
git commit -m "test(retention): безопасная публичная отписка (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить FAIL на ноде**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-unsubscribe.controller.spec.ts --runInBand"`
Expected: FAIL — контроллер отсутствует.

- [ ] **Step 4: Реализовать страницу и контроллер**

`src/retention/retention-unsubscribe-page.ts`:

```ts
import { LanguageService } from '../common/services/language.service';
import { escapeRetentionHtml } from './retention-mail';

const TEXT: Record<string, { title: string; intro: string; confirm: string; done: string; already: string; invalid: string }> = {
  ru: { title: 'Отписка от рассылки возврата', intro: 'Подтвердите отписку адреса', confirm: 'Отписаться', done: 'Вы отписаны', already: 'Этот адрес уже отписан', invalid: 'Ссылка недействительна или устарела.' },
  en: { title: 'Unsubscribe from re-engagement emails', intro: 'Confirm unsubscribing', confirm: 'Unsubscribe', done: 'Unsubscribed', already: 'This address is already unsubscribed', invalid: 'This link is invalid or has expired.' },
  es: { title: 'Cancelar los correos de reactivación', intro: 'Confirma la cancelación de', confirm: 'Cancelar suscripción', done: 'Suscripción cancelada', already: 'Esta dirección ya está dada de baja', invalid: 'El enlace no es válido o ha caducado.' },
  de: { title: 'Rückgewinnungs-E-Mails abbestellen', intro: 'Bestätigen Sie die Abmeldung von', confirm: 'Abbestellen', done: 'Abmeldung bestätigt', already: 'Diese Adresse ist bereits abgemeldet', invalid: 'Dieser Link ist ungültig oder abgelaufen.' },
  fr: { title: 'Désabonnement des e-mails de réactivation', intro: 'Confirmez le désabonnement de', confirm: 'Se désabonner', done: 'Vous êtes désabonné', already: 'Cette adresse est déjà désabonnée', invalid: 'Ce lien est invalide ou a expiré.' },
  zh: { title: '退订回访邮件', intro: '确认退订地址', confirm: '确认退订', done: '已退订', already: '此地址已退订', invalid: '链接无效或已过期。' },
  pt: { title: 'Cancelar os e-mails de reativação', intro: 'Confirme o cancelamento de', confirm: 'Cancelar subscrição', done: 'Subscrição cancelada', already: 'Este endereço já está removido', invalid: 'A ligação é inválida ou expirou.' },
};

export function retentionUnsubscribePage(input: {
  language: string; status: 'confirm' | 'done' | 'already' | 'invalid';
  email?: string; token?: string;
}): string {
  const language = LanguageService.normalize(input.language);
  const s = TEXT[language] || TEXT.ru;
  const heading = input.status === 'done' ? s.done : input.status === 'already' ? s.already : s.title;
  const body = input.status === 'invalid' ? `<p>${escapeRetentionHtml(s.invalid)}</p>` :
    input.status === 'confirm'
      ? `<p>${escapeRetentionHtml(s.intro)} <strong>${escapeRetentionHtml(input.email || '')}</strong></p><form method="post" action="/webhook/retention/unsubscribe"><input type="hidden" name="token" value="${escapeRetentionHtml(input.token || '')}"><input type="hidden" name="lang" value="${language}"><button style="padding:12px 18px" type="submit">${escapeRetentionHtml(s.confirm)}</button></form>`
      : `<p>${escapeRetentionHtml(input.email || '')}</p>`;
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>${escapeRetentionHtml(heading)}</title></head><body style="font-family:system-ui;padding:40px;text-align:center"><main style="max-width:480px;margin:auto"><h1 style="font-size:22px">${escapeRetentionHtml(heading)}</h1>${body}</main></body></html>`;
}
```

`src/retention/retention-unsubscribe.controller.ts`:

```ts
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { LanguageService } from '../common/services/language.service';
import { maskRetentionEmail, RetentionUnsubscribeService } from './retention-unsubscribe.service';
import { retentionUnsubscribePage } from './retention-unsubscribe-page';

const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

@Controller('retention')
export class RetentionUnsubscribeController {
  constructor(private readonly unsubscribes: RetentionUnsubscribeService) {}

  @Get('unsubscribe')
  async get(@Query('token') token: string, @Query('lang') lang: string, @Res() res: Response) {
    const language = LanguageService.normalize(lang);
    const record = await this.unsubscribes.findByToken(token);
    if (!record) return this.page(res, 400, retentionUnsubscribePage({ language, status: 'invalid' }));
    return this.page(res, 200, retentionUnsubscribePage({
      language,
      status: record.unsubscribedAt ? 'already' : 'confirm',
      email: maskRetentionEmail(record.email), token,
    }));
  }

  @Post('unsubscribe')
  async post(@Body() body: { token?: string; lang?: string }, @Res() res: Response) {
    const language = LanguageService.normalize(body?.lang);
    const record = await this.unsubscribes.unsubscribe(String(body?.token || ''));
    if (!record) return this.page(res, 400, retentionUnsubscribePage({ language, status: 'invalid' }));
    return this.page(res, 200, retentionUnsubscribePage({
      language, status: 'done', email: maskRetentionEmail(record.email),
    }));
  }

  private page(res: Response, status: number, html: string) {
    return res.status(status)
      .set('Cache-Control', 'no-store')
      .set('X-Robots-Tag', 'noindex')
      .set('Referrer-Policy', 'no-referrer')
      .set('Content-Security-Policy', CSP)
      .type('html').send(html);
  }
}
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/retention/retention-unsubscribe-page.ts src/retention/retention-unsubscribe.controller.ts
git commit -m "feat(retention): публичная отписка с подтверждением POST" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить зелёный прогон**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention-unsubscribe.controller.spec.ts --runInBand"`
Expected: PASS, 3 tests.

---

### Task 8: Nest-проводка и делегирование старого admin API

**Files:**
- Create: `src/retention/retention.module.ts`
- Modify: `src/admin/admin.module.ts:1-21`
- Modify: `src/admin/admin.controller.ts:18-23,372-398`
- Modify: `src/admin/admin.service.ts:471-473,504-729`
- Modify test: `src/admin/admin.tg-activity.spec.ts:244-268`
- Modify test: `src/admin/admin.calls-controller.spec.ts:58,71,81`
- Test: `src/retention/retention.module.spec.ts`
- Test: `src/admin/admin.retention-controller.spec.ts`

- [ ] **Step 1: Написать красные тесты маршрутов и регистрации**

`src/retention/retention.module.spec.ts`:

```ts
import 'reflect-metadata';
import { AdminModule } from '../admin/admin.module';
import { RetentionModule } from './retention.module';
import { RetentionUnsubscribeController } from './retention-unsubscribe.controller';
import { RetentionService } from './retention.service';

describe('RetentionModule wiring', () => {
  it('регистрирует публичный контроллер и экспортирует сервис', () => {
    expect(Reflect.getMetadata('controllers', RetentionModule)).toContain(RetentionUnsubscribeController);
    expect(Reflect.getMetadata('exports', RetentionModule)).toContain(RetentionService);
  });

  it('AdminModule импортирует RetentionModule', () => {
    expect(Reflect.getMetadata('imports', AdminModule)).toContain(RetentionModule);
  });
});
```

`src/admin/admin.retention-controller.spec.ts`:

```ts
import { AdminController } from './admin.controller';

function fakeRes() {
  const r: any = { statusCode: 0, body: undefined };
  r.status = (code: number) => { r.statusCode = code; return r; };
  r.json = (body: any) => { r.body = body; return r; };
  return r;
}

describe('AdminController retention delegation', () => {
  const retention = {
    buildRetentionOutreach: jest.fn().mockResolvedValue({ count: 0 }),
    sendRetentionOutreach: jest.fn().mockResolvedValue({ sent: 0 }),
    buildCuriousReturnOutreach: jest.fn().mockResolvedValue({ count: 0 }),
    sendCuriousReturnOutreach: jest.fn().mockResolvedValue({ sent: 0 }),
  };
  let ctrl: AdminController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new AdminController({} as any, {} as any, retention as any);
  });

  it.each([
    ['preview', 'buildRetentionOutreach'],
    ['send', 'sendRetentionOutreach'],
    ['curious_preview', 'buildCuriousReturnOutreach'],
    ['curious_send', 'sendCuriousReturnOutreach'],
  ])('%s делегирует в RetentionService', async (action, method) => {
    const res = fakeRes();
    await ctrl.retentionAction({ action, minDays: 2 }, res);
    expect((retention as any)[method]).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('ошибку сервиса возвращает как HTTP 400', async () => {
    retention.sendRetentionOutreach.mockResolvedValueOnce({ error: 'confirm_required' });
    const res = fakeRes();
    await ctrl.retentionAction({ action: 'send' }, res);
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Закоммитить красные тесты**

```bash
git add src/retention/retention.module.spec.ts src/admin/admin.retention-controller.spec.ts
git commit -m "test(retention): модуль и делегирование admin API (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить FAIL на ноде**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention.module.spec.ts src/admin/admin.retention-controller.spec.ts --runInBand"`
Expected: FAIL — модуль отсутствует, конструктор не делегирует.

- [ ] **Step 4: Подключить модуль и заменить вызовы**

`src/retention/retention.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RetentionRecipientResolver } from './retention-recipient-resolver';
import { RetentionService } from './retention.service';
import { RetentionUnsubscribeController } from './retention-unsubscribe.controller';
import { RetentionUnsubscribeService } from './retention-unsubscribe.service';

@Module({
  imports: [CommonModule],
  controllers: [RetentionUnsubscribeController],
  providers: [RetentionService, RetentionRecipientResolver, RetentionUnsubscribeService],
  exports: [RetentionService],
})
export class RetentionModule {}
```

В `src/admin/admin.module.ts` добавить `import { RetentionModule } from '../retention/retention.module';` и изменить imports:

```ts
  imports: [CommonModule, SchedulerModule, ReferralModule, RetentionModule],
```

В `src/admin/admin.controller.ts` добавить `import { RetentionService } from '../retention/retention.service';`, изменить конструктор и retention-маршрут:

```ts
  constructor(
    private readonly adminService: AdminService,
    private readonly referralService: ReferralService,
    private readonly retentionService: RetentionService,
    @Optional() private readonly compaction?: ProfileCompactionService,
  ) {}
```

В `src/admin/admin.calls-controller.spec.ts` заменить все три существующих конструктора, чтобы обязательный третий аргумент был передан явно:

```ts
const ctrl = new AdminController(svc as any, {} as any, {} as any);
```

```ts
  // preview только строит черновики; send — реальная email/SMS-рассылка с confirm:true.
  @Post('admin/retention')
  async retentionAction(@Body() body: any, @Res() res: Response) {
    const { action, ...data } = body;
    switch (action) {
      case 'preview': {
        const out = await this.retentionService.buildRetentionOutreach(data);
        return res.status(200).json(out);
      }
      case 'send': {
        const out = await this.retentionService.sendRetentionOutreach(data);
        return res.status((out as any).error ? 400 : 200).json(out);
      }
      case 'curious_preview': {
        const out = await this.retentionService.buildCuriousReturnOutreach();
        return res.status(200).json(out);
      }
      case 'curious_send': {
        const out = await this.retentionService.sendCuriousReturnOutreach(data);
        return res.status((out as any).error ? 400 : 200).json(out);
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  }
```

В `src/admin/admin.service.ts` удалить три константы `RETENTION_CAMPAIGN`, `CURIOUS_CAMPAIGN`, `RETENTION_COOLDOWN_DAYS` и целиком методы от `buildRetentionMessage` через `sendCuriousReturnOutreach` включительно. Оставить `buildActivationMessage`, activation/advocate и старый `sendOutreachSms`: они обслуживают другие кампании.

В `src/admin/admin.tg-activity.spec.ts` заменить последний describe на проверку только activation; SQL retention теперь проверяется `retention.preview.pg.spec.ts`:

```ts
describe('AdminService — активационный сегмент не трогает активных в боте', () => {
  it('активационный сегмент исключает тех, кто пишет в бота', async () => {
    const pg = fakePg();
    await serviceWith(pg).buildActivationOutreach();

    const sql = pg.calls[0].sql;
    expect(sql).toContain('custom_chat_history');
    expect(sql).toContain('tg_bot_messages');
    expect(sql).toContain('owner_user_id');
  });
});
```

- [ ] **Step 5: Закоммитить проводку и удаление legacy-кода**

```bash
git add src/retention/retention.module.ts src/admin/admin.module.ts src/admin/admin.controller.ts src/admin/admin.service.ts src/admin/admin.tg-activity.spec.ts src/admin/admin.calls-controller.spec.ts
git commit -m "refactor(retention): выделить модуль из AdminService" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить новые и соседние тесты**

Run: `back-ci "npx jest --runTestsByPath src/retention/retention.module.spec.ts src/admin/admin.retention-controller.spec.ts src/admin/admin.tg-activity.spec.ts src/admin/admin.calls-controller.spec.ts --runInBand"`
Expected: PASS, включая старые activation и calls controller tests.

---

### Task 9: Смешанные каналы в AdminRetentionView

**Files:**
- Modify: `src/components/admin/AdminRetentionView.tsx`
- Test: `src/components/admin/AdminRetentionView.test.tsx`

- [ ] **Step 1: Написать красный frontend-тест**

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byButton, clickAsync, flush, mount, visibleText, type Mounted } from '../../test/dom';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { post } }));

import AdminRetentionView from './AdminRetentionView';

const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const drafts = [
  {
    user_id: 'u-email', phone: '79001112233', email: 'person@example.com', channel: 'email',
    language: 'en', subject: 'Your Linkeon assistant', message: 'Hello', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: null, in_cooldown: false,
  },
  {
    user_id: 'u-sms', phone: '79001112244', email: null, channel: 'sms',
    language: 'ru', subject: null, message: 'SMS text', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: null, in_cooldown: false,
  },
  {
    user_id: 'u-none', phone: null, email: null, channel: 'no_channel',
    language: 'ru', subject: null, message: '', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: null, in_cooldown: false,
  },
  {
    user_id: 'u-paused', phone: null, email: 'paused@example.com', channel: 'email',
    language: 'ru', subject: 'Пауза', message: 'Paused', last_at: '2026-11-05',
    days_inactive: 3, last_sent_at: '2026-11-07', in_cooldown: true,
  },
];
const preview = {
  channel: 'mixed', campaign: 'retention_reengage_v1', window: { min_days: 2, max_days: 30 },
  cooldown_days: 14, count: 4,
  summary: { email: 2, sms: 1, no_channel: 1, skipped_unsubscribed: 1 }, drafts,
};
const sendResult = {
  campaign: 'retention_reengage_v1', sent: 2, sent_email: 1, sent_sms: 1,
  failed: 0, skipped_cooldown: 1, skipped_unsubscribed: 0, no_channel: 1,
  results: [],
};

let m: Mounted | undefined;
const settle = async () => { for (let i = 0; i < 5; i += 1) await flush(); };

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(async (_url: string, body: any) => {
    if (body.action === 'preview' || body.action === 'curious_preview') return res(preview);
    if (body.action === 'send' || body.action === 'curious_send') return res(sendResult);
    throw new Error(`unexpected action ${body.action}`);
  });
});

afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.restoreAllMocks();
});

describe('AdminRetentionView mixed channels', () => {
  it('показывает email, SMS, язык, тему и запрещает no_channel', async () => {
    m = mount(<AdminRetentionView />);
    await settle();
    const text = visibleText(m.container);
    expect(text).toContain('person@example.com');
    expect(text).toContain('Your Linkeon assistant');
    expect(text).toContain('79001112244');
    expect(text).toContain('нет канала');
    expect((m.container.querySelector('[data-testid="retention-send-u-none"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('bulk confirmation исключает cooldown/no_channel и показывает каналы отдельно', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(byButton(m.container, /Отправить всем/)!);
    expect(confirm.mock.calls[0][0]).toContain('1 email');
    expect(confirm.mock.calls[0][0]).toContain('1 SMS');
    expect(post.mock.calls.filter(([, body]) => body.action === 'send')).toHaveLength(0);
  });

  it('одиночная отправка использует userIds и не передаёт phones', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(m.container.querySelector('[data-testid="retention-send-u-email"]')!);
    await settle();
    const call = post.mock.calls.find(([, body]) => body.action === 'send');
    expect(call?.[1]).toEqual({
      action: 'send', confirm: true, userIds: ['u-email'], resend: false, minDays: 2, maxDays: 30,
    });
    expect(call?.[1]).not.toHaveProperty('phones');
  });

  it('результат содержит счётчики каналов и ошибку учёта', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    post.mockImplementation(async (_url: string, body: any) => {
      if (body.action === 'preview') return res(preview);
      if (body.action === 'send') return res({
        ...sendResult,
        results: [{ user_id: 'u-email', phone: null, email: 'person@example.com', channel: 'email', status: 'sent', error: null, log_error: true }],
      });
      throw new Error(`unexpected action ${body.action}`);
    });
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(byButton(m.container, /Отправить всем/)!);
    await settle();
    const text = visibleText(m.container);
    expect(text).toContain('Email: 1');
    expect(text).toContain('SMS: 1');
    expect(text).toContain('без записи cooldown: 1');
  });

  it('Curious продолжает использовать curious_preview и curious_send', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    m = mount(<AdminRetentionView />);
    await settle();
    await clickAsync(byButton(m.container, /^Новые 24–48 ч$/)!);
    await settle();
    expect(post.mock.calls.some(([, body]) => body.action === 'curious_preview')).toBe(true);
    await clickAsync(byButton(m.container, /Отправить всем/)!);
    await settle();
    expect(post.mock.calls.some(([, body]) => body.action === 'curious_send')).toBe(true);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест**

```bash
git add src/components/admin/AdminRetentionView.test.tsx
git commit -m "test(admin): смешанные retention-каналы в кабинете (красный)" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 3: Проверить FAIL на ноде**

Run: `front-ci "pnpm exec vitest run src/components/admin/AdminRetentionView.test.tsx"`
Expected: FAIL — отсутствуют `user_id`, каналы, summary и testids.

- [ ] **Step 4: Обновить компонент**

Заменить `src/components/admin/AdminRetentionView.tsx` целиком:

```tsx
import React, { useState, useEffect } from 'react';
import { Send, Loader, RefreshCw, Clock, Mail, MessageSquare } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

type RetentionChannel = 'email' | 'sms' | 'no_channel';
interface RetentionDraft {
  user_id: string;
  phone: string | null;
  email: string | null;
  channel: RetentionChannel;
  language: string;
  subject: string | null;
  assistant_id?: string;
  assistant_name?: string | null;
  last_at: string;
  days_inactive?: number;
  hours_inactive?: number;
  message: string;
  last_sent_at: string | null;
  in_cooldown: boolean;
}
interface RetentionPreview {
  channel: 'mixed';
  campaign: string;
  window: { min_days?: number; max_days?: number; min_hours?: number; max_hours?: number };
  cooldown_days: number;
  count: number;
  summary: { email: number; sms: number; no_channel: number; skipped_unsubscribed: number };
  drafts: RetentionDraft[];
}
interface RetentionResultRow { log_error?: boolean }
type Mode = 'general' | 'curious';

const AdminRetentionView: React.FC = () => {
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState({ minDays: 2, maxDays: 30 });
  const [mode, setMode] = useState<Mode>('general');

  const load = async (preserveResult = false) => {
    setLoading(true);
    if (!preserveResult) setResult(null);
    setError(null);
    try {
      const body = mode === 'curious'
        ? { action: 'curious_preview' }
        : { action: 'preview', minDays: win.minDays, maxDays: win.maxDays };
      const r = await apiClient.post('/webhook/admin/retention', body);
      if (!r.ok) throw new Error(`Ошибка: ${r.status}`);
      setPreview(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось построить сегмент');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [win, mode]);

  const send = async (userIds?: string[], resend = false) => {
    const all = preview?.drafts || [];
    const selected = userIds ? all.filter((d) => userIds.includes(d.user_id)) : all;
    const targets = selected.filter((d) => d.channel !== 'no_channel' && (resend || !d.in_cooldown));
    const emails = targets.filter((d) => d.channel === 'email').length;
    const sms = targets.filter((d) => d.channel === 'sms').length;
    if (!targets.length || !window.confirm(`Реальная отправка людям: ${emails} email и ${sms} SMS. Продолжить?`)) return;

    setSending(userIds?.length === 1 ? userIds[0] : 'all');
    setResult(null);
    setError(null);
    try {
      const body = mode === 'curious'
        ? { action: 'curious_send', confirm: true, ...(userIds ? { userIds } : {}), resend }
        : { action: 'send', confirm: true, ...(userIds ? { userIds } : {}), resend, minDays: win.minDays, maxDays: win.maxDays };
      const r = await apiClient.post('/webhook/admin/retention', body);
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `Ошибка: ${r.status}`);
      const logErrors = (data.results || []).filter((row: RetentionResultRow) => row.log_error).length;
      setResult(
        `Отправлено: ${data.sent} · Email: ${data.sent_email} · SMS: ${data.sent_sms} · ошибок: ${data.failed} · ` +
        `пауза: ${data.skipped_cooldown} · отписка: ${data.skipped_unsubscribed} · нет канала: ${data.no_channel}` +
        (logErrors ? ` · без записи cooldown: ${logErrors} — не повторять` : ''),
      );
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setSending(null);
    }
  };

  const sendable = preview?.drafts.filter((d) => d.channel !== 'no_channel' && !d.in_cooldown) || [];
  const bulkEmails = sendable.filter((d) => d.channel === 'email').length;
  const bulkSms = sendable.filter((d) => d.channel === 'sms').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-forest-600" />Удержание · рассылка
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">email при известном адресе · SMS без email · отправка наружу — по подтверждению</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {([{ l: 'Общий', v: 'general' }, { l: 'Новые 24–48 ч', v: 'curious' }] as const).map((p) => (
                <button key={p.v} onClick={() => setMode(p.v)} className={`min-h-11 px-3 py-2 text-xs rounded-md border transition-colors ${mode === p.v ? 'bg-warm-50 border-warm-300 text-warm-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{p.l}</button>
              ))}
              {mode === 'general' && ([{ l: '48ч+', m: 2 }, { l: '3–30 дн', m: 3 }] as const).map((p) => (
                <button key={p.m} onClick={() => setWin({ minDays: p.m, maxDays: 30 })} className={`min-h-11 px-3 py-2 text-xs rounded-md border transition-colors ${win.minDays === p.m ? 'bg-forest-50 border-forest-300 text-forest-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{p.l}</button>
              ))}
              <button onClick={() => load()} disabled={loading} className="min-h-11 flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors disabled:opacity-50">
                <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />Обновить
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
            {loading && !preview && <div className="flex items-center justify-center py-8"><Loader className="w-6 h-6 text-forest-600 animate-spin" /></div>}
            {preview && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-gray-500">
                    {preview.count} получателей · email: {preview.summary.email} · SMS: {preview.summary.sms} · нет канала: {preview.summary.no_channel} · отписка: {preview.summary.skipped_unsubscribed} · пауза {preview.cooldown_days} дн · к отправке {bulkEmails} email и {bulkSms} SMS
                  </p>
                  <button data-testid="retention-send-all" onClick={() => send()} disabled={sending !== null || !sendable.length} className="flex items-center gap-1.5 px-3 py-1.5 bg-warm-600 text-white rounded-lg hover:bg-warm-700 transition-colors text-sm disabled:opacity-50">
                    {sending === 'all' ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Отправить всем (без паузы)
                  </button>
                </div>
                {result && <div className="bg-green-50 border border-green-200 rounded p-2 text-green-700 text-xs">{result}</div>}
                {preview.count === 0 && <p className="text-sm text-gray-500 py-6 text-center">Сейчас получателей в окне нет.</p>}
                <div className="space-y-2">
                  {preview.drafts.map((d) => (
                    <div key={d.user_id} data-testid={`retention-row-${d.user_id}`} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-sm font-medium text-gray-800">
                          <span className="inline-flex items-center gap-1 mr-2">
                            {d.channel === 'email' ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                            {d.channel === 'no_channel' ? 'нет канала' : d.channel}
                          </span>
                          {d.email || d.phone || d.user_id}
                          <span className="text-gray-400 font-normal"> · {d.language}</span>
                          {d.assistant_name && <span className="text-gray-400 font-normal"> · {d.assistant_name}</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{d.hours_inactive != null ? `${d.hours_inactive}ч` : `${d.days_inactive} дн`}</span>
                          {d.in_cooldown && <span className="text-xs text-amber-600" title={d.last_sent_at || ''}>пауза</span>}
                          <button data-testid={`retention-send-${d.user_id}`} onClick={() => send([d.user_id], d.in_cooldown)} disabled={sending !== null || d.channel === 'no_channel'} className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-forest-300 text-forest-700 hover:bg-forest-50 disabled:opacity-50">
                            {sending === d.user_id ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {d.in_cooldown ? 'Повторить' : 'Отправить'}
                          </button>
                        </div>
                      </div>
                      {d.subject && <p className="text-xs font-medium text-gray-700 mb-1">{d.subject}</p>}
                      {d.message && <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">{d.message}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRetentionView;
```

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add src/components/admin/AdminRetentionView.tsx
git commit -m "feat(admin): показать email и SMS в retention-рассылке" -m "Co-Authored-By: Kimi <noreply@anthropic.com>"
```

- [ ] **Step 6: Проверить компонент и соседние страницы**

Run: `front-ci "pnpm exec vitest run src/components/admin/AdminRetentionView.test.tsx src/pages/AdminPage.test.tsx src/pages/AdminPage.navigation.test.tsx"`
Expected: PASS, 5 новых tests и обе соседние suites.

---

### Task 10: Полная проверка изменений

**Files:**
- Verify all files from Tasks 1–9
- Verify: `src/retention/migrations/001_retention_email_unsubscribes.sql`

- [ ] **Step 1: Проверить все backend-тесты фичи и общий MailService**

```bash
back-ci "npx jest --runTestsByPath src/retention/retention-recipient.spec.ts src/retention/retention-unsubscribe.service.spec.ts src/retention/retention-mail.spec.ts src/retention/retention-recipient-resolver.spec.ts src/retention/retention-send.spec.ts src/retention/retention-unsubscribe.controller.spec.ts src/retention/retention.module.spec.ts src/common/services/mail.service.spec.ts src/admin/admin.retention-controller.spec.ts src/admin/admin.tg-activity.spec.ts src/admin/admin.calls-controller.spec.ts --maxWorkers=2"
```

Expected: все перечисленные suites PASS; `retention.preview.pg.spec.ts` здесь не участвует, потому что требует отдельную БД.

- [ ] **Step 2: Повторить PG-тест на чистой одноразовой базе**

```bash
back-ci 'DB=retention_final_$(date +%s)_$$; createdb -h /var/run/postgresql "$DB"; PROVISIONING_PG_URL="postgres:///$DB?host=/var/run/postgresql" npx jest --runTestsByPath src/retention/retention.preview.pg.spec.ts --runInBand; RC=$?; dropdb -h /var/run/postgresql --if-exists "$DB"; exit $RC'
```

Expected: PASS, 2 tests; база удалена.

- [ ] **Step 3: Проверить TypeScript и production build backend**

Run: `back-ci "npx tsc --noEmit -p tsconfig.build.json && npm run build"`
Expected: обе команды exit code 0. Jest не считается typecheck-гейтом.

- [ ] **Step 4: Проверить frontend-тесты, TypeScript и production build**

```bash
front-ci "pnpm exec vitest run src/components/admin/AdminRetentionView.test.tsx src/pages/AdminPage.test.tsx src/pages/AdminPage.navigation.test.tsx && pnpm typecheck && pnpm build"
```

Expected: все suites PASS, `tsc -p tsconfig.app.json` без ошибок, Vite build завершается успешно.

- [ ] **Step 5: Проверить миграцию в discovery runner и отсутствие случайных изменений**

```bash
back-ci 'DB=retention_dry_$(date +%s)_$$; createdb -h /var/run/postgresql "$DB"; DATABASE_URL="postgres:///$DB?host=/var/run/postgresql" npm run migrate:dry; RC=$?; dropdb -h /var/run/postgresql --if-exists "$DB"; exit $RC'
```

Expected: в списке pending присутствует `retention/001_retention_email_unsubscribes.sql`; команда использует только одноразовую пустую БД, ничего не применяет и удаляет её. Затем локально:

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/retention-email-first diff --check origin/main...HEAD
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/retention-email-first diff --check 738836b...HEAD
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/retention-email-first status --short
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/retention-email-first status --short
```

Expected: `diff --check` ничего не выводит; backend status чистый; frontend status показывает только скопированный для исполнителя план, если он ещё не закоммичен отдельно.

- [ ] **Step 6: Зафиксировать результат без выката**

Сообщить пользователю точные PASS-команды, число тестов, SHA обеих веток и отсутствие реальных внешних отправок. Не запускать `deploy.sh`, не отправлять preview/send через прод или test и не переводить задачу в `done`, пока пользователь отдельно не выберет интеграцию/выкат.

---

## Покрытие спецификации

- Email-first, отсутствие SMS-fallback и `no_channel`: Tasks 1, 6, 9.
- Любой валидный сохранённый email, precedence, phone-identity и UUID без `dozvon_*`: Tasks 1, 4, 5.
- Семь локалей, plain text, HTML escaping и язык в ссылках: Tasks 3, 5.
- Постоянный token, suppression по адресу, GET без изменений, идемпотентный POST и запрет `resend`: Tasks 2, 4, 6, 7.
- Ручной `confirm:true`, старый `phones[]`, новый `userIds[]`, cooldown и счётчики: Tasks 5, 6, 8, 9.
- Отдельный модуль, admin API и удаление старой реализации: Task 8.
- Безопасные коды SMTP, `log_error` и предупреждение администратору: Tasks 6, 9.
- Проверка реального SQL, TypeScript и builds на ноде: Tasks 5, 10.
- Cron, push, очередь, реальные отправки и deploy не добавляются: явно исключены из Steps всех задач и Task 10 Step 6.
