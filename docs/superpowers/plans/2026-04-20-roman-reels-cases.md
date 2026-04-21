# Roman Reels Cases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Прогнать 6 промптов через Романа на my.linkeon.io в мобильном viewport, собрать реальные артефакты (HTML/PDF/xlsx/csv/docx/текст), подготовить чек-лист съёмки для пользователя.

**Architecture:** Operational plan (без кода). Claude управляет Playwright-сессией и вебовским UI my.linkeon.io. После каждого кейса: сохраняет артефакт в `screenshots/roman-reels/<case-N>/`, делает запасные попытки при фейле, применяет fallback. В конце — один короткий `shooting-checklist.md` для съёмки.

**Tech Stack:** Playwright MCP (browser_navigate/type/click/take_screenshot/evaluate), Bash для скачивания артефактов (curl), Write для фейкового прайса и чек-листа.

**Спек:** [docs/superpowers/specs/2026-04-20-roman-reels-cases-design.md](../specs/2026-04-20-roman-reels-cases-design.md)

**Общие условия всех тасков:**
- Мобильный viewport 390×844 уже выставлен в текущей Playwright-сессии
- Пользователь залогинен как Дмитрий (+79030169187) на https://my.linkeon.io
- Текущий ассистент в чате — Роман
- Папка для артефактов: `/Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/` (создаём в Task 0)

---

### Task 0: Подготовка рабочего окружения

