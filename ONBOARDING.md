# Онбординг разработчика

Документ для второго (и последующих) разработчика на проекте **my.linkeon.io**, работающего через Claude Code. Архитектура, эндпоинты, структура кода и команды описаны в [`CLAUDE.md`](./CLAUDE.md) — он подтягивается в Claude Code автоматически. Ниже — то, что нужно дополнительно от владельца проекта и какие правила соблюдать.

## 1. Что запросить у владельца (Дмитрия)

| Доступ | Что именно | Статус |
|--------|------------|--------|
| GitHub | Collaborator в `dvvolkovv/spirits` (этот репо) и `dvvolkovv/spirits_back` (NestJS-бэк) | ✅ выдан |
| SSH на сервера | Прод: `dvolkov@212.113.106.202`. Тест: `dv@85.192.61.231`. Ключ добавлен в `authorized_keys` | ✅ выдан |
| Секреты фронта | `.env` с `VITE_BACKEND_URL=https://my.linkeon.io` (если работаешь только локально — этого достаточно) | запросить |
| Секреты бэка | Содержимое `~/Downloads/spirits_back/.env` (DB, JWT, SMS Aero, YooKassa, OpenAI, Neo4j, Redis). **Только через 1Password / Bitwarden shared vault, не через мессенджеры** | запросить |
| Тестовые аккаунты | Уже описаны в `CLAUDE.md` (раздел «Тестовые аккаунты»). OTP получать через `GET /webhook/debug/sms-code/:phone` | — |

После добавления ключа — для удобства добавь в `~/.ssh/config`:

```
Host linkeon-prod
  HostName 212.113.106.202
  User dvolkov
  IdentityFile ~/.ssh/id_ed25519

Host linkeon-test
  HostName 85.192.61.231
  User dv
  IdentityFile ~/.ssh/id_ed25519
```

Проверка:
```bash
ssh linkeon-prod 'hostname && pm2 list'
ssh linkeon-test 'hostname'
```

## 2. Локальный setup

```bash
mkdir -p ~/Downloads && cd ~/Downloads
git clone git@github.com:dvvolkovv/spirits.git spirits_front
git clone git@github.com:dvvolkovv/spirits_back.git spirits_back
cd spirits_front
pnpm install                # ТОЛЬКО pnpm, не npm/yarn
echo "VITE_BACKEND_URL=https://my.linkeon.io" > .env
pnpm dev                    # Vite на http://localhost:5173
```

Структуру каталогов сохранять — `~/Downloads/spirits_front/` и `~/Downloads/spirits_back/`, потому что скрипты деплоя и пути в `CLAUDE.md` от этого зависят.

Параллельно если нужен локальный бэк — см. `~/Downloads/spirits_back/CLAUDE.md`.

## 3. Git workflow

- **Не пушить напрямую в `main`.** Все изменения через feature-ветку + PR.
- Ветки: `feat/...`, `fix/...`, `chore/...`.
- PR обязательно с описанием что и зачем + ссылкой на тест-план или скриншот для UI.
- Merge после ревью владельца. Squash-merge предпочтителен.

## 4. Деплой

**Боевой деплой — только через `scripts/deploy.sh` в spirits_back:**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

Скрипт билдит фронт, синкает фронт+бэк, рестартит PM2 (`linkeon-api` на :3001) и автоматически прогоняет smoke (unit + API/DB + Playwright).

Правила:
- **Никогда** не деплоить из git-worktree (`.worktrees/`).
- **Никогда** `rsync --delete` — однажды снесло `worker/.env`. Только `rsync -az`.
- Координировать деплои с владельцем — не катить параллельно, не катить чужие незавершённые изменения.
- Если что-то срочное и не уверен — написать владельцу до запуска `deploy.sh`.

## 5. Что НЕ делать без согласования

- Не менять `package.json` зависимости мажорно (React, Vite, Tailwind, react-router) — может сломать сборку.
- Не трогать `vite.config.ts`, `tailwind.config.js`, `tsconfig*.json` без обсуждения.
- Не править `CLAUDE.md` без согласования — это контекст для всех Claude Code сессий.
- Не коммитить `.env`, `.env.local`, ключи, токены — проверь `.gitignore`.
- Не запускать тесты или скрипты против prod (`my.linkeon.io`), которые меняют данные. Для smoke-тестов — тестовые аккаунты из `CLAUDE.md`.
- Не удалять / не переименовывать эндпоинты `/webhook/*` на бэке — формат завязан на фронт и сохраняется для совместимости.

## 6. Работа с Claude Code

- `CLAUDE.md` в корне репозитория уже даёт Claude всю архитектуру, эндпоинты, паттерны и команды — отдельно объяснять не нужно.
- Личная memory Claude Code (`~/.claude/projects/.../memory/`) — твоя приватная, не в репозитории. Можешь туда сохранять свои предпочтения и заметки.
- Если нашёл что-то стоящее общего знания — предложи владельцу добавить в `CLAUDE.md` через PR.
- При работе над крупной фичей — обсудить план с владельцем до кода (используй `superpowers:brainstorming` skill).

### Какие плагины и скилы использует владелец

Чтобы быть в одном контексте — поставь те же:

**Плагины** (через `/plugin install` в Claude Code):
```
/plugin install superpowers@superpowers-dev               # TDD, brainstorming, debugging, planning
/plugin install static-analysis@trailofbits               # статический анализ
/plugin install differential-review@trailofbits           # код-ревью диффов
/plugin install ask-questions-if-underspecified@trailofbits
/plugin install audit-context-building@trailofbits        # security audit context
```

**Кастомные скилы** (`~/.claude/skills/`):
- `frontend-design` — генерация полированного UI
- `flutter-pixel-perfect` — pixel-perfect верстка во Flutter (в spirits не используется, но пусть будет)

Если нужны конкретные версии — попроси у владельца, вышлет архивом.

### Ключевые скилы, которые реально включаются в работе по проекту

- **`superpowers:brainstorming`** — всегда перед новой фичей. Сначала обсудить требования и дизайн, потом код.
- **`superpowers:writing-plans` / `executing-plans`** — для многошаговых задач делается план, потом исполнение с чекпоинтами.
- **`superpowers:test-driven-development`** — TDD по умолчанию для нового кода.
- **`superpowers:systematic-debugging`** — при любом баге/упавшем тесте, до правки.
- **`superpowers:verification-before-completion`** — никаких заявлений «готово» без прогона команды и проверки вывода.
- **`superpowers:using-git-worktrees`** — изоляция фич в worktree (не деплоить из worktree, см. п.4).
- **`commit` / `create-pr`** — стандартный поток коммита и PR.
- **`security-review`** — перед мержем чувствительных изменений.

## 7. Тесты

```bash
cd ~/Downloads/spirits_back/tests
node runner.js --suite api    # 32 API-теста
node runner.js --suite e2e    # 18 E2E с реальной авторизацией
bash referral.e2e.sh          # 20 сценариев рефералки (запуск на сервере)
```

После деплоя smoke прогоняется автоматически из `deploy.sh`.

## 8. Коммуникация

- Срочные вопросы / координация деплоев — написать владельцу напрямую.
- Перед началом работы над задачей — убедиться что её ещё никто не делает (спросить или посмотреть открытые PR/ветки).
