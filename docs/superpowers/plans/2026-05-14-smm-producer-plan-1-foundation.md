# SMM Producer — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Положить фундамент для SMM Producer: MinIO в Docker, БД-схема (9 таблиц), `StorageService`, `SmmBillingService`, шифрование credentials, REST-каркас `/webhook/smm/*` и BullMQ-очереди. После этого Plan 2 (Render Pipeline) и далее имеют всю инфраструктуру для работы.

**Architecture:** Новый NestJS-модуль `src/smm/` в `spirits_back` с raw `pg` queries (под конвенцию проекта), общий `StorageService` в `src/common/services/`, MinIO в Docker рядом с существующими контейнерами. Тесты — расширение существующего runner'а в `~/Downloads/spirits_back/tests/`.

**Tech Stack:** NestJS 10, raw `pg` (PostgreSQL 16), `@aws-sdk/client-s3` (для MinIO), `bullmq` (новая зависимость), Node `crypto` (AES-256-GCM для credentials), MinIO в Docker.

**End-state demo:**
- MinIO работает на `212.113.106.202:9000`, публичная раздача через `https://my.linkeon.io/smm-media/`
- БД содержит 9 таблиц `smm_*` с seed-данными `smm_pricing`
- API эндпоинты `POST/GET /webhook/smm/campaigns` работают с проверкой `isAdmin`
- `SmmBillingService.charge()` / `refund()` корректно списывает/возвращает токены атомарно
- `credentials.crypto` round-trip: encrypt → store → decrypt → original plain
- BullMQ-очереди `smm-render` и `smm-publish` стартуют, можно положить/прочитать job
- Тесты: 8+ unit + 6+ integration зелёные

---

## File Structure

**Создаются:**

```
spirits_back/
├── docker-compose.minio.yml                              # MinIO контейнер
├── scripts/
│   └── migrate.ts                                        # SQL-миграционный раннер
├── src/
│   ├── common/services/
│   │   └── storage.service.ts                            # S3-абстракция (MinIO + legacy Yandex)
│   ├── smm/
│   │   ├── smm.module.ts
│   │   ├── smm.controller.ts                             # каркас REST endpoints
│   │   ├── migrations/
│   │   │   ├── 001_smm_schema.sql                        # 9 таблиц
│   │   │   └── 002_smm_pricing_seed.sql                  # seed tariffs
│   │   ├── entities/
│   │   │   ├── smm-campaign.entity.ts                    # TS типы для рядов БД
│   │   │   ├── smm-scenario.entity.ts
│   │   │   ├── smm-video.entity.ts
│   │   │   ├── smm-publication.entity.ts
│   │   │   ├── smm-social-account.entity.ts
│   │   │   ├── smm-music-track.entity.ts
│   │   │   ├── smm-pricing.entity.ts
│   │   │   ├── smm-billing-ledger.entity.ts
│   │   │   └── smm-event-log.entity.ts
│   │   ├── billing/
│   │   │   ├── smm-billing.service.ts                    # charge/refund + транзакции
│   │   │   ├── smm-pricing.service.ts                    # in-memory кеш тарифов
│   │   │   └── insufficient-tokens.error.ts
│   │   ├── social-accounts/
│   │   │   ├── credentials.crypto.ts                     # AES-256-GCM
│   │   │   └── social-account.service.ts                 # CRUD-каркас (без OAuth)
│   │   ├── render/
│   │   │   └── render-queue.service.ts                   # BullMQ producer
│   │   ├── publication/
│   │   │   └── publish-queue.service.ts                  # BullMQ producer
│   │   └── dto/
│   │       ├── create-campaign.dto.ts
│   │       └── charge-result.dto.ts
└── tests/
    └── smm/
        ├── crypto.unit.test.js                            # round-trip + tamper
        ├── storage.integration.test.js                    # MinIO upload/download
        ├── billing.integration.test.js                    # charge/refund атомарность
        ├── pricing.integration.test.js                    # загрузка тарифов
        ├── campaigns.integration.test.js                  # REST + admin guard
        ├── queues.integration.test.js                     # BullMQ enqueue/peek
        └── fixtures/
            └── admin-user.sql                             # тестовый admin
```

**Модифицируются:**

```
spirits_back/
├── package.json                                          # +bullmq, +nestjs/bull
├── src/app.module.ts                                     # +SmmModule
├── tests/runner.js                                       # +suite 'smm'
├── tests/config.js                                       # +SMM_API_BASE, ADMIN_JWT
└── (на сервере) /etc/nginx/sites-enabled/my.linkeon.io   # +location /smm-media/
```

**Env-vars (добавляются в `.env`):**

```
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET_VIDEOS=linkeon-smm-videos
MINIO_BUCKET_MUSIC=linkeon-smm-music
MINIO_PUBLIC_URL=https://my.linkeon.io/smm-media
SMM_CREDS_SECRET=...                            # 64 hex символа
SMM_WORKER_SECRET=...                           # для internal endpoints
```

---

## Task 1: MinIO в Docker

**Файлы:**
- Создать: `spirits_back/docker-compose.minio.yml`
- Изменить (на сервере): `/etc/nginx/sites-enabled/my.linkeon.io`
- Изменить: `spirits_back/.env`

- [ ] **Step 1.1: Создать docker-compose файл**

Создать `~/Downloads/spirits_back/docker-compose.minio.yml`:

```yaml
version: '3.8'

services:
  minio:
    image: minio/minio:RELEASE.2024-10-13T13-34-11Z
    container_name: minio
    restart: unless-stopped
    ports:
      - "127.0.0.1:9000:9000"     # S3 API — только localhost
      - "127.0.0.1:9001:9001"     # Console — только localhost
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_BROWSER_REDIRECT_URL: http://127.0.0.1:9001
    volumes:
      - /var/lib/minio/data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 30s
      timeout: 20s
      retries: 3
```

Закоммитить:

```bash
cd ~/Downloads/spirits_back
git add docker-compose.minio.yml
git commit -m "feat(smm): add MinIO docker-compose for SMM storage"
```

- [ ] **Step 1.2: Сгенерировать креды MinIO**

Локально (или прямо на сервере):

```bash
ROOT_USER="minio_root"
ROOT_PASS=$(openssl rand -hex 24)
ACCESS_KEY="smm_$(openssl rand -hex 4)"
SECRET_KEY=$(openssl rand -hex 24)
echo "MINIO_ROOT_USER=$ROOT_USER"
echo "MINIO_ROOT_PASSWORD=$ROOT_PASS"
echo "MINIO_ACCESS_KEY=$ACCESS_KEY"
echo "MINIO_SECRET_KEY=$SECRET_KEY"
```

Сохранить в надёжное место (1Password / vault). Не коммитить.

- [ ] **Step 1.3: Залить docker-compose на сервер и запустить**

```bash
scp ~/Downloads/spirits_back/docker-compose.minio.yml dvolkov@212.113.106.202:~/spirits_back/
ssh dvolkov@212.113.106.202 'sudo mkdir -p /var/lib/minio/data && sudo chown -R $USER:$USER /var/lib/minio'
```

На сервере добавить в `~/spirits_back/.env`:

```bash
ssh dvolkov@212.113.106.202
cd ~/spirits_back
cat >> .env <<EOF

# MinIO (added by SMM Producer Plan 1)
MINIO_ROOT_USER=<значение из step 1.2>
MINIO_ROOT_PASSWORD=<значение из step 1.2>
MINIO_ACCESS_KEY=<значение из step 1.2>
MINIO_SECRET_KEY=<значение из step 1.2>
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_BUCKET_VIDEOS=linkeon-smm-videos
MINIO_BUCKET_MUSIC=linkeon-smm-music
MINIO_PUBLIC_URL=https://my.linkeon.io/smm-media
EOF
docker compose -f docker-compose.minio.yml --env-file .env up -d
```

Ожидаемый вывод: `Container minio Started`. Проверить:

```bash
docker ps | grep minio
curl -sf http://127.0.0.1:9000/minio/health/live
```

Ожидаемый ответ от health: HTTP 200.

- [ ] **Step 1.4: Создать бакеты через MinIO Client (mc)**

На сервере:

```bash
# Установить mc
wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /tmp/mc
sudo mv /tmp/mc /usr/local/bin/mc && sudo chmod +x /usr/local/bin/mc

# Настроить alias на наш MinIO
source ~/spirits_back/.env
mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# Создать бакеты
mc mb local/linkeon-smm-videos
mc mb local/linkeon-smm-music

# Создать пользователя со scoped доступом
mc admin user add local "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
cat > /tmp/smm-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::linkeon-smm-videos",
        "arn:aws:s3:::linkeon-smm-videos/*",
        "arn:aws:s3:::linkeon-smm-music",
        "arn:aws:s3:::linkeon-smm-music/*"
      ]
    }
  ]
}
EOF
mc admin policy create local smm-rw /tmp/smm-policy.json
mc admin policy attach local smm-rw --user "$MINIO_ACCESS_KEY"

# Сделать публичный read-only для anonymous (но без листинга)
mc anonymous set download local/linkeon-smm-videos
mc anonymous set download local/linkeon-smm-music
```

Проверить, что бакеты есть:

```bash
mc ls local/
```

Ожидаемый вывод:
```
linkeon-smm-music/
linkeon-smm-videos/
```

- [ ] **Step 1.5: Smoke-загрузка тестового файла**

```bash
echo "hello smm" > /tmp/smoke.txt
mc cp /tmp/smoke.txt local/linkeon-smm-videos/smoke.txt
curl -sf http://127.0.0.1:9000/linkeon-smm-videos/smoke.txt
```

Ожидаемый вывод: `hello smm`. Удалить:

```bash
mc rm local/linkeon-smm-videos/smoke.txt
```

- [ ] **Step 1.6: Настроить Nginx public read-only**

На сервере добавить в `/etc/nginx/sites-enabled/my.linkeon.io` (или соответствующий конфиг для домена) перед закрывающим `}` server-блока:

