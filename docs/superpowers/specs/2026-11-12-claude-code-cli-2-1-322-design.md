# Обновление Claude Code CLI до 2.1.322 с исключением relay sandbox

**Дата:** 2026-11-12  
**Статус:** дизайн одобрен владельцем; 2026-11-13 добавлено одобренное исключение relay sandbox  
**Целевые версии:** Claude Code CLI `2.1.322`, `@anthropic-ai/claude-agent-sdk` `0.3.322`; relay sandbox остаётся на CLI `2.1.280`

## Цель

Все активные экземпляры Claude Code в проекте, кроме явно исключённого relay sandbox, должны использовать CLI `2.1.322`. Relay sandbox `/opt/linkeon-agent/bin/claude-runtime` и его symlink `/opt/linkeon-agent/bin/claude` остаются на `2.1.280` из-за подтверждённой EROFS-регрессии `2.1.322`. Обновление не должно обрывать текущие ходы ассистентов или продуктовых агентов, обходить штатные rollout-скрипты либо оставлять скрытый старый runtime вне зафиксированного исключения.

Изменение не затрагивает идентификаторы моделей Claude в коде.

## Исходное состояние

Проверка выполнена 2026-11-12. В npm на этот момент опубликованы CLI `2.1.322` и Agent SDK `0.3.322`; SDK `0.3.322` содержит platform-specific CLI `2.1.322`.

| Runtime | Текущая версия | Требуемое действие |
|---|---:|---|
| Mac, Homebrew `claude-code@latest` | 2.1.280 | Обновить через Homebrew |
| Test/dev `85.192.61.231` | 2.1.322 | Только проверить |
| Prod `212.113.106.202`, `/usr/bin/claude` | 2.1.280 | Установить native CLI и атомарно переключить путь |
| Prod, встроенный CLI Agent SDK | 2.1.143 | Обновить зависимость SDK с 0.3.143 до 0.3.322 и выкатить |
| Relay `5.101.115.184`, `/usr/bin/claude` | 2.1.280 | Переключить на native CLI пользователя `dv` |
| Relay, `~/.local/bin/claude` | 2.1.280 | Обновить native-установку |
| Relay sandbox, `/opt/linkeon-agent/bin/claude-runtime` | 2.1.280 | Заменить через версионированный файл и drain |
| Products own `139.59.210.42`, четыре контейнера | 2.1.281 | Пересобрать образ и раскатить |
| Products clients `206.81.17.255`, один контейнер | 2.1.310 | Пересобрать образ и раскатить |

Дополнительно в `relay-agent/package.json` зафиксирована зависимость `@anthropic-ai/claude-code` с lock-файлом на `2.1.97`; она обновляется до `2.1.322`, чтобы следующее развёртывание не восстановило старую версию.

**Implementation note (2026-11-13):** первоначальная цель строки Relay sandbox superseded. После подтверждённой EROFS-регрессии CLI `2.1.322` на sandboxed scratch/output writes владелец одобрил внешний по отношению к этому плану откат только `/opt/linkeon-agent/bin/claude-runtime` на `2.1.280`. Текущее принятое состояние: sandbox `claude-runtime` и `claude` — `2.1.280`, системный CLI и native launcher — `2.1.322`. Повторный Task 8, `relay-runtime-2.1.322.sh` и любые другие upgrade/rollback-запуски для sandbox запрещены до отдельного исправления EROFS и нового разрешения владельца.

## Ограничения

- Не менять модели, промпты или продуктовое поведение, кроме совместимости, обязательной для новых SDK/CLI.
- Не использовать `sudo npm install -g`: актуальная документация Claude Code не рекомендует этот путь. Native installation является рекомендованным способом.
- Не перезаписывать исполняемый файл, который используется активным процессом. CLI может читать части executable после запуска.
- Не перезапускать backend при живых чат-ходах или звонках; не пересоздавать продуктовый контейнер при живом задании.
- Не редактировать проектные файлы на серверах вручную. Backend выкатывается через `scripts/deploy.sh`, relay — через `scripts/deploy-relay.sh`, продуктовые образы — через `scripts/product-image-roll.sh` и PHASE 4.
- На Linux/npm, relay runtime и Docker images старые бинарники и образы в рамках задачи не удалять: они нужны для отката. На Mac штатный brew upgrade удалил прежний cask 2.1.280; явный brew cleanup не запускался, но Homebrew дополнительно выполнил автоматическую периодическую очистку formula/dependency/cache. Локальной копии Mac CLI 2.1.280 не осталось.
- Сборки и тесты выполнять на test-ноде, не на Mac.

## Выбранный подход

Координированное обновление парка на целевую версию `2.1.322` с поддерживаемыми установщиками, версионированными бинарниками, атомарным переключением ссылок и штатными rollout-скриптами. Единственное принятое исключение — relay sandbox на `2.1.280`; он не участвует в дальнейших переключениях в рамках этого изменения.

Рассмотренные альтернативы:

1. **Два независимых этапа:** сначала основные CLI, затем SDK и продуктовые контейнеры. Уменьшает объём одного этапа, но оставляет смешанный парк версий и требует два окна выката.
2. **In-place upgrade через root npm и внутри контейнеров:** короче, но противоречит документации, оставляет drift и создаёт риск для активных процессов.
3. **Системные apt-пакеты:** поддерживаемый вариант, но потребовал бы замены npm-owned `/usr/bin/claude`, нового apt-репозитория и более сложного отката. Native CLI уже используется на relay и подходит обеим Linux-машинам.

## Компоненты изменения

### 1. Mac и test/dev

На Mac выполняется `brew upgrade --cask claude-code@latest`. Проверяются `claude --version` и `claude doctor`.

На test/dev ничего не переустанавливается. Проверяются PATH-версия и `/usr/bin/claude`; обе должны остаться `2.1.322`.

**Implementation note (2026-11-13):** после внешнего npm update test/dev до `2.1.323` владелец сохранил цель `2.1.322` и разрешил точечное восстановление только системного CLI без полного redeploy. Выбран official versioned native installer с атомарным переключением nvm launcher и `/usr/bin/claude` через temporary symlink + `mv -Tf`, а не in-place npm downgrade, чтобы не перезаписывать executable активных dev-сессий. Процессы не завершались; accepted relay sandbox остаётся `2.1.280`. После installer прежняя npm-установка `2.1.323` оказалась удалена из nvm scope без явного `npm uninstall`/cleanup; повторная установка не выполнялась, это остаточный concern.

### 2. Системные CLI на prod и relay

На prod под пользователем `dvolkov` и на relay под `dv` устанавливается точная native-версия `2.1.322`. Существующая native-установка relay обновляется тем же механизмом.

После успешной проверки версии `/usr/bin/claude` атомарно переключается на управляемый launcher в домашнем каталоге соответствующего пользователя:

- prod: `/home/dvolkov/.local/bin/claude`;
- relay: `/home/dv/.local/bin/claude`.

Абсолютный путь, который вызывает backend, остаётся неизменным. Прежняя npm-установка и её целевой бинарник сохраняются для отката, но перестают быть активным путём. Restart backend для этого переключения не требуется.

Управляемые native auto-updates остаются включёнными намеренно, поскольку целевой канал — latest. Точные версии native launcher и `/usr/bin/claude` перепроверяются непосредственно перед relay drain; глобальное отключение обновлений не применяется.

### 3. Relay sandbox runtime

**Историческая процедура 2026-11-12, не инструкция к повтору.** Её результат на `2.1.322` superseded откатом 2026-11-13; текущий accepted sandbox — `2.1.280`. Не запускать эту процедуру или связанный upgrade-script повторно до отдельного исправления и нового разрешения владельца.

Для первоначальной замены `/opt/linkeon-agent/bin/claude-runtime` использовался тот же drain-протокол и lock `/tmp/linkeon-relay-deploy.lock`, что у штатного relay rollout:

1. Проверить отсутствие чужого drain и rollout.
2. Атомарно создать `/tmp/linkeon-relay-drain`; новые `/chat` получают 503, `/health` остаётся доступным.
3. Дождаться `inflight=0` и отсутствия PM2 children не дольше 1800 секунд.
4. Сохранить прежний runtime как версионированный backup, установить новый бинарник как `claude-runtime-2.1.322` и атомарно переключить `claude-runtime` на него. Существующий symlink `claude` не меняется.
5. Проверить `--version` по всем трём путям и health relay. Только после успешных проверок снять drain.
6. При ошибке оставить admission закрытым, вернуть прежний runtime и проверить rollback health прежде чем открывать приём ходов.

Обновление `relay-agent/package.json` и lock-файла выкатывается отдельно штатным `scripts/deploy-relay.sh <BASE_SHA> <TARGET_SHA>`; оно не переключает sandbox runtime.

Исключение sandbox не распространяется на backend и products. Product-runner `src/claude.ts:141-149` вызывает CLI с `--permission-mode bypassPermissions` и использует границу product-контейнера, а не relay sandbox policy. Backend Agent SDK call sites используют `settingSources: []` и Read-only либо пустой набор встроенных инструментов; они не пишут в relay scratch/output. Поэтому backend SDK и product CLI продолжают обновляться до `2.1.322`, а relay sandbox остаётся нетронутым на `2.1.280`.

### 4. Backend Agent SDK

В свежем `origin/main` backend обновляются:

- `package.json`: `@anthropic-ai/claude-agent-sdk` до `^0.3.322`;
- `package-lock.json`: основной пакет и все platform-specific optional dependencies до `0.3.322`.

Используется `npm`, не `pnpm`. После выката встроенный бинарник `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` должен сообщать `2.1.322`.

### 5. Совместимость Agent SDK 0.3.143 → 0.3.322

Три production call site уже задают ключевые ограничения явно:

- `src/chat/chat.controller.ts`: `tools: ['Read']`, `permissionMode: 'default'`, `canUseTool`, `settingSources: []`;
- `src/misc/misc.service.ts`: `tools: []`, `permissionMode: 'bypassPermissions'`, `settingSources: []`;
- `src/support/support.service.ts`: `tools: []`, `permissionMode: 'dontAsk'`, `allowedTools: ['mcp__support-tools']`, `settingSources: []`.