**Files:**
- Create: `screenshots/roman-reels/` (директория)
- Create: `screenshots/roman-reels/case-4-price-ru.png` (фейковый прайс парикмахерской для кейса #4)

- [ ] **Step 1: Создать директорию**

```bash
mkdir -p /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels
```

Expected: директория создана без вывода.

- [ ] **Step 2: Сгенерить фейковый прайс парикмахерской**

Вариант A (текстовый, проще): написать `price-ru.txt` с 12 позициями.

```bash
cat > /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-4-price-ru.txt <<'EOF'
Прайс-лист парикмахерской "Лён"

Женская стрижка — 2500 ₽
Мужская стрижка — 1500 ₽
Детская стрижка (до 10 лет) — 1200 ₽
Окрашивание в один тон — 4500 ₽
Сложное окрашивание (балаяж, шатуш) — 8500 ₽
Мелирование — 5500 ₽
Тонирование — 2800 ₽
Укладка — 1800 ₽
Вечерняя причёска — 3500 ₽
Свадебная причёска — 5000 ₷
Кератиновое выпрямление — 6500 ₽
Ботокс для волос — 4000 ₽
EOF
```

Ошибку «5000 ₷» исправить на «5000 ₽» — проверить вывод `cat` и убедиться что все валюты правильные.

Вариант B (если есть желание): сгенерить PNG-картинку прайса через `/image-gen` на my.linkeon.io. Риск: длинные списки текста в image-gen получаются криво. **Приоритет — вариант A (TXT)**, B оставляем как план C.

- [ ] **Step 3: Убедиться, что залогинены и на чате с Романом**

```
mcp__playwright__browser_navigate → https://my.linkeon.io/chat
mcp__playwright__browser_snapshot (depth 3)
```

Expected: видно `button "Роман Роман Ассистент"` в хедере или возможность её выбрать. Если ассистент другой — тапнуть «Все ассистенты» → выбрать Романа.

- [ ] **Step 4: Коммит не делаем** (операционные материалы, пользователь решит сам)

---

### Task 1: Валидация Кейса 1 — Лендинг йога-студии (HTML)

**Files:**
- Create: `screenshots/roman-reels/case-1/prompt.png` (скрин чата с промптом в поле ввода)
- Create: `screenshots/roman-reels/case-1/response.png` (скрин ответа Романа со ссылкой)
- Create: `screenshots/roman-reels/case-1/index.html` (скачанный артефакт)
- Create: `screenshots/roman-reels/case-1/artifact-rendered.png` (скрин открытого лендинга в мобильном браузере)

**Промпт (для Романа):**
> Сделай лендинг одной страницей для моей йога-студии. Название — "Дыхание". Оффер: 10 занятий за 4 900 ₽ вместо 7 000 ₽ для новичков. Добавь форму записи, расписание на неделю и кнопку "Записаться". Минимализм, пастельные тона. Сохрани как index.html

- [ ] **Step 1: Создать папку кейса**

```bash
mkdir -p /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-1
```

- [ ] **Step 2: Вставить промпт в поле ввода (НЕ отправлять), снять скриншот «до»**

```
mcp__playwright__browser_type → textbox "Напишите сообщение...", text="<PROMPT>", slowly=false, submit=false
mcp__playwright__browser_take_screenshot → filename "screenshots/roman-reels/case-1/prompt.png"
```

Expected: промпт видно в поле, кнопка отправки активна.

- [ ] **Step 3: Отправить промпт**

```
mcp__playwright__browser_press_key → Enter
```

ИЛИ если Enter не отправляет — нажать кнопку «отправить» (самую правую иконку-стрелку в input-bar).

- [ ] **Step 4: Дождаться завершения генерации (макс 3 мин)**

Ожидаем появления ссылки-файла в ответе. Роман обычно пишет `[Скачать index.html](https://r.linkeon.io/...)`.

```
mcp__playwright__browser_wait_for → text="Скачать", time=180
```

Если `wait_for` по тексту не работает — делать `browser_snapshot` каждые 15 сек и смотреть, появилась ли ссылка.

Expected: в чате есть ссылка вида `https://r.linkeon.io/files/.../index.html`.

- [ ] **Step 5: Снять скриншот ответа**

```
mcp__playwright__browser_take_screenshot → filename "screenshots/roman-reels/case-1/response.png"
```

- [ ] **Step 6: Извлечь URL артефакта и скачать**

Через `browser_evaluate` достать href ссылки «Скачать»:

```
mcp__playwright__browser_evaluate → function:
() => {
  const link = Array.from(document.querySelectorAll('a')).find(a => /скачать|index\.html/i.test(a.textContent));
  return link ? link.href : null;
}
```

Expected: возвращается URL. Сохранить в переменную `ARTIFACT_URL`.

```bash
curl -sSL "<ARTIFACT_URL>" -o /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-1/index.html
ls -la /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-1/index.html
```

Expected: файл > 500 байт, начинается с `<!DOCTYPE html>` или `<html`.

- [ ] **Step 7: Открыть артефакт в мобильном viewport и снять финальный скрин**

```
mcp__playwright__browser_navigate → file:///Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-1/index.html
mcp__playwright__browser_wait_for → time=2
mcp__playwright__browser_take_screenshot → filename "screenshots/roman-reels/case-1/artifact-rendered.png"
```

Expected: на скриншоте видно название "Дыхание", оффер 4900 ₽, кнопка «Записаться». Пастельные тона.

- [ ] **Step 8: Вернуться на чат Романа**

```
mcp__playwright__browser_navigate → https://my.linkeon.io/chat
mcp__playwright__browser_wait_for → time=2
```

- [ ] **Step 9: Оценить результат, пометить в таск-списке**

- Если всё ок — пометить `case-1: OK`.
- Если лендинг кривой / пустой / без стилей — сделать одну попытку с уточнённым промптом: *«Перепиши лендинг — добавь встроенные CSS-стили в `<style>`, сделай минимализм, пастельные бежево-зелёные тона, кнопку CTA зелёную»*. Повторить шаги 2–7.
- Если и со второй попытки не получилось — пометить `case-1: FAIL` и в итоговом отчёте предложить пользователю решать руками или заменить запасным.

---

### Task 2: Валидация Кейса 2 — 5 постов Telegram (текст)

**Files:**
- Create: `screenshots/roman-reels/case-2/prompt.png`
- Create: `screenshots/roman-reels/case-2/response-1.png`
- Create: `screenshots/roman-reels/case-2/response-2.png` (прокрутка, если 5 постов не влезли)
- Create: `screenshots/roman-reels/case-2/posts.md` (полный текст постов скопированный из чата)

**Промпт:**
> Напиши 5 постов для Telegram-канала про запуск онлайн-курса "3 месяца — новый финплан". Аудитория — молодые родители 25–35. Форматы: анонс, бэкстейдж, цитата-провокация, отзыв, призыв. По 500–800 знаков, эмодзи

- [ ] **Step 1: Создать папку**

```bash
mkdir -p /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-2
```

- [ ] **Step 2–5: Вставить промпт, отправить, дождаться, снять 2 скриншота**

Идентично Task 1 (Steps 2–5), но ждём не ссылку, а просто завершения стрима. Критерий завершения: появилось 5 распознаваемых постов (5 секций с эмодзи в начале).

```
mcp__playwright__browser_take_screenshot → filename "screenshots/roman-reels/case-2/response-1.png"
```

Проскроллить чат вниз:

```
mcp__playwright__browser_press_key → End
mcp__playwright__browser_take_screenshot → filename "screenshots/roman-reels/case-2/response-2.png"
```

- [ ] **Step 6: Сохранить текст постов в `posts.md`**

Через `browser_evaluate` получить текст последнего сообщения ассистента:

```
mcp__playwright__browser_evaluate → function:
() => {
  const msgs = document.querySelectorAll('[class*="message"], [class*="chat-message"]');
  const last = msgs[msgs.length - 1];
  return last ? last.innerText : null;
}
```

Если структура другая — через `browser_snapshot` найти ref последнего сообщения, достать текст.

Сохранить результат в `case-2/posts.md`.

- [ ] **Step 7: Оценить**

Критерий OK: 5 постов, каждый в указанном формате, с эмодзи, 500–800 знаков каждый. Если меньше 5 или постов нет — перегенерировать с уточнением *«Оформи ровно 5 постов, каждый пронумеруй, используй эмодзи. Пост 1: анонс, Пост 2: бэкстейдж, Пост 3: цитата-провокация, Пост 4: отзыв, Пост 5: призыв»*.

---

### Task 3: Валидация Кейса 3 — Договор самозанятого (.docx)

**Files:**
- Create: `screenshots/roman-reels/case-3/prompt.png`
- Create: `screenshots/roman-reels/case-3/response.png`
- Create: `screenshots/roman-reels/case-3/contract.docx` (или `.pdf`/`.txt` при fallback)
- Create: `screenshots/roman-reels/case-3/artifact-rendered.png` (опционально — скрин открытого файла на десктопе, если возможно)

**Промпт:**
> Составь договор оказания услуг с самозанятым на 80 000 ₽/мес. Заказчик — ИП Волков Д.В., ИНН 770100123456. Исполнитель — самозанятый Иванов И.И., ИНН 770200654321. Услуги — SMM-ведение Instagram, 3 мес. Сохрани как .docx

- [ ] **Step 1-5: Стандартная последовательность** (см. Task 1 Steps 1–5, с путями `case-3/`)

- [ ] **Step 6: Извлечь ссылку и скачать**

Как в Task 1 Step 6, но сохранить в `case-3/contract.docx`.

- [ ] **Step 7: Проверить файл**

```bash
file /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-3/contract.docx
unzip -l /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-3/contract.docx | head -20
```

Expected: `.docx` is a valid ZIP (Office Open XML). В выводе `unzip -l` должны быть `word/document.xml`, `[Content_Types].xml`.

Если Роман отдал не `.docx`, а `.txt` или `.md` — это **fallback**: пометить `case-3: FALLBACK-TXT`, сохранить как есть.

- [ ] **Step 8: Оценить содержимое**

Открыть файл:

```bash
unzip -p /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-3/contract.docx word/document.xml | grep -oE '[А-Яа-я0-9 .,"-]{10,}' | head -40
```

Критерий OK: в тексте есть «Волков», «Иванов», «80 000», «SMM», реквизиты ИНН, 3 раздела договора (Предмет / Стоимость / Срок).

Если чего-то нет — одна попытка перегенерить.

---

### Task 4: Валидация Кейса 4 — Прайс в Excel

**Files:**
- Create: `screenshots/roman-reels/case-4/prompt-before-upload.png`
- Create: `screenshots/roman-reels/case-4/prompt-after-upload.png`
- Create: `screenshots/roman-reels/case-4/response.png`
- Create: `screenshots/roman-reels/case-4/price_en.xlsx` (или `.csv` fallback)
- Create: `screenshots/roman-reels/case-4/artifact-rendered.png`

**Промпт (после загрузки файла):**
> Переведи прайс на английский, оформи в Excel две колонки RU/EN, сохрани как price_en.xlsx

- [ ] **Step 1: Создать папку**

```bash
mkdir -p /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-4
```

- [ ] **Step 2: Залить файл `case-4-price-ru.txt` через кнопку «Загрузить файл»**

В интерфейсе чата Романа есть кнопка paperclip (см. snapshot предыдущих сессий: `button "Загрузить файл"`).

```
mcp__playwright__browser_click → button "Загрузить файл"
mcp__playwright__browser_file_upload → /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-4-price-ru.txt
```

(Если `browser_file_upload` требует иной ref — использовать диалог file-picker.)

Expected: под полем ввода появляется preview/chip с именем файла.

Снять скриншот:

```
mcp__playwright__browser_take_screenshot → filename "screenshots/roman-reels/case-4/prompt-before-upload.png"
```

- [ ] **Step 3: Вставить промпт, снять скриншот «после»**

```
mcp__playwright__browser_type → textbox, text=<PROMPT>
mcp__playwright__browser_take_screenshot → filename "screenshots/roman-reels/case-4/prompt-after-upload.png"
```

- [ ] **Step 4-6: Отправка, ожидание, скачивание** (как в Task 3)

Сохранить как `case-4/price_en.xlsx`.

- [ ] **Step 7: Проверить файл**

```bash
file /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-4/price_en.xlsx
unzip -l /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-4/price_en.xlsx 2>&1 | head -10
```

Expected: `.xlsx` — валидный ZIP. Если нет — fallback на `.csv`:

```bash
head -20 /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-4/price_en.csv
```

Критерий OK: 2 колонки с заголовками RU/EN (или `Русский/English`), 12 строк перевода, английские названия корректные.

---

### Task 5: Валидация Кейса 5 — 10 компаний лазерной резки (CSV)

**Files:**
- Create: `screenshots/roman-reels/case-5/prompt.png`
- Create: `screenshots/roman-reels/case-5/response.png`
- Create: `screenshots/roman-reels/case-5/companies.csv`
- Create: `screenshots/roman-reels/case-5/artifact-rendered.png`

**Промпт:**
> Найди 10 компаний в Москве, которые делают лазерную резку металла. Собери название, сайт, телефон, район. Оформи как CSV

- [ ] **Step 1-7: Стандартная последовательность** (как Task 1-3)

- [ ] **Step 8: Проверить CSV на адекватность**

```bash
wc -l /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-5/companies.csv
head /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-5/companies.csv
```

Expected: ≥ 8 строк данных + заголовок. Каждая строка — 4 поля (название, сайт, телефон, район).

Критерий OK: ≥ 8 из 10 записей выглядят реалистично (не `example.com`, не выдуманные телефоны типа `+7 000 000 00 00`).

Если < 8 реальных — пометить как `case-5: PARTIAL` и в чек-листе предупредить: «для съёмки подредактировать руками».

---

### Task 6: Валидация Кейса 6 — PDF-отчёт по конкурентам (высокий риск)

**Files:**
- Create: `screenshots/roman-reels/case-6/prompt.png`
- Create: `screenshots/roman-reels/case-6/response.png`
- Create: `screenshots/roman-reels/case-6/report.pdf`
- Create: `screenshots/roman-reels/case-6/artifact-rendered.png`

**Промпт:**
> Собери отчёт по конкурентам в нише "пилатес-студия Санкт-Петербург". Найди 10 студий: название, район, средний чек, оценку, число отзывов. Сравни в таблице, построй график цен. Сохрани как PDF

- [ ] **Step 1-6: Стандартная последовательность, timeout увеличить до 5 минут**

```
mcp__playwright__browser_wait_for → text="Скачать", time=300
```

- [ ] **Step 7: Проверить PDF**

```bash
file /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-6/report.pdf
pdfinfo /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-6/report.pdf 2>&1 | head -10
```

(pdfinfo установлен? Если нет: `brew install poppler`.)

Expected: валидный PDF, ≥ 2 страницы.

- [ ] **Step 8: Открыть первую страницу как картинку**

```bash
pdftoppm -r 150 -f 1 -l 1 -png \
  /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-6/report.pdf \
  /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/case-6/artifact-rendered
```

Получается `artifact-rendered-1.png`. Переименовать в `artifact-rendered.png`.

- [ ] **Step 9: Оценить**

Критерий OK: в PDF есть таблица студий и график цен. Если график отсутствует — попытаться одним уточнением: *«Добавь в PDF график — горизонтальный барчарт со средними чеками по всем студиям. Используй matplotlib»*. Если снова без графика — применить fallback:

**Fallback сценарии для Кейса 6:**
1. **«Таблица+график в чате»**: попросить Романа построить markdown-таблицу и ASCII/Unicode барчарт в тексте. Записать как `case-6/report.md`. Пометить `case-6: FALLBACK-MD`.
2. **Замена кейсом #7 unit-экономики:** промпт *«Посчитай unit-экономику: продукт 3 000 ₽, себестоимость 1 200 ₽, реклама 800 ₽/лид, конверсия 15%. Оформи таблицу маржа/CAC/LTV и вердикт прибыльно/нет»*. Сохранить в `case-6-alt/`.

Выбрать fallback по результату согласно реальному качеству.

---

### Task 7: Составить чек-лист съёмки для пользователя

**Files:**
- Create: `screenshots/roman-reels/shooting-checklist.md`

- [ ] **Step 1: Написать чек-лист**

Содержит:
- Итоговые статусы каждого кейса (OK / FALLBACK / FAIL)
- Финальные промпты слово-в-слово, готовые к вставке в поле чата (учитывая что некоторые могли быть переформулированы в процессе валидации)
- Для кейса #4 — явное напоминание «сначала залить файл `case-4-price-ru.txt`, потом вставить промпт»
- Тайминг из §4 спека
- Инструкция по подключению iPhone → QuickTime → запись
- Список артефактов, которые нужно держать открытыми на десктопе для врезок

Пример структуры чек-листа:

```markdown
# Съёмка Roman Reels — чек-лист

## Перед стартом
1. Подключить iPhone к Mac (USB)
2. QuickTime Player → File → New Movie Recording → источник = iPhone
3. На iPhone открыть Safari → my.linkeon.io → убедиться что залогинен как +79030169187
4. Выбрать ассистента Роман
5. Положить на десктоп файлы для врезок: `screenshots/roman-reels/case-*/artifact-rendered.png`

## Кейс 1 — Лендинг (статус: OK)
**Промпт:** <вставить слово-в-слово>
**Ожидаемое время генерации:** ~30 сек
**Что ловить на запись:** стриминг ответа → ссылка → тап → лендинг на весь экран
**Артефакт на десктопе для врезки:** `case-1/artifact-rendered.png`

...для всех 6 кейсов...
```

- [ ] **Step 2: Проверить чек-лист**

```bash
cat /Users/dmitry/Downloads/spirits_front/screenshots/roman-reels/shooting-checklist.md
```

Expected: все 6 кейсов описаны, все промпты точные, статусы проставлены.

---

### Task 8: Обновить спек с результатами валидации

**Files:**
- Modify: `docs/superpowers/specs/2026-04-20-roman-reels-cases-design.md`

- [ ] **Step 1: Добавить в спек секцию «9. Результаты валидации»**

Для каждого из 6 кейсов:
- Финальный статус: ✅ OK / ⚠️ FALLBACK / 🔴 FAIL
- Использованный промпт (если отличается от изначального)
- Время генерации
- Размер артефакта
- Ссылка на файл в `screenshots/roman-reels/case-N/`
- Комментарий (что пошло не так и как починили)

- [ ] **Step 2: Показать пользователю сводку**

Вывести сводную таблицу по всем 6 кейсам в последнем сообщении. На этом работа Claude в этом проекте заканчивается.

---

## Self-Review

**Spec coverage:** Все 6 кейсов из §3 спека имеют свой Task 1–6. Task 7 покрывает §8 (deliverable — чек-лист съёмки). Task 8 обновляет сам спек с результатами §7 (риски).

**Placeholder scan:** Все промпты прописаны слово-в-слово. Команды Bash конкретные. Критерии OK явные. Fallback сценарии описаны с конкретными действиями. Таск-границы чёткие (одна папка = один кейс).

**Type consistency:** Пути к файлам везде абсолютные и консистентные (`screenshots/roman-reels/case-N/...`). Имя артефакта для каждого кейса определено один раз.