```nginx
# SMM media — public read-only via MinIO
location /smm-media/ {
    proxy_pass http://127.0.0.1:9000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;

    # Read-only: запрещаем все методы кроме GET/HEAD
    limit_except GET HEAD {
        deny all;
    }

    # CORS для веб-плеера
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;

    # Кешируем агрессивно — UUID в URL гарантирует уникальность
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

Применить:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Ожидаемый вывод `nginx -t`: `syntax is ok` и `test is successful`.

- [ ] **Step 1.7: Проверить публичную раздачу**

С локальной машины:

```bash
echo "public smoke" > /tmp/pub-smoke.txt
ssh dvolkov@212.113.106.202 "mc cp - local/linkeon-smm-videos/pub-smoke.txt" < /tmp/pub-smoke.txt
curl -sf https://my.linkeon.io/smm-media/linkeon-smm-videos/pub-smoke.txt
```

Ожидаемый вывод: `public smoke`. Удалить:

```bash
ssh dvolkov@212.113.106.202 "mc rm local/linkeon-smm-videos/pub-smoke.txt"
```

---

## Task 2: SQL миграционный раннер

В проекте нет миграционного раннера — SQL файлы лежат в `src/<module>/migrations/`, но кто их применяет, не очевидно. Делаем простой раннер на TypeScript.

**Файлы:**
- Создать: `spirits_back/scripts/migrate.ts`
- Изменить: `spirits_back/package.json` (добавить script `migrate`)

- [ ] **Step 2.1: Написать раннер**

Создать `~/Downloads/spirits_back/scripts/migrate.ts`:

```typescript
#!/usr/bin/env ts-node
/**
 * Simple SQL migration runner for spirits_back.
 *
 * Scans src/<module>/migrations/*.sql in lexicographic order.
 * Tracks applied migrations in `schema_migrations` table.
 * Each file runs in a transaction.
 *
 * Usage:
 *   npm run migrate           # apply all pending
 *   npm run migrate -- --dry  # show pending without applying
 */
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const dryRun = process.argv.includes('--dry');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function discoverMigrations(): Array<{ filename: string; fullPath: string }> {
  const srcDir = path.join(__dirname, '..', 'src');
  const found: Array<{ filename: string; fullPath: string }> = [];
  for (const moduleDir of fs.readdirSync(srcDir)) {
    const migDir = path.join(srcDir, moduleDir, 'migrations');
    if (!fs.existsSync(migDir)) continue;
    for (const file of fs.readdirSync(migDir)) {
      if (file.endsWith('.sql')) {
        found.push({
          filename: `${moduleDir}/${file}`,
          fullPath: path.join(migDir, file),
        });
      }
    }
  }
  found.sort((a, b) => a.filename.localeCompare(b.filename));
  return found;
}

async function appliedSet(): Promise<Set<string>> {
  const res = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map((r) => r.filename));
}