Поэтому изменение omitted `permissionMode` в 0.3.302 не должно менять их режим. Статический guard `sdk-tools-lockdown.guard.spec.ts` сохраняется обязательным.

Из changelog требуют проверки:

- изменение набора инструментов по умолчанию и embedded `find`/`grep`;
- снятие ограничения nested subagents и fork subagents по умолчанию;
- recording custom system prompts и необходимость `snapshot: false` только для per-request rendering;
- ограничения MCP result/description sizes;
- изменения hook input validation и permission callbacks;
- минимальная Node.js-версия SDK 18.14 и CLI 22 для npm-установки. На test/dev используется Node 22; native CLI на prod не зависит от системного Node 20, а NestJS остаётся на поддерживаемой версией SDK среде.

Никакие preemptive-изменения промптов или permission settings не вносятся без красного теста. Если проверка выявит регрессию, исправление делается отдельным минимальным изменением с тестом.

### 6. Продуктовые Docker-образы

В `product-runner/docker/Dockerfile` CLI закрепляется как `@anthropic-ai/claude-code@2.1.322`; PM2 остаётся без изменений. Комментарий обновляется: версия CLI фиксируется для проверенного и воспроизводимого обновления парка, а следующий bump выполняется осознанно.

Изменение Dockerfile меняет manifest образа и позволяет штатной PHASE 4 собрать новый tag. До боевого rollout:

1. `DRY_RUN=1 SOURCE_SHA=<target> scripts/product-image-roll.sh root@139.59.210.42`;
2. `REHEARSE=claude-21322 SOURCE_SHA=<target> scripts/product-image-roll.sh root@139.59.210.42`;
3. проверить CLI `2.1.322` и health репетиционного контейнера.

Затем полный `deploy.sh` раскатывает backend и PHASE 4 на own/clients. Скрипт сохраняет настройки контейнеров, пропускает спящие продукты, не пересоздаёт контейнер с живым заданием и не двигает `base` при красной проверке.

## Проверки до выката

На test-ноде в CI-клоне на конкретном SHA:

- `npm ci` в backend;
- `npx tsc -p tsconfig.build.json`;
- focused Jest для трёх SDK consumers, `sdk-tools-lockdown.guard.spec.ts` и смежных guards;
- тесты `relay-agent` на Node `node:test`;
- проверка, что lock содержит только SDK `0.3.322` и platform binaries `0.3.322`;
- `DRY_RUN` продуктового rollout;
- отсутствие параллельных deploy на Mac и test-ноде, доступ ко всем обязательным фазам.

Полный `scripts/deploy.sh` запускается без `PROD_ONLY`, `TEST_ONLY` или smoke-skip флагов из свежих клонов `main` после push целевого SHA.

## Критерии успеха

- Все перечисленные активные CLI, кроме явно исключённого relay sandbox, сообщают `2.1.322 (Claude Code)`.
- Встроенный Agent SDK binary на test и prod сообщает `2.1.322`.
- Relay `/usr/bin/claude` и пользовательский native launcher сообщают `2.1.322`; sandbox `claude` и `claude-runtime` сообщают `2.1.280`. Наличие активных sandbox-процессов на `2.1.280` ожидаемо и не является ошибкой.
- Каждый запущенный продуктовый контейнер на own/clients сообщает `2.1.322`; спящие контейнеры проверяются после пробуждения отдельно.
- `deploy-relay.sh`, полный `deploy.sh` и их health/smoke завершились успешно; ни один из них не переключил accepted sandbox.
- Drain markers сняты только после зелёного health; неожиданных активных процессов старого npm runtime `/usr/lib/node_modules/@anthropic-ai/claude-code` не осталось. Это ограничение не относится к ожидаемым sandbox-процессам `2.1.280`.
- Никаких изменений model ID или не связанных с обновлением файлов нет.

## Откат

- **Linux system CLI:** атомарно вернуть прежний symlink на сохранённый npm binary 2.1.280; старые бинарники не удалялись.
- **Mac:** мгновенный symlink rollback недоступен: upgrade удалил прежний cask 2.1.280. Не выполнять rollback вслепую. При необходимости отдельно согласовать повторное получение точного артефакта 2.1.280 из официального источника, проверить версию и целостность и установить его.
- **Relay sandbox:** откат на сохранённый `2.1.280` уже выполнен внешней сессией 2026-11-13 с разрешения владельца после EROFS-регрессии. Это текущее accepted state, а не отложенный rollback-шаг. Не повторять Task 8 или upgrade/rollback-script и не менять sandbox при откате других компонентов. Любое будущее изменение sandbox требует отдельного исправления EROFS и нового разрешения владельца. Relay code откатывается `deploy-relay.sh` на `BASE_SHA` без переключения sandbox runtime.
- **Agent SDK:** отдельный revert коммита зависимости и полный `deploy.sh`.
- **Продуктовые контейнеры:** штатный rollback на предыдущий image ID; `base` не переключается после неуспешной проверки.

Любая неуспешная проверка health при закрытом admission оставляет admission закрытым до восстановления и проверки рабочего состояния.