async function applyMigration(filename: string, fullPath: string): Promise<void> {
  const sql = fs.readFileSync(fullPath, 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`✓ applied ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Failed to apply ${filename}: ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  await ensureMigrationsTable();
  const all = discoverMigrations();
  const applied = await appliedSet();
  const pending = all.filter((m) => !applied.has(m.filename));

  if (pending.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Pending migrations (${pending.length}):`);
  for (const m of pending) console.log(`  - ${m.filename}`);

  if (dryRun) {
    console.log('(dry run, not applying)');
    return;
  }

  for (const m of pending) {
    await applyMigration(m.filename, m.fullPath);
  }
  console.log(`Applied ${pending.length} migration(s)`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
```

- [ ] **Step 2.2: Добавить script в package.json**

Изменить `~/Downloads/spirits_back/package.json`. В блок `scripts` добавить:

```json
    "migrate": "ts-node scripts/migrate.ts",
    "migrate:dry": "ts-node scripts/migrate.ts --dry"
```

Итоговый блок `scripts`:

```json
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "migrate": "ts-node scripts/migrate.ts",
    "migrate:dry": "ts-node scripts/migrate.ts --dry"
  },
```

- [ ] **Step 2.3: Smoke-тест раннера на пустой схеме**

Локально, на dev-БД (или временной test-БД):

```bash
cd ~/Downloads/spirits_back
DATABASE_URL="postgresql://linkeon:linkeon_pass_2026@212.113.106.202:5433/linkeon" npm run migrate:dry
```

Ожидаемый вывод (если миграции ещё не применены):
```
Pending migrations (2):
  - peer/001_peer_tables.sql
  - support/001_support.sql
  - video/001_video_jobs.sql
(dry run, not applying)
```

Если эти миграции УЖЕ применены вручную раньше — раннер этого не знает. Сделаем backfill:

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c "
INSERT INTO schema_migrations (filename) VALUES
  ('peer/001_peer_tables.sql'),
  ('support/001_support.sql'),
  ('video/001_video_jobs.sql')
ON CONFLICT DO NOTHING;
" 2>&1 | tail -3
```

Если `schema_migrations` ещё не существует — сначала прогнать `npm run migrate` (она создаст пустую таблицу через `ensureMigrationsTable`, остальные миграции попытается применить и упадёт на конфликте имён таблиц). Тогда:

1. Создать таблицу руками: `CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`
2. Сделать backfill insert выше
3. Запустить `npm run migrate:dry` — должно показать `No pending migrations`

- [ ] **Step 2.4: Коммит**

```bash
cd ~/Downloads/spirits_back
git add scripts/migrate.ts package.json
git commit -m "feat: add SQL migration runner script"
```

---

## Task 3: SMM SQL миграция (9 таблиц)

**Файлы:**
- Создать: `spirits_back/src/smm/migrations/001_smm_schema.sql`
- Создать: `spirits_back/src/smm/migrations/002_smm_pricing_seed.sql`

- [ ] **Step 3.1: Написать миграцию схемы**

Создать `~/Downloads/spirits_back/src/smm/migrations/001_smm_schema.sql`:

```sql
-- 001_smm_schema.sql
-- SMM Producer feature — 9 tables for campaigns, scenarios, videos, publications,
-- social accounts, music library, pricing, billing ledger, event log.

-- 1. Campaigns ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_campaign (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  conversation_id  uuid,
  topic            text,
  source_mode      text NOT NULL CHECK (source_mode IN ('auto', 'topic', 'trends')),
  requested_count  int NOT NULL CHECK (requested_count > 0 AND requested_count <= 20),
  status           text NOT NULL DEFAULT 'drafting'
                   CHECK (status IN ('drafting', 'approved', 'done', 'cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smm_campaign_user_created
  ON smm_campaign (user_id, created_at DESC);

-- 2. Scenarios ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_scenario (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL REFERENCES smm_campaign(id) ON DELETE CASCADE,
  title            text NOT NULL,
  assistant_role   text NOT NULL,
  dialog           jsonb NOT NULL,
  mood             text NOT NULL,
  broll_prompts    jsonb NOT NULL DEFAULT '[]'::jsonb,
  music_track_id   text,
  tts_tier         text NOT NULL DEFAULT 'premium'
                   CHECK (tts_tier IN ('economy', 'premium')),
  status           text NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review', 'approved', 'rejected', 'regenerating')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smm_scenario_campaign
  ON smm_scenario (campaign_id, created_at);

-- 3. Videos ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_video (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id      uuid NOT NULL UNIQUE REFERENCES smm_scenario(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'rendering', 'ready', 'failed', 'approved', 'rejected')),
  render_job_id    text,
  render_state     jsonb NOT NULL DEFAULT '{}'::jsonb,
  mp4_url          text,
  duration_sec     int,
  size_bytes       bigint,
  error_message    text,
  tokens_charged   int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smm_video_status
  ON smm_video (status)
  WHERE status IN ('queued', 'rendering', 'failed');

-- 4. Publications ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_publication (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id          uuid NOT NULL REFERENCES smm_video(id) ON DELETE CASCADE,
  platform          text NOT NULL
                    CHECK (platform IN ('telegram', 'vk', 'youtube', 'tiktok', 'instagram')),
  scheduled_at      timestamptz,
  status            text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  publish_job_id    text,
  external_url      text,
  external_post_id  text,
  caption           text,
  error_message     text,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_smm_publication_scheduled
  ON smm_publication (scheduled_at)
  WHERE status = 'scheduled';

-- 5. Social accounts ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_social_account (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text,
  platform      text NOT NULL
                CHECK (platform IN ('telegram', 'vk', 'youtube', 'tiktok', 'instagram')),
  display_name  text NOT NULL,
  credentials   jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smm_social_account_user_platform
  ON smm_social_account (user_id, platform);

-- 6. Music library -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_music_track (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  mood          text NOT NULL
                CHECK (mood IN ('dramatic', 'inspiring', 'calm', 'uplifting', 'tense', 'neutral')),
  duration_sec  int NOT NULL,
  storage_key   text NOT NULL,
  license       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 7. Pricing -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_pricing (
  id            text PRIMARY KEY
                CHECK (id IN ('economy', 'premium')),
  tokens_cost   int NOT NULL CHECK (tokens_cost > 0),
  display_name  text NOT NULL,
  description   text,
  active        boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 8. Billing ledger ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_billing_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL,
  video_id      uuid REFERENCES smm_video(id) ON DELETE SET NULL,
  amount        int NOT NULL,
  op            text NOT NULL CHECK (op IN ('charge', 'refund')),
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smm_ledger_user_created
  ON smm_billing_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smm_ledger_video
  ON smm_billing_ledger (video_id);

-- 9. Event log ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smm_event_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  video_id        uuid REFERENCES smm_video(id) ON DELETE SET NULL,
  publication_id  uuid REFERENCES smm_publication(id) ON DELETE SET NULL,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smm_event_log_created
  ON smm_event_log (created_at DESC);

-- updated_at triggers --------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_smm_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'smm_campaign','smm_scenario','smm_video',
    'smm_publication','smm_social_account','smm_pricing'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS smm_updated_at ON %I;
       CREATE TRIGGER smm_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trg_smm_set_updated_at();',
      t, t
    );
  END LOOP;
END $$;
```

- [ ] **Step 3.2: Написать seed-миграцию тарифов**

Создать `~/Downloads/spirits_back/src/smm/migrations/002_smm_pricing_seed.sql`:

```sql
-- 002_smm_pricing_seed.sql
INSERT INTO smm_pricing (id, tokens_cost, display_name, description, active) VALUES
  ('economy', 15000, 'Эконом',
   'Yandex SpeechKit голоса. 60-сек вертикальный ролик с фоновой музыкой, B-roll и субтитрами.', true),
  ('premium', 50000, 'Премиум',
   'ElevenLabs Turbo v2.5 с продвинутыми голосами. Лучшее качество озвучки.', true)
ON CONFLICT (id) DO UPDATE
  SET tokens_cost = EXCLUDED.tokens_cost,
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      active = EXCLUDED.active,
      updated_at = now();
```

- [ ] **Step 3.3: Применить миграции локально (на dev-БД)**

```bash
cd ~/Downloads/spirits_back
DATABASE_URL="postgresql://linkeon:linkeon_pass_2026@212.113.106.202:5433/linkeon" npm run migrate
```

Ожидаемый вывод:
```
Pending migrations (2):
  - smm/001_smm_schema.sql
  - smm/002_smm_pricing_seed.sql
✓ applied smm/001_smm_schema.sql
✓ applied smm/002_smm_pricing_seed.sql
Applied 2 migration(s)
```

- [ ] **Step 3.4: Проверить таблицы и тарифы в БД**

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'smm_%'
ORDER BY table_name;
"
```

Ожидаемый вывод — 9 таблиц:
```
        table_name
---------------------------
 smm_billing_ledger
 smm_campaign
 smm_event_log
 smm_music_track
 smm_pricing
 smm_publication
 smm_scenario
 smm_social_account
 smm_video
```

Проверить тарифы:

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c "
SELECT id, tokens_cost, display_name FROM smm_pricing ORDER BY tokens_cost;
"
```

Ожидаемый вывод:
```
   id    | tokens_cost | display_name
---------+-------------+--------------
 economy |       15000 | Эконом
 premium |       50000 | Премиум
```

- [ ] **Step 3.5: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/smm/migrations/001_smm_schema.sql src/smm/migrations/002_smm_pricing_seed.sql
git commit -m "feat(smm): add database schema and pricing seed"
```

---

## Task 4: TypeScript entity-типы

Чистые TS-типы для рядов БД — без декораторов и ORM, просто `interface`. Используются в сервисах и DTO.

**Файлы:**
- Создать: `spirits_back/src/smm/entities/smm-campaign.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-scenario.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-video.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-publication.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-social-account.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-music-track.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-pricing.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-billing-ledger.entity.ts`
- Создать: `spirits_back/src/smm/entities/smm-event-log.entity.ts`

- [ ] **Step 4.1: smm-campaign.entity.ts**

```typescript
// src/smm/entities/smm-campaign.entity.ts
export type SmmSourceMode = 'auto' | 'topic' | 'trends';
export type SmmCampaignStatus = 'drafting' | 'approved' | 'done' | 'cancelled';

export interface SmmCampaign {
  id: string;
  userId: string;
  conversationId: string | null;
  topic: string | null;
  sourceMode: SmmSourceMode;
  requestedCount: number;
  status: SmmCampaignStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToCampaign(row: any): SmmCampaign {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id ?? null,
    topic: row.topic ?? null,
    sourceMode: row.source_mode,
    requestedCount: row.requested_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4.2: smm-scenario.entity.ts**

```typescript
// src/smm/entities/smm-scenario.entity.ts
export type SmmMood =
  | 'dramatic' | 'inspiring' | 'calm' | 'uplifting' | 'tense' | 'neutral';

export type SmmTtsTier = 'economy' | 'premium';

export type SmmScenarioStatus =
  | 'pending_review' | 'approved' | 'rejected' | 'regenerating';

export interface SmmDialogTurn {
  speaker: 'hero' | 'assistant';
  text: string;
  tStart: number;
  tEnd: number;
}

export interface SmmBrollPrompt {
  atSec: number;
  type: 'ai_image' | 'stock_video';
  prompt: string;
}

export interface SmmScenario {
  id: string;
  campaignId: string;
  title: string;
  assistantRole: string;
  dialog: SmmDialogTurn[];
  mood: SmmMood;
  brollPrompts: SmmBrollPrompt[];
  musicTrackId: string | null;
  ttsTier: SmmTtsTier;
  status: SmmScenarioStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToScenario(row: any): SmmScenario {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    assistantRole: row.assistant_role,
    dialog: row.dialog as SmmDialogTurn[],
    mood: row.mood,
    brollPrompts: row.broll_prompts as SmmBrollPrompt[],
    musicTrackId: row.music_track_id ?? null,
    ttsTier: row.tts_tier,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4.3: smm-video.entity.ts**

```typescript
// src/smm/entities/smm-video.entity.ts
export type SmmVideoStatus =
  | 'queued' | 'rendering' | 'ready' | 'failed' | 'approved' | 'rejected';

export interface SmmRenderState {
  scenarioLoaded?: boolean;
  voicesSynthesized?: string[];
  imagesGenerated?: string[];
  stockVideosDownloaded?: string[];
  remotionRendered?: boolean;
  postprocessed?: boolean;
  uploadedToMinio?: boolean;
}

export interface SmmVideo {
  id: string;
  scenarioId: string;
  status: SmmVideoStatus;
  renderJobId: string | null;
  renderState: SmmRenderState;
  mp4Url: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  tokensCharged: number;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToVideo(row: any): SmmVideo {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    status: row.status,
    renderJobId: row.render_job_id ?? null,
    renderState: (row.render_state as SmmRenderState) ?? {},
    mp4Url: row.mp4_url ?? null,
    durationSec: row.duration_sec ?? null,
    sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
    errorMessage: row.error_message ?? null,
    tokensCharged: row.tokens_charged,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4.4: smm-publication.entity.ts**

```typescript
// src/smm/entities/smm-publication.entity.ts
export type SmmPlatform =
  | 'telegram' | 'vk' | 'youtube' | 'tiktok' | 'instagram';

export type SmmPublicationStatus =
  | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';

export interface SmmPublication {
  id: string;
  videoId: string;
  platform: SmmPlatform;
  scheduledAt: Date | null;
  status: SmmPublicationStatus;
  publishJobId: string | null;
  externalUrl: string | null;
  externalPostId: string | null;
  caption: string | null;
  errorMessage: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToPublication(row: any): SmmPublication {
  return {
    id: row.id,
    videoId: row.video_id,
    platform: row.platform,
    scheduledAt: row.scheduled_at ?? null,
    status: row.status,
    publishJobId: row.publish_job_id ?? null,
    externalUrl: row.external_url ?? null,
    externalPostId: row.external_post_id ?? null,
    caption: row.caption ?? null,
    errorMessage: row.error_message ?? null,
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4.5: smm-social-account.entity.ts**

```typescript
// src/smm/entities/smm-social-account.entity.ts
import { SmmPlatform } from './smm-publication.entity';

export type SmmSocialAccountStatus = 'active' | 'expired' | 'revoked';

export interface SmmEncryptedCredentials {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
}

export interface SmmSocialAccount {
  id: string;
  userId: string | null;
  platform: SmmPlatform;
  displayName: string;
  credentials: SmmEncryptedCredentials;
  status: SmmSocialAccountStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToSocialAccount(row: any): SmmSocialAccount {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    platform: row.platform,
    displayName: row.display_name,
    credentials: row.credentials as SmmEncryptedCredentials,
    status: row.status,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4.6: smm-music-track.entity.ts**

```typescript
// src/smm/entities/smm-music-track.entity.ts
import { SmmMood } from './smm-scenario.entity';

export interface SmmMusicTrack {
  id: string;
  title: string;
  mood: SmmMood;
  durationSec: number;
  storageKey: string;
  license: string | null;
  createdAt: Date;
}

export function rowToMusicTrack(row: any): SmmMusicTrack {
  return {
    id: row.id,
    title: row.title,
    mood: row.mood,
    durationSec: row.duration_sec,
    storageKey: row.storage_key,
    license: row.license ?? null,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4.7: smm-pricing.entity.ts**

```typescript
// src/smm/entities/smm-pricing.entity.ts
import { SmmTtsTier } from './smm-scenario.entity';

export interface SmmPricing {
  id: SmmTtsTier;
  tokensCost: number;
  displayName: string;
  description: string | null;
  active: boolean;
  updatedAt: Date;
}

export function rowToPricing(row: any): SmmPricing {
  return {
    id: row.id,
    tokensCost: row.tokens_cost,
    displayName: row.display_name,
    description: row.description ?? null,
    active: row.active,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4.8: smm-billing-ledger.entity.ts**

```typescript
// src/smm/entities/smm-billing-ledger.entity.ts
export type SmmLedgerOp = 'charge' | 'refund';

export interface SmmBillingLedgerEntry {
  id: string;
  userId: string;
  videoId: string | null;
  amount: number;
  op: SmmLedgerOp;
  reason: string;
  createdAt: Date;
}

export function rowToLedgerEntry(row: any): SmmBillingLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    videoId: row.video_id ?? null,
    amount: row.amount,
    op: row.op,
    reason: row.reason,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4.9: smm-event-log.entity.ts**

```typescript
// src/smm/entities/smm-event-log.entity.ts
export interface SmmEventLog {
  id: string;
  eventType: string;
  videoId: string | null;
  publicationId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export function rowToEvent(row: any): SmmEventLog {
  return {
    id: row.id,
    eventType: row.event_type,
    videoId: row.video_id ?? null,
    publicationId: row.publication_id ?? null,
    payload: (row.payload as Record<string, unknown>) ?? null,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 4.10: Проверить TypeScript-сборку**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -20
```

Ожидаемый вывод: сборка успешна, без ошибок TS.

- [ ] **Step 4.11: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/smm/entities/
git commit -m "feat(smm): add TypeScript entity types for SMM tables"
```

---

## Task 5: Credentials crypto (AES-256-GCM)

**Файлы:**
- Создать: `spirits_back/src/smm/social-accounts/credentials.crypto.ts`
- Создать: `spirits_back/tests/smm/crypto.unit.test.js`

- [ ] **Step 5.1: Сгенерировать SMM_CREDS_SECRET**

```bash
openssl rand -hex 32
# Output: 64-char hex string, например: a1b2c3...
```

Положить в `.env` локально (и на сервере):

```
SMM_CREDS_SECRET=<сгенерированное 64-символьное значение>
```

- [ ] **Step 5.2: Написать failing test**

Создать `~/Downloads/spirits_back/tests/smm/crypto.unit.test.js`:

```javascript
/**
 * Unit tests for credentials crypto.
 *
 * Tests are pure-Node (no HTTP), use the compiled service directly.
 * Run via: cd tests && node runner.js --suite smm
 */
const path = require('path');

// Load .env from spirits_back root so SMM_CREDS_SECRET is set
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const {
  encryptCredentials,
  decryptCredentials,
  TamperDetectedError,
} = require(path.join(__dirname, '..', '..', 'dist', 'smm', 'social-accounts', 'credentials.crypto'));

module.exports = {
  'crypto: round-trip plain object': () => {
    const plain = { accessToken: 'abc', refreshToken: 'xyz', expiresAt: '2030-01-01' };
    const encrypted = encryptCredentials(plain);
    if (encrypted.v !== 1) throw new Error('Expected version 1');
    if (typeof encrypted.iv !== 'string') throw new Error('IV must be string');
    if (typeof encrypted.tag !== 'string') throw new Error('Tag must be string');
    if (typeof encrypted.ct !== 'string') throw new Error('Ciphertext must be string');

    const decrypted = decryptCredentials(encrypted);
    if (JSON.stringify(decrypted) !== JSON.stringify(plain)) {
      throw new Error(`Round-trip mismatch: ${JSON.stringify(decrypted)}`);
    }
  },

  'crypto: different IV per encryption': () => {
    const plain = { token: 'same' };
    const e1 = encryptCredentials(plain);
    const e2 = encryptCredentials(plain);
    if (e1.iv === e2.iv) throw new Error('IV must be unique per encryption');
    if (e1.ct === e2.ct) throw new Error('Ciphertext must differ for same plaintext (random IV)');
  },

  'crypto: tamper detection (modified ciphertext)': () => {
    const plain = { token: 'secret' };
    const encrypted = encryptCredentials(plain);
    // Flip a byte in ciphertext
    const buf = Buffer.from(encrypted.ct, 'base64');
    buf[0] = buf[0] ^ 0x01;
    const tampered = { ...encrypted, ct: buf.toString('base64') };

    let thrown = null;
    try {
      decryptCredentials(tampered);
    } catch (e) {
      thrown = e;
    }
    if (!thrown) throw new Error('Expected TamperDetectedError on tampered ciphertext');
    if (!(thrown instanceof TamperDetectedError)) {
      throw new Error(`Expected TamperDetectedError, got: ${thrown.constructor.name}`);
    }
  },

  'crypto: tamper detection (modified tag)': () => {
    const plain = { token: 'secret' };
    const encrypted = encryptCredentials(plain);
    const buf = Buffer.from(encrypted.tag, 'base64');
    buf[0] = buf[0] ^ 0x01;
    const tampered = { ...encrypted, tag: buf.toString('base64') };

    let thrown = null;
    try {
      decryptCredentials(tampered);
    } catch (e) {
      thrown = e;
    }
    if (!(thrown instanceof TamperDetectedError)) {
      throw new Error('Expected TamperDetectedError on tampered tag');
    }
  },

  'crypto: throws if SMM_CREDS_SECRET is invalid length': () => {
    const original = process.env.SMM_CREDS_SECRET;
    process.env.SMM_CREDS_SECRET = 'too-short';
    try {
      encryptCredentials({ x: 1 });
      throw new Error('Expected error on invalid secret length');
    } catch (e) {
      if (!e.message.includes('SMM_CREDS_SECRET')) {
        throw new Error(`Unexpected error: ${e.message}`);
      }
    } finally {
      process.env.SMM_CREDS_SECRET = original;
    }
  },
};
```

- [ ] **Step 5.3: Зарегистрировать suite в runner**

Изменить `~/Downloads/spirits_back/tests/runner.js`. Найти блок:

```javascript
const suites = {
  api: require('./api.test'),
  db: require('./db.test'),
  e2e: require('./e2e.test'),
};
```

Заменить на:

```javascript
const suites = {
  api: require('./api.test'),
  db: require('./db.test'),
  e2e: require('./e2e.test'),
  smm: require('./smm'),
};
```

Создать `~/Downloads/spirits_back/tests/smm/index.js`:

```javascript
// Aggregator for all SMM test files. Loaded by ../runner.js as suite 'smm'.
module.exports = {
  ...require('./crypto.unit.test'),
};
```

Установить `dotenv` в тестовом пакете (если не установлен):

```bash
cd ~/Downloads/spirits_back/tests
npm install dotenv --save
```

- [ ] **Step 5.4: Запустить тест — он должен упасть (нет реализации)**

```bash
cd ~/Downloads/spirits_back
npm run build  # сначала проверим что текущая сборка ок
cd tests
node runner.js --suite smm 2>&1 | head -20
```

Ожидаемый вывод: ошибка `Cannot find module '.../dist/smm/social-accounts/credentials.crypto'`. Это ожидаемый fail.

- [ ] **Step 5.5: Написать реализацию credentials.crypto**

Создать `~/Downloads/spirits_back/src/smm/social-accounts/credentials.crypto.ts`:

```typescript
// src/smm/social-accounts/credentials.crypto.ts
import * as crypto from 'crypto';
import { SmmEncryptedCredentials } from '../entities/smm-social-account.entity';

/**
 * AES-256-GCM encryption for social-account OAuth tokens.
 *
 * Stored shape in DB (jsonb column `credentials`):
 *   { v: 1, iv: <base64>, tag: <base64>, ct: <base64> }
 *
 * Secret loaded from env SMM_CREDS_SECRET — must be 64 hex chars (32 bytes).
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM

export class TamperDetectedError extends Error {
  constructor() {
    super('Encrypted credentials failed authentication (tampered or corrupt)');
    this.name = 'TamperDetectedError';
  }
}

function loadKey(): Buffer {
  const hex = process.env.SMM_CREDS_SECRET;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('SMM_CREDS_SECRET must be set to 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptCredentials(plain: Record<string, unknown>): SmmEncryptedCredentials {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(plain);
  const ciphertext = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ciphertext.toString('base64'),
  };
}

export function decryptCredentials(encrypted: SmmEncryptedCredentials): Record<string, unknown> {
  if (encrypted.v !== 1) {
    throw new Error(`Unsupported credentials version: ${encrypted.v}`);
  }
  const key = loadKey();
  const iv = Buffer.from(encrypted.iv, 'base64');
  const tag = Buffer.from(encrypted.tag, 'base64');
  const ct = Buffer.from(encrypted.ct, 'base64');

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch (err) {
    // GCM throws on bad tag/tampered ciphertext
    throw new TamperDetectedError();
  }
}
```

- [ ] **Step 5.6: Пересобрать и прогнать тест**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -5
cd tests
node runner.js --suite smm 2>&1 | tail -20
```

Ожидаемый вывод: 5 тестов passed.

```
SUITE: smm
============================================================
  ✓ crypto: round-trip plain object
  ✓ crypto: different IV per encryption
  ✓ crypto: tamper detection (modified ciphertext)
  ✓ crypto: tamper detection (modified tag)
  ✓ crypto: throws if SMM_CREDS_SECRET is invalid length
```

- [ ] **Step 5.7: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/smm/social-accounts/credentials.crypto.ts \
        tests/smm/crypto.unit.test.js \
        tests/smm/index.js \
        tests/runner.js \
        tests/package.json \
        tests/package-lock.json
git commit -m "feat(smm): AES-256-GCM credentials encryption + tests"
```

---

## Task 6: StorageService (S3 абстракция)

**Файлы:**
- Создать: `spirits_back/src/common/services/storage.service.ts`
- Изменить: `spirits_back/src/common/common.module.ts`
- Создать: `spirits_back/tests/smm/storage.integration.test.js`

- [ ] **Step 6.1: Написать failing test**

Создать `~/Downloads/spirits_back/tests/smm/storage.integration.test.js`:

```javascript
/**
 * Integration test: StorageService against real MinIO.
 *
 * Requires:
 *   - MinIO running on $MINIO_ENDPOINT
 *   - MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET_VIDEOS in env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { StorageService } = require(
  path.join(__dirname, '..', '..', 'dist', 'common', 'services', 'storage.service'),
);

const storage = new StorageService();
storage.onModuleInit();

const BUCKET = process.env.MINIO_BUCKET_VIDEOS;
const KEY = `test/storage-smoke-${Date.now()}.txt`;

module.exports = {
  'storage: upload returns public URL': async () => {
    const url = await storage.upload({
      bucket: BUCKET,
      key: KEY,
      body: Buffer.from('hello storage'),
      contentType: 'text/plain',
    });
    const expectedPrefix = process.env.MINIO_PUBLIC_URL + '/' + BUCKET + '/';
    if (!url.startsWith(expectedPrefix)) {
      throw new Error(`Expected URL to start with ${expectedPrefix}, got: ${url}`);
    }
  },

  'storage: download returns same bytes': async () => {
    const buf = await storage.download({ bucket: BUCKET, key: KEY });
    if (buf.toString('utf8') !== 'hello storage') {
      throw new Error(`Expected 'hello storage', got: ${buf.toString('utf8')}`);
    }
  },

  'storage: list returns the key': async () => {
    const keys = await storage.list({ bucket: BUCKET, prefix: 'test/' });
    if (!keys.includes(KEY)) {
      throw new Error(`Expected ${KEY} in list, got: ${JSON.stringify(keys)}`);
    }
  },

  'storage: delete removes the object': async () => {
    await storage.delete({ bucket: BUCKET, key: KEY });
    let thrown = null;
    try {
      await storage.download({ bucket: BUCKET, key: KEY });
    } catch (e) {
      thrown = e;
    }
    if (!thrown) throw new Error('Expected error on download after delete');
    if (!String(thrown.message).match(/NoSuchKey|not found|404/i)) {
      throw new Error(`Expected NoSuchKey error, got: ${thrown.message}`);
    }
  },
};
```

Добавить в `~/Downloads/spirits_back/tests/smm/index.js`:

```javascript
module.exports = {
  ...require('./crypto.unit.test'),
  ...require('./storage.integration.test'),
};
```

- [ ] **Step 6.2: Запустить тест — он должен упасть**

```bash
cd ~/Downloads/spirits_back/tests
node runner.js --suite smm 2>&1 | tail -20
```

Ожидаемый: ошибка `Cannot find module '.../dist/common/services/storage.service'`.

- [ ] **Step 6.3: Написать StorageService**

Создать `~/Downloads/spirits_back/src/common/services/storage.service.ts`:

```typescript
// src/common/services/storage.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export interface UploadInput {
  bucket: string;
  key: string;
  body: Buffer | Readable;
  contentType?: string;
  cacheControl?: string;
}

export interface DownloadInput {
  bucket: string;
  key: string;
}

export interface DeleteInput {
  bucket: string;
  key: string;
}

export interface ListInput {
  bucket: string;
  prefix?: string;
  maxKeys?: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3!: S3Client;
  private publicBaseUrl!: string;

  onModuleInit(): void {
    const endpoint = process.env.MINIO_ENDPOINT;
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    const publicUrl = process.env.MINIO_PUBLIC_URL;

    if (!endpoint || !accessKey || !secretKey || !publicUrl) {
      throw new Error(
        'StorageService: MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_PUBLIC_URL must be set',
      );
    }

    this.s3 = new S3Client({
      endpoint,
      region: 'us-east-1', // MinIO ignores region but SDK requires one
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true, // MinIO uses path-style: http://endpoint/bucket/key
    });
    this.publicBaseUrl = publicUrl.replace(/\/$/, '');
    this.logger.log(`StorageService initialized: endpoint=${endpoint} publicBase=${this.publicBaseUrl}`);
  }

  async upload(input: UploadInput): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      }),
    );
    return `${this.publicBaseUrl}/${input.bucket}/${input.key}`;
  }

  async download(input: DownloadInput): Promise<Buffer> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
    );
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async delete(input: DeleteInput): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: input.bucket, Key: input.key }),
    );
  }

  async list(input: ListInput): Promise<string[]> {
    const res = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        MaxKeys: input.maxKeys ?? 1000,
      }),
    );
    return (res.Contents ?? []).map((o) => o.Key as string);
  }

  publicUrl(bucket: string, key: string): string {
    return `${this.publicBaseUrl}/${bucket}/${key}`;
  }
}
```

- [ ] **Step 6.4: Зарегистрировать в CommonModule**

Открыть `~/Downloads/spirits_back/src/common/common.module.ts` и добавить `StorageService` в `providers` и `exports`. Точный diff зависит от текущего содержимого; пример:

```typescript
import { Module, Global } from '@nestjs/common';
import { PgService } from './services/pg.service';
import { RedisService } from './services/redis.service';
import { JwtService } from './services/jwt.service';
import { StorageService } from './services/storage.service';

@Global()
@Module({
  providers: [PgService, RedisService, JwtService, StorageService],
  exports: [PgService, RedisService, JwtService, StorageService],
})
export class CommonModule {}
```

- [ ] **Step 6.5: Пересобрать и прогнать тесты**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -5
cd tests
node runner.js --suite smm 2>&1 | tail -25
```

Ожидаемый вывод: 9 тестов passed (5 crypto + 4 storage).

- [ ] **Step 6.6: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/common/services/storage.service.ts \
        src/common/common.module.ts \
        tests/smm/storage.integration.test.js \
        tests/smm/index.js
git commit -m "feat: add StorageService (MinIO/S3 abstraction) + integration tests"
```

---

## Task 7: SmmPricingService (in-memory кеш тарифов)

**Файлы:**
- Создать: `spirits_back/src/smm/billing/smm-pricing.service.ts`
- Создать: `spirits_back/tests/smm/pricing.integration.test.js`

- [ ] **Step 7.1: Написать failing test**

Создать `~/Downloads/spirits_back/tests/smm/pricing.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const { SmmPricingService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'smm-pricing.service'),
);

// Mock PgService shape — only `query` is used
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = { query: (text, params) => pool.query(text, params) };

module.exports = {
  'pricing: getTariff returns economy and premium': async () => {
    const svc = new SmmPricingService(pg);
    await svc.onModuleInit();
    const economy = svc.getTariff('economy');
    const premium = svc.getTariff('premium');
    if (economy.tokensCost !== 15000) {
      throw new Error(`Expected economy 15000, got ${economy.tokensCost}`);
    }
    if (premium.tokensCost !== 50000) {
      throw new Error(`Expected premium 50000, got ${premium.tokensCost}`);
    }
  },

  'pricing: throws on unknown tariff': async () => {
    const svc = new SmmPricingService(pg);
    await svc.onModuleInit();
    let thrown = null;
    try {
      svc.getTariff('vip');
    } catch (e) {
      thrown = e;
    }
    if (!thrown) throw new Error('Expected error on unknown tariff');
    if (!thrown.message.match(/unknown.+tariff/i)) {
      throw new Error(`Unexpected message: ${thrown.message}`);
    }
  },

  'pricing: refresh picks up DB changes': async () => {
    const svc = new SmmPricingService(pg);
    await svc.onModuleInit();
    // Bump economy price by +1 in DB
    await pool.query(
      `UPDATE smm_pricing SET tokens_cost = tokens_cost + 1 WHERE id = 'economy'`,
    );
    try {
      await svc.refresh();
      const after = svc.getTariff('economy').tokensCost;
      if (after !== 15001) {
        throw new Error(`Expected 15001 after refresh, got ${after}`);
      }
    } finally {
      // restore
      await pool.query(`UPDATE smm_pricing SET tokens_cost = 15000 WHERE id = 'economy'`);
    }
  },
};
```

Добавить импорт в `~/Downloads/spirits_back/tests/smm/index.js`:

```javascript
module.exports = {
  ...require('./crypto.unit.test'),
  ...require('./storage.integration.test'),
  ...require('./pricing.integration.test'),
};
```

- [ ] **Step 7.2: Запустить тест — он должен упасть**

```bash
cd ~/Downloads/spirits_back/tests
node runner.js --suite smm 2>&1 | tail -15
```

Ожидаемый: `Cannot find module '.../dist/smm/billing/smm-pricing.service'`.

- [ ] **Step 7.3: Написать реализацию**

Создать `~/Downloads/spirits_back/src/smm/billing/smm-pricing.service.ts`:

```typescript
// src/smm/billing/smm-pricing.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PgService } from '../../common/services/pg.service';
import { SmmPricing, rowToPricing } from '../entities/smm-pricing.entity';
import { SmmTtsTier } from '../entities/smm-scenario.entity';

@Injectable()
export class SmmPricingService implements OnModuleInit {
  private readonly logger = new Logger(SmmPricingService.name);
  private cache = new Map<SmmTtsTier, SmmPricing>();

  constructor(private readonly pg: PgService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const res = await this.pg.query(
      `SELECT id, tokens_cost, display_name, description, active, updated_at
         FROM smm_pricing WHERE active = true`,
    );
    const next = new Map<SmmTtsTier, SmmPricing>();
    for (const row of res.rows) {
      const p = rowToPricing(row);
      next.set(p.id, p);
    }
    this.cache = next;
    this.logger.log(`Loaded ${next.size} active tariffs`);
  }

  @Interval(5 * 60_000) // refresh every 5 min
  private async tick(): Promise<void> {
    try {
      await this.refresh();
    } catch (err) {
      this.logger.warn(`Failed to refresh pricing: ${(err as Error).message}`);
    }
  }

  getTariff(tier: SmmTtsTier): SmmPricing {
    const t = this.cache.get(tier);
    if (!t) throw new Error(`unknown SMM tariff: ${tier}`);
    return t;
  }

  listActive(): SmmPricing[] {
    return Array.from(this.cache.values());
  }
}
```

- [ ] **Step 7.4: Пересобрать и прогнать**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -5
cd tests
node runner.js --suite smm 2>&1 | tail -15
```

Ожидаемый: 12 passed (предыдущие 9 + 3 новые).

- [ ] **Step 7.5: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/smm/billing/smm-pricing.service.ts \
        tests/smm/pricing.integration.test.js \
        tests/smm/index.js
git commit -m "feat(smm): pricing service with in-memory cache and periodic refresh"
```

---

## Task 8: SmmBillingService (charge / refund / транзакции)

**Файлы:**
- Создать: `spirits_back/src/smm/billing/insufficient-tokens.error.ts`
- Создать: `spirits_back/src/smm/billing/smm-billing.service.ts`
- Создать: `spirits_back/tests/smm/fixtures/admin-user.sql`
- Создать: `spirits_back/tests/smm/billing.integration.test.js`

- [ ] **Step 8.1: Написать InsufficientTokensError**

Создать `~/Downloads/spirits_back/src/smm/billing/insufficient-tokens.error.ts`:

```typescript
// src/smm/billing/insufficient-tokens.error.ts
export class InsufficientTokensError extends Error {
  readonly status = 402;
  constructor(public balance: number, public required: number) {
    super('insufficient_tokens');
    this.name = 'InsufficientTokensError';
  }
}
```

- [ ] **Step 8.2: Подготовить SQL-фикстуру тестового юзера**

Создать `~/Downloads/spirits_back/tests/smm/fixtures/admin-user.sql`:

```sql
-- Test admin user for SMM billing tests.
-- Uses phone-as-user_id convention from spirits_back.
INSERT INTO ai_profiles_consolidated (user_id, isadmin, tokens, updated_at)
VALUES ('70000099999', true, 1000000, now())
ON CONFLICT (user_id) DO UPDATE
  SET isadmin = true, tokens = 1000000, updated_at = now();
```

- [ ] **Step 8.3: Написать failing test**

Создать `~/Downloads/spirits_back/tests/smm/billing.integration.test.js`:

```javascript
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const { SmmBillingService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'smm-billing.service'),
);
const { SmmPricingService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'smm-pricing.service'),
);
const { InsufficientTokensError } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'insufficient-tokens.error'),
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};

const TEST_USER = '70000099999';

async function setBalance(balance) {
  await pool.query(
    `UPDATE ai_profiles_consolidated SET tokens = $1 WHERE user_id = $2`,
    [balance, TEST_USER],
  );
}

async function getBalance() {
  const r = await pool.query(
    `SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1`,
    [TEST_USER],
  );
  return r.rows[0].tokens;
}

async function ensureFixture() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'admin-user.sql'),
    'utf-8',
  );
  await pool.query(sql);
}

async function createScenarioAndVideo() {
  // minimal campaign + scenario + video to attach billing to
  const c = await pool.query(
    `INSERT INTO smm_campaign (user_id, source_mode, requested_count)
     VALUES ($1, 'topic', 1) RETURNING id`,
    [TEST_USER],
  );
  const campaignId = c.rows[0].id;
  const s = await pool.query(
    `INSERT INTO smm_scenario
        (campaign_id, title, assistant_role, dialog, mood, tts_tier)
     VALUES ($1, 't', 'psy', '[]'::jsonb, 'neutral', 'economy')
     RETURNING id`,
    [campaignId],
  );
  const scenarioId = s.rows[0].id;
  const v = await pool.query(
    `INSERT INTO smm_video (scenario_id) VALUES ($1) RETURNING id`,
    [scenarioId],
  );
  return { campaignId, scenarioId, videoId: v.rows[0].id };
}

async function cleanup(campaignId) {
  // cascade deletes scenario, video, ledger rows tied to video
  await pool.query(`DELETE FROM smm_billing_ledger WHERE user_id = $1`, [TEST_USER]);
  await pool.query(`DELETE FROM smm_campaign WHERE id = $1`, [campaignId]);
}

async function buildServices() {
  const pricing = new SmmPricingService(pg);
  await pricing.onModuleInit();
  const billing = new SmmBillingService(pg, pricing);
  return { billing, pricing };
}

module.exports = {
  'billing: charge succeeds when balance is sufficient': async () => {
    await ensureFixture();
    await setBalance(100000);
    const { campaignId, videoId } = await createScenarioAndVideo();
    try {
      const { billing } = await buildServices();
      await billing.charge({ userId: TEST_USER, videoId, tier: 'economy' });
      const after = await getBalance();
      if (after !== 100000 - 15000) {
        throw new Error(`Expected balance ${100000 - 15000}, got ${after}`);
      }
      const ledger = await pool.query(
        `SELECT amount, op, reason FROM smm_billing_ledger WHERE video_id = $1`,
        [videoId],
      );
      if (ledger.rows.length !== 1) throw new Error(`Expected 1 ledger row, got ${ledger.rows.length}`);
      if (ledger.rows[0].op !== 'charge') throw new Error('Expected op=charge');
      if (ledger.rows[0].amount !== 15000) throw new Error(`Expected amount=15000`);
    } finally {
      await cleanup(campaignId);
    }
  },

  'billing: charge throws InsufficientTokensError when balance is too low': async () => {
    await ensureFixture();
    await setBalance(1000);
    const { campaignId, videoId } = await createScenarioAndVideo();
    try {
      const { billing } = await buildServices();
      let thrown = null;
      try {
        await billing.charge({ userId: TEST_USER, videoId, tier: 'premium' });
      } catch (e) {
        thrown = e;
      }
      if (!(thrown instanceof InsufficientTokensError)) {
        throw new Error(`Expected InsufficientTokensError, got: ${thrown && thrown.constructor.name}`);
      }
      // Verify no balance change and no ledger row
      const after = await getBalance();
      if (after !== 1000) throw new Error(`Balance changed: ${after}`);
      const ledger = await pool.query(
        `SELECT count(*)::int as n FROM smm_billing_ledger WHERE video_id = $1`,
        [videoId],
      );
      if (ledger.rows[0].n !== 0) throw new Error(`Expected 0 ledger rows on failed charge`);
    } finally {
      await cleanup(campaignId);
    }
  },

  'billing: refund returns tokens and writes ledger': async () => {
    await ensureFixture();
    await setBalance(100000);
    const { campaignId, videoId } = await createScenarioAndVideo();
    try {
      const { billing } = await buildServices();
      await billing.charge({ userId: TEST_USER, videoId, tier: 'economy' });
      await billing.refund({ videoId, reason: 'render_failed' });
      const after = await getBalance();
      if (after !== 100000) throw new Error(`Expected restored 100000, got ${after}`);
      const ledger = await pool.query(
        `SELECT op, amount FROM smm_billing_ledger
         WHERE video_id = $1 ORDER BY created_at`,
        [videoId],
      );
      if (ledger.rows.length !== 2) throw new Error(`Expected 2 ledger rows, got ${ledger.rows.length}`);
      if (ledger.rows[1].op !== 'refund') throw new Error('Expected second row op=refund');
      if (ledger.rows[1].amount !== -15000) throw new Error(`Expected refund amount -15000`);
    } finally {
      await cleanup(campaignId);
    }
  },

  'billing: refund is idempotent (second refund is no-op)': async () => {
    await ensureFixture();
    await setBalance(100000);
    const { campaignId, videoId } = await createScenarioAndVideo();
    try {
      const { billing } = await buildServices();
      await billing.charge({ userId: TEST_USER, videoId, tier: 'economy' });
      await billing.refund({ videoId, reason: 'render_failed' });
      await billing.refund({ videoId, reason: 'render_failed' });
      const after = await getBalance();
      if (after !== 100000) throw new Error(`Expected 100000 after double refund, got ${after}`);
      const ledger = await pool.query(
        `SELECT count(*)::int as n FROM smm_billing_ledger WHERE video_id = $1`,
        [videoId],
      );
      if (ledger.rows[0].n !== 2) throw new Error(`Expected exactly 2 ledger rows`);
    } finally {
      await cleanup(campaignId);
    }
  },
};
```

Добавить в `~/Downloads/spirits_back/tests/smm/index.js`:

```javascript
module.exports = {
  ...require('./crypto.unit.test'),
  ...require('./storage.integration.test'),
  ...require('./pricing.integration.test'),
  ...require('./billing.integration.test'),
};
```

- [ ] **Step 8.4: Запустить тест — он должен упасть**

```bash
cd ~/Downloads/spirits_back/tests
node runner.js --suite smm 2>&1 | tail -10
```

Ожидаемый: `Cannot find module '.../dist/smm/billing/smm-billing.service'`.

- [ ] **Step 8.5: Написать реализацию SmmBillingService**

Создать `~/Downloads/spirits_back/src/smm/billing/smm-billing.service.ts`:

```typescript
// src/smm/billing/smm-billing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../../common/services/pg.service';
import { SmmPricingService } from './smm-pricing.service';
import { InsufficientTokensError } from './insufficient-tokens.error';
import { SmmTtsTier } from '../entities/smm-scenario.entity';

export interface ChargeInput {
  userId: string;
  videoId: string;
  tier: SmmTtsTier;
}

export interface RefundInput {
  videoId: string;
  reason: string;
}

@Injectable()
export class SmmBillingService {
  private readonly logger = new Logger(SmmBillingService.name);

  constructor(
    private readonly pg: PgService,
    private readonly pricing: SmmPricingService,
  ) {}

  /**
   * Атомарно списать tokens у юзера в счёт ролика.
   * - SELECT FOR UPDATE на балансе → защита от race
   * - INSERT в ledger в одной транзакции
   * - UPDATE smm_video.tokens_charged и status='queued'
   *
   * Бросает InsufficientTokensError если баланса не хватает.
   */
  async charge(input: ChargeInput): Promise<void> {
    const tariff = this.pricing.getTariff(input.tier);
    const cost = tariff.tokensCost;

    const client = await this.pg.getClient();
    try {
      await client.query('BEGIN');
      const balRes = await client.query(
        `SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1 FOR UPDATE`,
        [input.userId],
      );
      if (balRes.rows.length === 0) {
        throw new Error(`User ${input.userId} not found in ai_profiles_consolidated`);
      }
      const balance: number = balRes.rows[0].tokens;
      if (balance < cost) {
        await client.query('ROLLBACK');
        throw new InsufficientTokensError(balance, cost);
      }
      await client.query(
        `UPDATE ai_profiles_consolidated
            SET tokens = tokens - $1, updated_at = now()
          WHERE user_id = $2`,
        [cost, input.userId],
      );
      await client.query(
        `UPDATE smm_video
            SET tokens_charged = $1, status = 'queued'
          WHERE id = $2`,
        [cost, input.videoId],
      );
      await client.query(
        `INSERT INTO smm_billing_ledger
            (user_id, video_id, amount, op, reason)
         VALUES ($1, $2, $3, 'charge', 'queued')`,
        [input.userId, input.videoId, cost],
      );
      await client.query('COMMIT');
      this.logger.log(`Charged ${cost} from ${input.userId} for video ${input.videoId}`);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Возврат — только если был charge для этого video_id и ещё не было refund.
   * Идемпотентен: повторный вызов не возвращает деньги повторно.
   */
  async refund(input: RefundInput): Promise<void> {
    const client = await this.pg.getClient();
    try {
      await client.query('BEGIN');

      // Find the original charge for this video
      const chargeRes = await client.query(
        `SELECT user_id, amount FROM smm_billing_ledger
          WHERE video_id = $1 AND op = 'charge'
          ORDER BY created_at LIMIT 1`,
        [input.videoId],
      );
      if (chargeRes.rows.length === 0) {
        await client.query('ROLLBACK');
        this.logger.warn(`refund: no prior charge for video ${input.videoId}, no-op`);
        return;
      }
      const { user_id: userId, amount } = chargeRes.rows[0];

      // Check if refund already exists
      const refundRes = await client.query(
        `SELECT 1 FROM smm_billing_ledger
          WHERE video_id = $1 AND op = 'refund' LIMIT 1`,
        [input.videoId],
      );
      if (refundRes.rows.length > 0) {
        await client.query('ROLLBACK');
        this.logger.warn(`refund: already refunded video ${input.videoId}, no-op`);
        return;
      }

      // Apply refund
      await client.query(
        `UPDATE ai_profiles_consolidated
            SET tokens = tokens + $1, updated_at = now()
          WHERE user_id = $2`,
        [amount, userId],
      );
      await client.query(
        `INSERT INTO smm_billing_ledger
            (user_id, video_id, amount, op, reason)
         VALUES ($1, $2, $3, 'refund', $4)`,
        [userId, input.videoId, -amount, input.reason],
      );

      await client.query('COMMIT');
      this.logger.log(`Refunded ${amount} to ${userId} for video ${input.videoId}, reason: ${input.reason}`);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }
}
```

- [ ] **Step 8.6: Пересобрать и прогнать тесты**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -5
cd tests
node runner.js --suite smm 2>&1 | tail -15
```

Ожидаемый: 16 passed (9 предыдущих + 3 pricing + 4 billing).

- [ ] **Step 8.7: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/smm/billing/insufficient-tokens.error.ts \
        src/smm/billing/smm-billing.service.ts \
        tests/smm/billing.integration.test.js \
        tests/smm/fixtures/admin-user.sql \
        tests/smm/index.js
git commit -m "feat(smm): atomic charge/refund billing with ledger"
```

---

## Task 9: SmmModule + caркас REST endpoint

**Файлы:**
- Создать: `spirits_back/src/smm/dto/create-campaign.dto.ts`
- Создать: `spirits_back/src/smm/social-accounts/social-account.service.ts`
- Создать: `spirits_back/src/smm/smm.controller.ts`
- Создать: `spirits_back/src/smm/smm.module.ts`
- Изменить: `spirits_back/src/app.module.ts`
- Создать: `spirits_back/tests/smm/campaigns.integration.test.js`

- [ ] **Step 9.1: DTO для создания кампании**

Создать `~/Downloads/spirits_back/src/smm/dto/create-campaign.dto.ts`:

```typescript
// src/smm/dto/create-campaign.dto.ts
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { SmmSourceMode } from '../entities/smm-campaign.entity';

export class CreateCampaignDto {
  @IsIn(['auto', 'topic', 'trends'])
  sourceMode!: SmmSourceMode;

  @IsInt() @Min(1) @Max(20)
  requestedCount!: number;

  @IsOptional() @IsString() @MaxLength(500)
  topic?: string;

  @IsOptional() @IsUUID()
  conversationId?: string;
}
```

- [ ] **Step 9.2: SocialAccountService (минимальный CRUD)**

Создать `~/Downloads/spirits_back/src/smm/social-accounts/social-account.service.ts`:

```typescript
// src/smm/social-accounts/social-account.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../../common/services/pg.service';
import { encryptCredentials } from './credentials.crypto';
import {
  SmmSocialAccount,
  rowToSocialAccount,
} from '../entities/smm-social-account.entity';
import { SmmPlatform } from '../entities/smm-publication.entity';

export interface CreateSocialAccountInput {
  userId: string | null;
  platform: SmmPlatform;
  displayName: string;
  credentialsPlain: Record<string, unknown>;
  expiresAt?: Date | null;
}

@Injectable()
export class SocialAccountService {
  private readonly logger = new Logger(SocialAccountService.name);

  constructor(private readonly pg: PgService) {}

  async create(input: CreateSocialAccountInput): Promise<SmmSocialAccount> {
    const enc = encryptCredentials(input.credentialsPlain);
    const res = await this.pg.query(
      `INSERT INTO smm_social_account
          (user_id, platform, display_name, credentials, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [input.userId, input.platform, input.displayName, JSON.stringify(enc), input.expiresAt ?? null],
    );
    return rowToSocialAccount(res.rows[0]);
  }

  async findById(id: string): Promise<SmmSocialAccount | null> {
    const res = await this.pg.query(
      `SELECT * FROM smm_social_account WHERE id = $1`, [id],
    );
    return res.rows[0] ? rowToSocialAccount(res.rows[0]) : null;
  }

  async listForUser(userId: string | null): Promise<SmmSocialAccount[]> {
    const res = userId
      ? await this.pg.query(
          `SELECT * FROM smm_social_account WHERE user_id = $1 ORDER BY created_at DESC`,
          [userId],
        )
      : await this.pg.query(
          `SELECT * FROM smm_social_account WHERE user_id IS NULL ORDER BY created_at DESC`,
        );
    return res.rows.map(rowToSocialAccount);
  }

  async deleteById(id: string): Promise<boolean> {
    const res = await this.pg.query(
      `DELETE FROM smm_social_account WHERE id = $1`, [id],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
```

- [ ] **Step 9.3: SmmController (каркас)**

Создать `~/Downloads/spirits_back/src/smm/smm.controller.ts`:

```typescript
// src/smm/smm.controller.ts
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PgService } from '../common/services/pg.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { rowToCampaign, SmmCampaign } from './entities/smm-campaign.entity';

@Controller('webhook/smm')
@UseGuards(JwtGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SmmController {
  constructor(private readonly pg: PgService) {}

  @Post('campaigns')
  async createCampaign(
    @Req() req: any,
    @Body() dto: CreateCampaignDto,
  ): Promise<SmmCampaign> {
    const userId = req.user.phone;
    const res = await this.pg.query(
      `INSERT INTO smm_campaign
          (user_id, conversation_id, topic, source_mode, requested_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        dto.conversationId ?? null,
        dto.topic ?? null,
        dto.sourceMode,
        dto.requestedCount,
      ],
    );
    return rowToCampaign(res.rows[0]);
  }

  @Get('campaigns/:id')
  async getCampaign(@Param('id') id: string): Promise<SmmCampaign> {
    const res = await this.pg.query(
      `SELECT * FROM smm_campaign WHERE id = $1`, [id],
    );
    if (res.rows.length === 0) throw new NotFoundException(`campaign ${id} not found`);
    return rowToCampaign(res.rows[0]);
  }
}
```

- [ ] **Step 9.4: SmmModule**

Создать `~/Downloads/spirits_back/src/smm/smm.module.ts`:

```typescript
// src/smm/smm.module.ts
import { Module } from '@nestjs/common';
import { SmmController } from './smm.controller';
import { SmmBillingService } from './billing/smm-billing.service';
import { SmmPricingService } from './billing/smm-pricing.service';
import { SocialAccountService } from './social-accounts/social-account.service';

@Module({
  controllers: [SmmController],
  providers: [
    SmmBillingService,
    SmmPricingService,
    SocialAccountService,
  ],
  exports: [
    SmmBillingService,
    SmmPricingService,
    SocialAccountService,
  ],
})
export class SmmModule {}
```

- [ ] **Step 9.5: Подключить SmmModule к AppModule**

Открыть `~/Downloads/spirits_back/src/app.module.ts`. Добавить импорт:

```typescript
import { SmmModule } from './smm/smm.module';
```

И в `@Module({ imports: [...] })` добавить `SmmModule` в массив `imports`. Точный diff зависит от того, что уже там, но конкретно — между существующими модулями (например, после `VideoModule`).

- [ ] **Step 9.6: Написать integration test для эндпоинтов**

Создать `~/Downloads/spirits_back/tests/smm/campaigns.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const axios = require('axios');
const { Pool } = require('pg');
const config = require('../config');

const BASE_URL = process.env.SMM_API_BASE || config.BASE_URL;
const ADMIN_JWT = process.env.SMM_ADMIN_JWT || '';
const NON_ADMIN_JWT = process.env.SMM_NON_ADMIN_JWT || '';

const http = axios.create({
  baseURL: BASE_URL,
  httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  timeout: 15000,
  validateStatus: () => true,
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  'campaigns POST without JWT → 401': async () => {
    const resp = await http.post('/webhook/smm/campaigns', {
      sourceMode: 'topic', requestedCount: 1,
    });
    if (resp.status !== 401) {
      throw new Error(`Expected 401, got ${resp.status} body=${JSON.stringify(resp.data)}`);
    }
  },

  'campaigns POST with non-admin JWT → 403': async () => {
    if (!NON_ADMIN_JWT) {
      console.log('  (skip: SMM_NON_ADMIN_JWT not set)');
      return;
    }
    const resp = await http.post(
      '/webhook/smm/campaigns',
      { sourceMode: 'topic', requestedCount: 1 },
      { headers: bearer(NON_ADMIN_JWT) },
    );
    if (resp.status !== 403) {
      throw new Error(`Expected 403, got ${resp.status} body=${JSON.stringify(resp.data)}`);
    }
  },

  'campaigns POST with admin JWT → 201 + DB row': async () => {
    if (!ADMIN_JWT) {
      throw new Error('SMM_ADMIN_JWT env var not set — set it after admin user is seeded');
    }
    const resp = await http.post(
      '/webhook/smm/campaigns',
      { sourceMode: 'topic', requestedCount: 2, topic: 'тестовая тема' },
      { headers: bearer(ADMIN_JWT) },
    );
    if (resp.status !== 201 && resp.status !== 200) {
      throw new Error(`Expected 200/201, got ${resp.status} body=${JSON.stringify(resp.data)}`);
    }
    const id = resp.data.id;
    if (!id) throw new Error(`Missing id in response: ${JSON.stringify(resp.data)}`);
    try {
      const r = await pool.query(`SELECT topic, source_mode, requested_count FROM smm_campaign WHERE id = $1`, [id]);
      if (r.rows.length !== 1) throw new Error(`Campaign ${id} not in DB`);
      if (r.rows[0].topic !== 'тестовая тема') throw new Error(`Topic mismatch`);
      if (r.rows[0].source_mode !== 'topic') throw new Error(`Source mode mismatch`);
      if (r.rows[0].requested_count !== 2) throw new Error(`Count mismatch`);
    } finally {
      await pool.query(`DELETE FROM smm_campaign WHERE id = $1`, [id]);
    }
  },

  'campaigns POST with invalid requestedCount → 400': async () => {
    if (!ADMIN_JWT) {
      console.log('  (skip: SMM_ADMIN_JWT not set)');
      return;
    }
    const resp = await http.post(
      '/webhook/smm/campaigns',
      { sourceMode: 'topic', requestedCount: 999 },
      { headers: bearer(ADMIN_JWT) },
    );
    if (resp.status !== 400) {
      throw new Error(`Expected 400, got ${resp.status}`);
    }
  },

  'campaigns GET unknown id → 404': async () => {
    if (!ADMIN_JWT) {
      console.log('  (skip: SMM_ADMIN_JWT not set)');
      return;
    }
    const resp = await http.get(
      '/webhook/smm/campaigns/00000000-0000-0000-0000-000000000000',
      { headers: bearer(ADMIN_JWT) },
    );
    if (resp.status !== 404) {
      throw new Error(`Expected 404, got ${resp.status}`);
    }
  },
};
```

Добавить в `~/Downloads/spirits_back/tests/smm/index.js`:

```javascript
module.exports = {
  ...require('./crypto.unit.test'),
  ...require('./storage.integration.test'),
  ...require('./pricing.integration.test'),
  ...require('./billing.integration.test'),
  ...require('./campaigns.integration.test'),
};
```

- [ ] **Step 9.7: Сборка**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -10
```

Ожидаемый: сборка успешна.

- [ ] **Step 9.8: Запустить локально и проверить эндпоинт без auth**

```bash
cd ~/Downloads/spirits_back
DATABASE_URL="postgresql://linkeon:linkeon_pass_2026@212.113.106.202:5433/linkeon" npm run start:dev &
APP_PID=$!
sleep 8  # Wait for Nest to start
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/webhook/smm/campaigns \
  -H "Content-Type: application/json" \
  -d '{"sourceMode":"topic","requestedCount":1}'
kill $APP_PID 2>/dev/null || true
```

Ожидаемый вывод: `401`.

- [ ] **Step 9.9: Получить admin JWT для следующих тестов**

Test admin использует phone `70000099999` (см. fixtures/admin-user.sql). Для генерации JWT можно использовать существующий механизм проекта.

Способ A — через debug-эндпоинт OTP:

```bash
# Применить фикстуру
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon \
  -f ~/Downloads/spirits_back/tests/smm/fixtures/admin-user.sql

# Получить OTP-код (требует DEBUG_SMS_CODES=true на бэке)
CODE=$(curl -sf https://my.linkeon.io/webhook/debug/sms-code/70000099999 | jq -r '.code')
echo "OTP code: $CODE"

# Запросить SMS (чтобы код был активным)
curl -sf https://my.linkeon.io/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/70000099999 >/dev/null

# Войти через check-code
LOGIN=$(curl -sf "https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/70000099999/$CODE")
ADMIN_JWT=$(echo "$LOGIN" | jq -r '.access_token // .accessToken // .jwt_access_token')
echo "Admin JWT: $ADMIN_JWT"

# Тот же ход для non-admin (70000000000 с isadmin=false)
```

Сохранить в `~/Downloads/spirits_back/tests/.env.local` (gitignored):

```
SMM_ADMIN_JWT=<jwt>
SMM_NON_ADMIN_JWT=<jwt>
SMM_API_BASE=https://my.linkeon.io
```

- [ ] **Step 9.10: Прогнать тесты против локального бэка или staging**

Деплой на dev (или запуск локально с `DATABASE_URL` указывающим на dev-БД):

Для теста через локалку:

```bash
cd ~/Downloads/spirits_back
DATABASE_URL=... npm run start:dev &
sleep 8
cd tests
SMM_API_BASE=http://localhost:3001 \
SMM_ADMIN_JWT=<token> \
SMM_NON_ADMIN_JWT=<token> \
node runner.js --suite smm 2>&1 | tail -20
```

Ожидаемый: 21 passed (16 предыдущих + 5 новых). Если non-admin JWT не задан — 1 тест skipped.

- [ ] **Step 9.11: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/smm/dto/create-campaign.dto.ts \
        src/smm/social-accounts/social-account.service.ts \
        src/smm/smm.controller.ts \
        src/smm/smm.module.ts \
        src/app.module.ts \
        tests/smm/campaigns.integration.test.js \
        tests/smm/index.js
git commit -m "feat(smm): controller + module + campaigns endpoints with admin guard"
```

---

## Task 10: BullMQ-очереди (скелет)

**Файлы:**
- Изменить: `spirits_back/package.json` (добавить bullmq)
- Создать: `spirits_back/src/smm/render/render-queue.service.ts`
- Создать: `spirits_back/src/smm/publication/publish-queue.service.ts`
- Изменить: `spirits_back/src/smm/smm.module.ts`
- Создать: `spirits_back/tests/smm/queues.integration.test.js`

- [ ] **Step 10.1: Установить bullmq**

```bash
cd ~/Downloads/spirits_back
npm install bullmq@^5.0.0 --save
```

- [ ] **Step 10.2: RenderQueueService**

Создать `~/Downloads/spirits_back/src/smm/render/render-queue.service.ts`:

```typescript
// src/smm/render/render-queue.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';

export interface RenderJobPayload {
  videoId: string;
  scenarioId: string;
}

@Injectable()
export class RenderQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenderQueueService.name);
  private queue!: Queue<RenderJobPayload>;

  onModuleInit(): void {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is not set');
    this.queue = new Queue<RenderJobPayload>('smm-render', {
      connection: this.parseRedisUrl(redisUrl),
      defaultJobOptions: {
        attempts: 1, // worker manages own retry via render_state
        removeOnComplete: { age: 3600 * 24 * 7, count: 1000 },
        removeOnFail: { age: 3600 * 24 * 30 },
      },
    });
    this.logger.log('RenderQueueService initialized: queue=smm-render');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueue(
    payload: RenderJobPayload,
    options?: JobsOptions,
  ): Promise<string> {
    const job = await this.queue.add(`render:${payload.videoId}`, payload, options);
    return job.id as string;
  }

  async getJobState(jobId: string): Promise<string | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    return await job.getState();
  }

  /**
   * Internal: returns the underlying queue for advanced operations (peek/count in tests).
   */
  getQueue(): Queue<RenderJobPayload> {
    return this.queue;
  }

  private parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      db: u.pathname && u.pathname !== '/' ? parseInt(u.pathname.slice(1), 10) : 0,
    };
  }
}
```

- [ ] **Step 10.3: PublishQueueService**

Создать `~/Downloads/spirits_back/src/smm/publication/publish-queue.service.ts`:

```typescript
// src/smm/publication/publish-queue.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import { SmmPlatform } from '../entities/smm-publication.entity';

export interface PublishJobPayload {
  publicationId: string;
  videoId: string;
  platform: SmmPlatform;
}

@Injectable()
export class PublishQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishQueueService.name);
  private queue!: Queue<PublishJobPayload>;

  onModuleInit(): void {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is not set');
    this.queue = new Queue<PublishJobPayload>('smm-publish', {
      connection: this.parseRedisUrl(redisUrl),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600 * 24 * 7, count: 1000 },
        removeOnFail: { age: 3600 * 24 * 30 },
      },
    });
    this.logger.log('PublishQueueService initialized: queue=smm-publish');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueue(
    payload: PublishJobPayload,
    options?: JobsOptions,
  ): Promise<string> {
    const job = await this.queue.add(`publish:${payload.platform}:${payload.publicationId}`, payload, options);
    return job.id as string;
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    await job.remove();
    return true;
  }

  getQueue(): Queue<PublishJobPayload> {
    return this.queue;
  }

  private parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      db: u.pathname && u.pathname !== '/' ? parseInt(u.pathname.slice(1), 10) : 0,
    };
  }
}
```

- [ ] **Step 10.4: Подключить в SmmModule**

Изменить `~/Downloads/spirits_back/src/smm/smm.module.ts`:

```typescript
// src/smm/smm.module.ts
import { Module } from '@nestjs/common';
import { SmmController } from './smm.controller';
import { SmmBillingService } from './billing/smm-billing.service';
import { SmmPricingService } from './billing/smm-pricing.service';
import { SocialAccountService } from './social-accounts/social-account.service';
import { RenderQueueService } from './render/render-queue.service';
import { PublishQueueService } from './publication/publish-queue.service';

@Module({
  controllers: [SmmController],
  providers: [
    SmmBillingService,
    SmmPricingService,
    SocialAccountService,
    RenderQueueService,
    PublishQueueService,
  ],
  exports: [
    SmmBillingService,
    SmmPricingService,
    SocialAccountService,
    RenderQueueService,
    PublishQueueService,
  ],
})
export class SmmModule {}
```

- [ ] **Step 10.5: Тест очередей**

Создать `~/Downloads/spirits_back/tests/smm/queues.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { RenderQueueService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'render', 'render-queue.service'),
);
const { PublishQueueService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'publication', 'publish-queue.service'),
);

async function withSvc(Cls, fn) {
  const svc = new Cls();
  svc.onModuleInit();
  try {
    await fn(svc);
  } finally {
    await svc.onModuleDestroy();
  }
}

module.exports = {
  'queues: render enqueue returns job id, state=waiting': async () => {
    await withSvc(RenderQueueService, async (svc) => {
      const jobId = await svc.enqueue({
        videoId: '00000000-0000-0000-0000-000000000001',
        scenarioId: '00000000-0000-0000-0000-000000000002',
      });
      if (!jobId) throw new Error('No job id returned');
      const state = await svc.getJobState(jobId);
      if (state !== 'waiting' && state !== 'delayed') {
        throw new Error(`Expected waiting/delayed, got: ${state}`);
      }
      // cleanup
      const job = await svc.getQueue().getJob(jobId);
      if (job) await job.remove();
    });
  },

  'queues: render delayed job is in delayed state': async () => {
    await withSvc(RenderQueueService, async (svc) => {
      const jobId = await svc.enqueue(
        { videoId: 'v', scenarioId: 's' },
        { delay: 60_000 },
      );
      const state = await svc.getJobState(jobId);
      if (state !== 'delayed') throw new Error(`Expected delayed, got: ${state}`);
      const job = await svc.getQueue().getJob(jobId);
      if (job) await job.remove();
    });
  },

  'queues: publish cancel removes the job': async () => {
    await withSvc(PublishQueueService, async (svc) => {
      const jobId = await svc.enqueue(
        { publicationId: 'p', videoId: 'v', platform: 'telegram' },
        { delay: 60_000 },
      );
      const ok = await svc.cancel(jobId);
      if (!ok) throw new Error('cancel returned false');
      const state = await svc.getJobState(jobId);
      if (state !== null) throw new Error(`Expected null state after cancel, got: ${state}`);
    });
  },
};
```

Добавить в `~/Downloads/spirits_back/tests/smm/index.js`:

```javascript
module.exports = {
  ...require('./crypto.unit.test'),
  ...require('./storage.integration.test'),
  ...require('./pricing.integration.test'),
  ...require('./billing.integration.test'),
  ...require('./campaigns.integration.test'),
  ...require('./queues.integration.test'),
};
```

- [ ] **Step 10.6: Добавить REDIS_URL в env (если нет)**

Проверить:

```bash
grep '^REDIS_URL=' ~/Downloads/spirits_back/.env || echo "not set"
```

Если не задан — добавить (Redis на порту 6380 на dev):

```bash
echo "REDIS_URL=redis://127.0.0.1:6380" >> ~/Downloads/spirits_back/.env
```

(На сервере dev/prod REDIS_URL должен быть уже — но проверим в Plan'е деплоя.)

- [ ] **Step 10.7: Пересборка и тесты**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -5
cd tests
node runner.js --suite smm 2>&1 | tail -15
```

Ожидаемый: 24 passed (21 + 3 queue).

- [ ] **Step 10.8: Smoke-проверка в Redis**

```bash
docker exec -it redis redis-cli -h 127.0.0.1 -p 6379 KEYS 'bull:smm-*'
```

Ожидаемый вывод: после `npm test` очереди есть, но пустые (или содержат `:meta`, `:id` системные ключи).

- [ ] **Step 10.9: Коммит**

```bash
cd ~/Downloads/spirits_back
git add package.json package-lock.json \
        src/smm/render/render-queue.service.ts \
        src/smm/publication/publish-queue.service.ts \
        src/smm/smm.module.ts \
        tests/smm/queues.integration.test.js \
        tests/smm/index.js
git commit -m "feat(smm): BullMQ render and publish queues with skeleton"
```

---

## Task 11: Финальная проверка фундамента

- [ ] **Step 11.1: Полный smoke**

```bash
cd ~/Downloads/spirits_back
npm run build 2>&1 | tail -5
cd tests
node runner.js --suite smm 2>&1
```

Ожидаемый итог:
```
SUITE: smm
============================================================
  ✓ crypto: round-trip plain object
  ✓ crypto: different IV per encryption
  ✓ crypto: tamper detection (modified ciphertext)
  ✓ crypto: tamper detection (modified tag)
  ✓ crypto: throws if SMM_CREDS_SECRET is invalid length
  ✓ storage: upload returns public URL
  ✓ storage: download returns same bytes
  ✓ storage: list returns the key
  ✓ storage: delete removes the object
  ✓ pricing: getTariff returns economy and premium
  ✓ pricing: throws on unknown tariff
  ✓ pricing: refresh picks up DB changes
  ✓ billing: charge succeeds when balance is sufficient
  ✓ billing: charge throws InsufficientTokensError when balance is too low
  ✓ billing: refund returns tokens and writes ledger
  ✓ billing: refund is idempotent (second refund is no-op)
  ✓ campaigns POST without JWT → 401
  ✓ campaigns POST with non-admin JWT → 403
  ✓ campaigns POST with admin JWT → 201 + DB row
  ✓ campaigns POST with invalid requestedCount → 400
  ✓ campaigns GET unknown id → 404
  ✓ queues: render enqueue returns job id, state=waiting
  ✓ queues: render delayed job is in delayed state
  ✓ queues: publish cancel removes the job

PASSED: 24  FAILED: 0  SKIPPED: 0
```

- [ ] **Step 11.2: Деплой на DEV (если ещё не задеплоено)**

На локальной машине:

```bash
ssh dvolkov@212.113.106.202 'cd ~/spirits_back && git pull && npm install && npm run build && npm run migrate && pm2 restart linkeon-api'
```

Ожидаемый вывод: миграции применены, `linkeon-api` рестартован.

- [ ] **Step 11.3: Прогнать тесты против развёрнутого DEV**

```bash
cd ~/Downloads/spirits_back/tests
SMM_API_BASE=https://my.linkeon.io \
SMM_ADMIN_JWT=<свежий jwt> \
SMM_NON_ADMIN_JWT=<свежий jwt> \
node runner.js --suite smm 2>&1 | tail -30
```

Все 24 теста должны пройти.

- [ ] **Step 11.4: Финальный коммит-маркер**

```bash
cd ~/Downloads/spirits_back
git log --oneline -10
echo "Plan 1 (Foundation) complete: $(git rev-parse HEAD)"
```

Никаких файловых изменений, просто отметка в истории. Если хочется зафиксировать — можно создать аннотированный тег:

```bash
git tag -a smm-plan-1-foundation -m "SMM Producer Plan 1: Foundation complete"
git push origin smm-plan-1-foundation 2>/dev/null || echo "(push tag manually if needed)"
```

---

## Self-Review Checklist

Прошёлся по плану свежим взглядом:

**1. Spec coverage:** ✓
- MinIO setup → Task 1
- DB schema (9 таблиц) → Task 3
- Storage abstraction → Task 6
- Credentials crypto → Task 5
- Billing с леджером и идемпотентным refund → Task 8
- Pricing service из БД → Task 7
- REST-каркас с admin guard → Task 9
- BullMQ-очереди → Task 10
- TS entity-типы → Task 4

Что НЕ входит в Plan 1 (по дизайну): TTS-клиенты, image-gen, render-pipeline, AI-продюсер, publishers, OAuth, chat-UX. Это Plans 2-4.

**2. Placeholder scan:** ✓ нет TBD / "implement later" / абстрактных «add error handling». Каждый step содержит конкретный код или конкретную команду.

**3. Type consistency:** ✓
- `SmmTtsTier` импортируется из `smm-scenario.entity` в `smm-pricing.entity` и `billing service` — одна и та же type alias
- `SmmEncryptedCredentials.v` всегда 1, проверяется в `decryptCredentials`
- `RenderJobPayload`/`PublishJobPayload` — отдельные интерфейсы в queue-сервисах, не путаются
- `phone`-as-user_id — единая конвенция (видно в `AdminGuard` и фикстуре)

**4. Тестируемое end-state:** ✓ после Task 11 имеем 24 зелёных теста и работающее API. Демо: создать кампанию → увидеть в БД → подключить (через сервис) соц-аккаунт → видеть зашифрованные creds в БД → списать токены за фейковый видео-id → получить leger запись.

---

## Открытые точки для Plan 2

Когда будем писать Plan 2 (Render Pipeline), нужно учесть из этого плана:

1. `StorageService.upload()` принимает Buffer/Readable — для крупных MP4 нужно использовать `@aws-sdk/lib-storage` Upload для multi-part. Это будет в Plan 2.
2. `RenderJobPayload` — минимальный (videoId+scenarioId). При имплементации воркера может понадобиться больше полей (callbackUrl, secret) — расширим.
3. `SmmBillingService.charge()` сейчас ставит `smm_video.status='queued'`. Воркер сам переведёт в `rendering`/`ready`/`failed`.
4. `render_state` JSONB пока пустой `{}`. Voркер заполняет шаги.
5. Health-эндпоинт `/webhook/smm/admin/health` — не делали в Plan 1. Добавим в Plan 4 (когда есть что мониторить).
