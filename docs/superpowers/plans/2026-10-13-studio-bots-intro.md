# Описание бота во вкладке «Telegram-боты» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вверху вкладки «Telegram-боты» Студии появляется карточка «Ассистент Linkeon в вашей Telegram-группе»: что это за бот, зачем он, как его подключить, сколько стоит, что он видит, и кнопка «Открыть «Продукты»» для тех, кому нужен собственный бот для клиентов.

**Architecture:** новый компонент уровня модуля `TgBotIntro` со своим состоянием «развёрнута/свёрнута». Начальное состояние даёт `TgBotsListView` по первой загрузке списка (ботов нет — развёрнута). Переход в «Продукты» — колбэк от `StudioPage`, это её же `setTab`. Тексты — `tgBot.intro.*` в семи локалях.

**Tech Stack:** React 18, TypeScript, Tailwind, react-i18next, vitest + jsdom, свой стенд `src/test/dom.tsx`.

**Спека:** `docs/superpowers/specs/2026-10-13-studio-bots-intro-design.md`.

**Где работать:** worktree `.worktrees/studio-bots-intro`, ветка `feat/studio-bots-intro`. Перед каждым коммитом — `git branch --show-current`. В `git add` только поимённо: `pnpm install` на маке оставляет неотслеживаемый `pnpm-workspace.yaml`, его не коммитить.

**Тесты на маке** — только точечно и под Node 22 (у системного Node 26 jsdom ломается на localStorage):

```bash
PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run <файл>
```

Полный прогон, `tsc` и сборка — на ноде, в задаче 5.

---

### Task 1: Тексты на семи языках

**Files:**
- Modify: `src/i18n/locales/{ru,en,de,fr,es,pt,zh}.json`: новый объект `tgBot.intro`; в `ru.json` ещё `pages.studio.bots_subtitle` и `tgBot.empty_active_hint`.
- Временный скрипт: `<scratchpad>/apply-intro-texts.mjs`, не коммитится.

Все локали — канонический `JSON.stringify(…, null, 2)` с переводом строки в конце (проверено 13.10.2026), поэтому их можно разбирать и записывать заново: чужие байты не меняются. Скрипт сам проверяет это перед записью.

Типографика взята по соседним строкам `tgBot.*` той же локали:
- de: „…“ и « – »;
- fr: « … » с обычными пробелами, апостроф ’, обычный пробел перед « : » и « ? »;
- es и pt: «…»;
- zh: 「…」 и ——, пробелы вокруг латиницы;
- en и pt: « — ».

Термины тоже из локали:
- de: Guthaben, aufladen;
- fr: jetons, solde, recharger;
- es: saldo, recargar;
- pt (европейский): separador, ficheiros, link, carregar;
- zh: 代币, 余额, 充值.

Роли в примерах получили род реальных ассистентов: юрист Алексей, бухгалтер Анна, копирайтер Екатерина.

- [ ] **Step 1: Записать скрипт**

```js
// Тексты карточки «что это за бот» (вкладка «Telegram-боты» Студии) на семи
// языках. Идемпотентный: tgBot.intro перезаписывается целиком, в ru — ещё две
// строки тона вкладки («ты» → «вы»).
import { readFileSync, writeFileSync } from 'node:fs';

const ORDER = [
  'title', 'lead',
  'why_title', 'why_work', 'why_family', 'why_personal',
  'how_title', 'how_link', 'how_setup', 'how_add',
  'cost_title', 'cost',
  'note_title', 'note_history', 'note_commands',
  'products', 'products_button',
];

const INTRO = {
  ru: {
    title: "Ассистент Linkeon в вашей Telegram-группе",
    lead: "Выберите роль (готового ассистента Linkeon или своего со вкладки «Ассистенты») и имя, на которое он будет откликаться. Ассистент отвечает прямо в переписке: на текст, голосовые и присланные файлы, — а если нужно, и сам говорит голосом.",
    why_title: "Зачем",
    why_work: "Рабочий чат: юрист проверит договор, который прислали в группу, бухгалтер ответит про налоги, копирайтер набросает пост.",
    why_family: "Семья или друзья: спланировать поездку, посчитать общие расходы, подобрать подарок.",
    why_personal: "Свой чат: группа, где только вы и бот, — ассистент всегда под рукой в Telegram.",
    how_title: "Как подключить",
    how_link: "Привяжите свой Telegram — это делается один раз.",
    how_setup: "Выберите роль, имя и когда бот отвечает: только когда к нему обращаются, когда сам решит, что стоит вмешаться, или на каждое сообщение.",
    how_add: "Добавьте бота в группу по ссылке — он включится сам.",
    cost_title: "Сколько стоит",
    cost: "Каждый ответ бота списывает токены с вашего баланса — даже если вопрос задал другой участник группы. Кончатся токены — бот предупредит группу и замолчит до пополнения.",
    note_title: "Полезно знать",
    note_history: "Бот видит сообщения группы — так он понимает, о чём речь; переписку можно открыть в карточке бота.",
    note_commands: "Команды владельца в группе: /balance — баланс, /silent — бот замолкает, /resume — снова отвечает.",
    products: "Нужен собственный бот для клиентов — со своим названием в Telegram, который ведёт запись, принимает заявки и отвечает на частые вопросы? Это продукт, его соберёт ассистент.",
    products_button: "Открыть «Продукты»",
  },
  en: {
    title: "A Linkeon assistant in your Telegram group",
    lead: "Pick a role (a ready-made Linkeon assistant or one of your own from the Assistants tab) and a name it will answer to. The assistant replies right in the chat — to text, voice messages and files people send — and can reply by voice too if you want.",
    why_title: "What it's for",
    why_work: "Work chat: a lawyer checks a contract someone sent to the group, an accountant answers tax questions, a copywriter drafts a post.",
    why_family: "Family or friends: plan a trip, work out shared expenses, pick a gift.",
    why_personal: "Your own chat: a group with just you and the bot — your assistant is always at hand in Telegram.",
    how_title: "How to connect it",
    how_link: "Link your Telegram — you only need to do this once.",
    how_setup: "Choose a role, a name and when the bot replies: only when someone addresses it, when it decides it's worth chiming in, or to every message.",
    how_add: "Add the bot to your group with the link — it switches on by itself.",
    cost_title: "What it costs",
    cost: "Every bot reply is paid for with tokens from your balance — even if another group member asked the question. If you run out of tokens, the bot warns the group and goes quiet until you top up.",
    note_title: "Good to know",
    note_history: "The bot sees the group's messages — that's how it understands what the conversation is about; you can open the chat history on the bot's card.",
    note_commands: "Owner commands in the group: /balance — your balance, /silent — the bot goes quiet, /resume — it replies again.",
    products: "Need a bot of your own for your customers — under your own name in Telegram, taking bookings, collecting requests and answering common questions? That's a product, and an assistant will build it for you.",
    products_button: "Open Products",
  },
  de: {
    title: "Ein Linkeon-Assistent in deiner Telegram-Gruppe",
    lead: "Wähle eine Rolle (einen fertigen Linkeon-Assistenten oder einen eigenen aus dem Tab „Assistenten“) und einen Namen, auf den er reagiert. Der Assistent antwortet direkt im Chat – auf Text, Sprachnachrichten und geschickte Dateien – und auf Wunsch auch selbst per Sprache.",
    why_title: "Wozu",
    why_work: "Arbeitschat: Ein Jurist prüft den Vertrag, der in die Gruppe geschickt wurde, eine Buchhalterin beantwortet Steuerfragen, eine Texterin entwirft einen Post.",
    why_family: "Familie oder Freunde: eine Reise planen, gemeinsame Ausgaben ausrechnen, ein Geschenk aussuchen.",
    why_personal: "Dein eigener Chat: eine Gruppe nur mit dir und dem Bot – so hast du den Assistenten in Telegram immer griffbereit.",
    how_title: "So richtest du ihn ein",
    how_link: "Verbinde dein Telegram – das ist nur einmal nötig.",
    how_setup: "Wähle Rolle, Namen und wann der Bot antwortet: nur wenn man ihn anspricht, wenn er selbst entscheidet, dass sich ein Beitrag lohnt, oder auf jede Nachricht.",
    how_add: "Füge den Bot über den Link zur Gruppe hinzu – er aktiviert sich von selbst.",
    cost_title: "Was es kostet",
    cost: "Jede Antwort des Bots kostet Tokens von deinem Guthaben – auch wenn ein anderes Gruppenmitglied gefragt hat. Sind die Tokens aufgebraucht, sagt der Bot der Gruppe Bescheid und schweigt, bis du aufgeladen hast.",
    note_title: "Gut zu wissen",
    note_history: "Der Bot sieht die Nachrichten der Gruppe – so versteht er, worum es geht; den Verlauf findest du in der Karte des Bots.",
    note_commands: "Befehle für dich als Besitzer in der Gruppe: /balance – Guthaben, /silent – der Bot schweigt, /resume – er antwortet wieder.",
    products: "Du brauchst einen eigenen Bot für deine Kunden – unter deinem eigenen Namen in Telegram, der Termine vergibt, Anfragen annimmt und häufige Fragen beantwortet? Das ist ein Produkt, und ein Assistent baut es für dich.",
    products_button: "„Produkte“ öffnen",
  },
  fr: {
    title: "Un assistant Linkeon dans votre groupe Telegram",
    lead: "Choisissez un rôle (un assistant Linkeon prêt à l’emploi ou l’un des vôtres dans l’onglet « Assistants ») et le nom auquel il répondra. L’assistant répond directement dans la conversation — aux messages écrits, aux messages vocaux et aux fichiers envoyés — et, si vous le souhaitez, il répond aussi à voix haute.",
    why_title: "À quoi ça sert",
    why_work: "Chat de travail : un juriste vérifie le contrat envoyé dans le groupe, une comptable répond aux questions d’impôts, une rédactrice ébauche une publication.",
    why_family: "Famille ou amis : planifier un voyage, calculer les dépenses communes, choisir un cadeau.",
    why_personal: "Votre propre chat : un groupe avec seulement vous et le bot — l’assistant toujours à portée de main dans Telegram.",
    how_title: "Comment le connecter",
    how_link: "Liez votre Telegram — c’est à faire une seule fois.",
    how_setup: "Choisissez le rôle, le nom et quand le bot répond : seulement quand on s’adresse à lui, quand il juge utile d’intervenir, ou à chaque message.",
    how_add: "Ajoutez le bot au groupe grâce au lien — il s’active tout seul.",
    cost_title: "Combien ça coûte",
    cost: "Chaque réponse du bot est payée en jetons sur votre solde — même si la question vient d’un autre membre du groupe. Si vos jetons sont épuisés, le bot prévient le groupe et se tait jusqu’à ce que vous rechargiez.",
    note_title: "Bon à savoir",
    note_history: "Le bot voit les messages du groupe — c’est ainsi qu’il comprend de quoi on parle ; l’historique de la conversation est consultable dans la fiche du bot.",
    note_commands: "Commandes du propriétaire dans le groupe : /balance — solde, /silent — le bot se tait, /resume — il répond de nouveau.",
    products: "Besoin de votre propre bot pour vos clients — sous votre propre nom dans Telegram, qui prend les rendez-vous, reçoit les demandes et répond aux questions fréquentes ? C’est un produit : un assistant le construira pour vous.",
    products_button: "Ouvrir « Produits »",
  },
  es: {
    title: "Un asistente de Linkeon en tu grupo de Telegram",
    lead: "Elige un rol (un asistente de Linkeon ya preparado o uno tuyo de la pestaña «Asistentes») y el nombre al que responderá. El asistente contesta directamente en la conversación: a textos, mensajes de voz y archivos que le envíen. Si quieres, también responde con voz.",
    why_title: "Para qué sirve",
    why_work: "Chat de trabajo: un abogado revisa el contrato que enviaron al grupo, una contable responde sobre impuestos, una redactora prepara el borrador de una publicación.",
    why_family: "Familia o amigos: planear un viaje, calcular los gastos comunes, elegir un regalo.",
    why_personal: "Tu propio chat: un grupo solo contigo y el bot, para tener al asistente siempre a mano en Telegram.",
    how_title: "Cómo conectarlo",
    how_link: "Vincula tu Telegram. Solo hace falta hacerlo una vez.",
    how_setup: "Elige el rol, el nombre y cuándo responde el bot: solo cuando se dirigen a él, cuando él mismo decide que conviene intervenir o a cada mensaje.",
    how_add: "Añade el bot al grupo con el enlace y se activará solo.",
    cost_title: "Cuánto cuesta",
    cost: "Cada respuesta del bot descuenta tokens de tu saldo, aunque la pregunta la haya hecho otro miembro del grupo. Si se acaban los tokens, el bot avisa al grupo y se queda en silencio hasta que recargues.",
    note_title: "Conviene saber",
    note_history: "El bot ve los mensajes del grupo: así entiende de qué se habla. El historial de la conversación está en la tarjeta del bot.",
    note_commands: "Comandos del propietario en el grupo: /balance — saldo, /silent — el bot se calla, /resume — vuelve a responder.",
    products: "¿Necesitas un bot propio para tus clientes, con tu propio nombre en Telegram, que gestione citas, recoja solicitudes y responda a las preguntas frecuentes? Eso es un producto, y un asistente lo creará por ti.",
    products_button: "Abrir «Productos»",
  },
  pt: {
    title: "Um assistente Linkeon no teu grupo do Telegram",
    lead: "Escolhe uma função (um assistente Linkeon já pronto ou um dos teus, do separador «Assistentes») e o nome a que ele vai responder. O assistente responde diretamente na conversa — a texto, mensagens de voz e ficheiros enviados — e, se quiseres, também responde por voz.",
    why_title: "Para que serve",
    why_work: "Chat de trabalho: um jurista revê o contrato enviado para o grupo, uma contabilista responde sobre impostos, uma redatora faz o rascunho de uma publicação.",
    why_family: "Família ou amigos: planear uma viagem, calcular as despesas comuns, escolher um presente.",
    why_personal: "O teu próprio chat: um grupo só contigo e com o bot — o assistente sempre à mão no Telegram.",
    how_title: "Como configurar",
    how_link: "Associa o teu Telegram — só é preciso fazê-lo uma vez.",
    how_setup: "Escolhe a função, o nome e quando o bot responde: só quando o chamam, quando ele próprio decide que vale a pena intervir, ou a todas as mensagens.",
    how_add: "Adiciona o bot ao grupo através do link — ele ativa-se sozinho.",
    cost_title: "Quanto custa",
    cost: "Cada resposta do bot desconta tokens do teu saldo — mesmo que a pergunta tenha sido feita por outro membro do grupo. Se os tokens acabarem, o bot avisa o grupo e fica em silêncio até carregares o saldo.",
    note_title: "Convém saber",
    note_history: "O bot vê as mensagens do grupo — é assim que percebe do que se está a falar; o histórico da conversa pode ser consultado no cartão do bot.",
    note_commands: "Comandos do proprietário no grupo: /balance — saldo, /silent — o bot fica calado, /resume — volta a responder.",
    products: "Precisas de um bot próprio para os teus clientes — com o teu próprio nome no Telegram, que faz marcações, recebe pedidos e responde às perguntas frequentes? Isso é um produto, e um assistente constrói-o por ti.",
    products_button: "Abrir «Produtos»",
  },
  zh: {
    title: "您的 Telegram 群组中的 Linkeon 助手",
    lead: "选择一个角色（现成的 Linkeon 助手，或您在「助手」标签页中创建的助手），并设定一个它会响应的名称。助手直接在聊天中回复文字、语音消息和发送的文件；如有需要，它也能用语音回答。",
    why_title: "用途",
    why_work: "工作群：律师审阅群里发来的合同，会计解答税务问题，文案起草帖子。",
    why_family: "家人或朋友：规划旅行、计算共同开支、挑选礼物。",
    why_personal: "您自己的聊天：建一个只有您和机器人的群组，在 Telegram 里随时都能找到助手。",
    how_title: "如何接入",
    how_link: "绑定您的 Telegram——只需操作一次。",
    how_setup: "选择角色、名称以及机器人何时回复：仅在有人提及它时、在它自行判断值得介入时，或对每条消息都回复。",
    how_add: "通过链接将机器人添加到群组——它会自动激活。",
    cost_title: "费用",
    cost: "机器人的每条回复都会从您的余额中扣除代币——即使提问的是群组里的其他成员。代币用完后，机器人会在群组中提醒，并保持沉默直到您充值。",
    note_title: "须知",
    note_history: "机器人能看到群组消息——这样它才能理解大家在聊什么；聊天记录可在机器人卡片中查看。",
    note_commands: "机器人所有者在群组中可用的命令：/balance 查看余额，/silent 让机器人保持安静，/resume 恢复回复。",
    products: "需要一个服务客户的专属机器人？它在 Telegram 中使用您自己的名称，可以预约、接收申请并回答常见问题。这属于产品，助手会为您搭建。",
    products_button: "打开「产品」",
  },
};

const RU_TONE = {
  bots_subtitle: "Telegram-боты для ваших групп",
  empty_active_hint: "Создайте бота для своей Telegram-группы",
};

const root = process.argv[2];
if (!root) throw new Error('usage: node apply-intro-texts.mjs <корень spirits_front>');

for (const [lang, texts] of Object.entries(INTRO)) {
  const file = `${root}/src/i18n/locales/${lang}.json`;
  const src = readFileSync(file, 'utf8');
  const json = JSON.parse(src);
  if (JSON.stringify(json, null, 2) + '\n' !== src) {
    throw new Error(`${file}: не канонический JSON — перезапись задела бы чужие байты`);
  }
  const missing = ORDER.filter((k) => typeof texts[k] !== 'string' || !texts[k].trim());
  const extra = Object.keys(texts).filter((k) => !ORDER.includes(k));
  if (missing.length || extra.length) {
    throw new Error(`${lang}: нет [${missing}], лишние [${extra}]`);
  }
  json.tgBot.intro = Object.fromEntries(ORDER.map((k) => [k, texts[k]]));
  if (lang === 'ru') {
    json.pages.studio.bots_subtitle = RU_TONE.bots_subtitle;
    json.tgBot.empty_active_hint = RU_TONE.empty_active_hint;
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`✅ ${lang}: tgBot.intro — ${ORDER.length} ключей`);
}
```

- [ ] **Step 2: Прогнать скрипт и проверки локалей**

```bash
node <scratchpad>/apply-intro-texts.mjs "$PWD"
node scripts/check-locales.mjs
node scripts/check-keys-exist.mjs
git diff --stat
```

Ожидается:
- семь строк `✅ <lang>`;
- `check-locales`: все локали «✅ N/N», у ru/en/de/fr/es/pt на 17 ключей больше, чем в базовой линии (1624 → 1641), у zh 1606 → 1623;
- `check-keys`: «✅ все ключи из кода есть»;
- `git diff --stat`: семь файлов локалей, у ru +19/−2, у остальных +19.

Невидимые символы: `grep -nP '\x{00A0}|\x{202F}|\x{200B}' src/i18n/locales/*.json | grep -c intro` — ожидается `0`, скрипт их не вносит.

- [ ] **Step 3: Коммит**

```bash
git branch --show-current   # feat/studio-bots-intro
git add src/i18n/locales/ru.json src/i18n/locales/en.json src/i18n/locales/de.json src/i18n/locales/fr.json src/i18n/locales/es.json src/i18n/locales/pt.json src/i18n/locales/zh.json
git commit -m "i18n(tg-bot): тексты карточки «что это за бот» на семи языках; вкладка ботов на «вы»"
```

---

### Task 2: Карточка `TgBotIntro`

**Files:**
- Create: `src/components/tg-bot/TgBotIntro.tsx`
- Test: `src/components/tg-bot/TgBotIntro.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```tsx
// @vitest-environment jsdom
//
// Карточка «что это за бот» — объяснение для того, кто попал на вкладку
// впервые, в том числе с лендинга, где «бот» значит продукт. Проверяется
// видимое: какой текст на экране и что делают кнопки.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, click, visibleText } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import ru from '../../i18n/locales/ru.json';
import { TgBotIntro } from './TgBotIntro';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const intro = ru.tgBot.intro;
let view: Mounted | null = null;

afterEach(() => {
  view?.unmount();
  view = null;
});

/** Кнопка, в надписи которой есть этот текст. */
function buttonWith(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!found) throw new Error(`нет кнопки с текстом «${text}»`);
  return found;
}

describe('карточка «что это за бот»', () => {
  it('развёрнутая показывает объяснение целиком', () => {
    view = mount(<TgBotIntro defaultOpen onOpenProducts={() => {}} />);
    const text = visibleText(view.container);
    // Каждая строка секции видна: ни одна не потерялась при вёрстке, и ни одна
    // не лежит в локали мёртвым ключом, который никто не показывает.
    for (const line of Object.values(intro)) expect(text).toContain(line);
  });

  it('свёрнутая — только заголовок', () => {
    view = mount(<TgBotIntro defaultOpen={false} onOpenProducts={() => {}} />);
    const text = visibleText(view.container);
    expect(text).toContain(intro.title);
    expect(text).not.toContain(intro.lead);
    expect(text).not.toContain(intro.products);
  });

  it('заголовок разворачивает и сворачивает, aria-expanded идёт следом', () => {
    view = mount(<TgBotIntro defaultOpen={false} onOpenProducts={() => {}} />);
    const header = buttonWith(view.container, intro.title);
    expect(header.getAttribute('aria-expanded')).toBe('false');

    click(header);
    expect(visibleText(view.container)).toContain(intro.lead);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    // aria-controls указывает на тело карточки, которое сейчас на экране.
    const bodyId = header.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    expect(document.getElementById(bodyId!)?.textContent).toContain(intro.lead);

    click(header);
    expect(visibleText(view.container)).not.toContain(intro.lead);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('кнопка «Открыть «Продукты»» ведёт в продукты', () => {
    const onOpenProducts = vi.fn();
    view = mount(<TgBotIntro defaultOpen onOpenProducts={onOpenProducts} />);
    click(buttonWith(view.container, intro.products_button));
    expect(onOpenProducts).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run src/components/tg-bot/TgBotIntro.test.tsx`
Expected: FAIL — `Failed to resolve import "./TgBotIntro"`.

- [ ] **Step 3: Написать компонент**

```tsx
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Send, Server } from 'lucide-react';

interface Props {
  /**
   * Развёрнута ли карточка при появлении. Решает список ботов: тому, у кого
   * нет ни одного, нужно объяснение целиком, остальным — строка заголовка.
   */
  defaultOpen: boolean;
  /** Открыть «Продукты»: собственного бота для клиентов делают там. */
  onOpenProducts: () => void;
}

/**
 * Что за бот живёт на этой вкладке — и чем он не является.
 *
 * Сюда приходят с лендинга (секция «Сайты и боты», utm_content=sites), где
 * «телеграм-бот» — это продукт с токеном от @BotFather. Бот этой вкладки
 * другой: ассистент Linkeon в своей группе. Поэтому карточка кончается
 * указателем на «Продукты» — без него человек, пришедший за ботом для
 * клиентов, решает, что такого у нас нет.
 *
 * Каждое утверждение текста сверено с бэкендом (src/tg-bot): за ответы всем
 * участникам платит владелец, все сообщения группы сохраняются и видны ему в
 * «Истории». Меняется поведение бота — меняется и текст.
 */
export const TgBotIntro: React.FC<Props> = ({ defaultOpen, onOpenProducts }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  const why = [t('tgBot.intro.why_work'), t('tgBot.intro.why_family'), t('tgBot.intro.why_personal')];
  const how = [t('tgBot.intro.how_link'), t('tgBot.intro.how_setup'), t('tgBot.intro.how_add')];

  return (
    <section className="mb-5 bg-white rounded-2xl border border-gray-200">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          // Тело в свёрнутом виде не рисуется, и ссылаться было бы не на что.
          aria-controls={open ? bodyId : undefined}
          className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-forest-100 text-forest-700 flex items-center justify-center shrink-0">
            <Send size={18} />
          </span>
          <span className="flex-1 font-semibold text-gray-900">{t('tgBot.intro.title')}</span>
          <ChevronDown
            size={18}
            className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>

      {open && (
        <div id={bodyId} className="px-4 sm:px-5 pb-5 space-y-4 text-sm text-gray-600">
          <p>{t('tgBot.intro.lead')}</p>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">{t('tgBot.intro.why_title')}</h3>
            <ul className="list-disc pl-5 space-y-1.5 marker:text-forest-700">
              {why.map((text) => <li key={text}>{text}</li>)}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">{t('tgBot.intro.how_title')}</h3>
            <ol className="space-y-1.5">
              {how.map((text, i) => (
                <li key={text} className="flex gap-2.5">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-forest-100 text-forest-700 text-xs font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('tgBot.intro.cost_title')}</h3>
            <p>{t('tgBot.intro.cost')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('tgBot.intro.note_title')}</h3>
            <p>{t('tgBot.intro.note_history')}</p>
            <p className="mt-1">{t('tgBot.intro.note_commands')}</p>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p>{t('tgBot.intro.products')}</p>
            <button
              type="button"
              onClick={onOpenProducts}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-forest-600 text-forest-700 hover:bg-forest-50 font-medium transition-colors"
            >
              <Server size={16} /> {t('tgBot.intro.products_button')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run src/components/tg-bot/TgBotIntro.test.tsx`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит**

```bash
git branch --show-current
git add src/components/tg-bot/TgBotIntro.tsx src/components/tg-bot/TgBotIntro.test.tsx
git commit -m "feat(tg-bot): карточка «что это за бот» — что умеет, зачем, как подключить, цена, указатель на «Продукты»"
```

---

### Task 3: Карточка на вкладке ботов

**Files:**
- Modify: `src/components/tg-bot/TgBotsListView.tsx` (`Props`, состояние, `reload`, место в `content`)
- Test: `src/components/tg-bot/TgBotsListView.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```tsx
// @vitest-environment jsdom
//
// Вкладка ботов решает, в каком виде показать карточку «что это за бот»:
// новичку целиком, остальным строкой заголовка. Решение принимается один раз,
// по первой загрузке списка, и действия со списком его не отменяют.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, click, clickAsync, flush, visibleText } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import ru from '../../i18n/locales/ru.json';
import { TgBotsListView } from './TgBotsListView';
import { tgBotApi, type TgBotConfig } from '../../services/tgBotApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => nav.navigate }));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../services/tgBotApi', () => ({
  tgBotApi: {
    list: vi.fn(async () => []),
    remove: vi.fn(async () => ({ ok: true })),
    reissueClaim: vi.fn(),
  },
}));

// Модалки правки и истории к карточке отношения не имеют, а правка тянет за
// собой выбор роли с походом в API.
vi.mock('./TgBotEditModal', () => ({ TgBotEditModal: () => null }));
vi.mock('./TgBotMessagesView', () => ({ TgBotMessagesView: () => null }));

const api = vi.mocked(tgBotApi);
const intro = ru.tgBot.intro;

function bot(over: Partial<TgBotConfig> = {}): TgBotConfig {
  return {
    id: 'b-1',
    tgChatId: '-100123',
    tgChatTitle: 'Семья',
    displayName: 'Финансист',
    presetAgentId: '17',
    customAgentId: null,
    addressingMode: 'strict',
    voiceReplyMode: 'never',
    status: 'active',
    lastReplyAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    archivedAt: null,
    ...over,
  };
}

let view: Mounted | null = null;

beforeEach(() => {
  api.list.mockReset();
  api.list.mockResolvedValue([]);
  api.remove.mockReset();
  api.remove.mockResolvedValue({ ok: true });
  nav.navigate.mockReset();
});

afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

async function openTab(props: { embedded?: boolean; onOpenProducts?: () => void } = { embedded: true }) {
  view = mount(<TgBotsListView {...props} />);
  await flush();
  return view.container;
}

function buttonWith(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!found) throw new Error(`нет кнопки с текстом «${text}»`);
  return found;
}

describe('карточка «что это за бот» на вкладке ботов', () => {
  it('у кого ботов нет — развёрнута целиком', async () => {
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.lead);
    expect(visibleText(c)).toContain(intro.products_button);
  });

  it('у кого есть бот — свёрнута в заголовок', async () => {
    api.list.mockResolvedValue([bot()]);
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.title);
    expect(visibleText(c)).not.toContain(intro.lead);
  });

  it('бот только в архиве — тоже свёрнута: человек уже знает, что это', async () => {
    api.list.mockResolvedValue([bot({ status: 'archived', archivedAt: '2026-10-05T10:00:00Z' })]);
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.title);
    expect(visibleText(c)).not.toContain(intro.lead);
  });

  it('список не загрузился — развёрнута: о человеке ничего не известно', async () => {
    api.list.mockRejectedValue(new Error('HTTP 502'));
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.lead);
  });

  it('до ответа сервера карточки нет — иначе она прыгала бы из вида в вид', async () => {
    api.list.mockReturnValue(new Promise<TgBotConfig[]>(() => {}));
    const c = await openTab();
    expect(visibleText(c)).not.toContain(intro.title);
  });

  it('раскрытая вручную не схлопывается после архивации бота', async () => {
    api.list.mockResolvedValue([bot()]);
    vi.stubGlobal('confirm', () => true);
    const c = await openTab();

    click(buttonWith(c, intro.title));
    expect(visibleText(c)).toContain(intro.lead);

    // Архивация перезагружает список. Карточка, которую рисуют только вне
    // загрузки, размонтировалась бы и вернулась свёрнутой.
    api.list.mockResolvedValue([bot({ status: 'archived', archivedAt: '2026-10-13T10:00:00Z' })]);
    const archive = c.querySelector(`button[aria-label="${ru.tgBot.card_archive_aria}"]`);
    expect(archive).not.toBeNull();
    await clickAsync(archive!);
    await flush();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(visibleText(c)).toContain(intro.lead);
  });

  it('в Студии кнопка продуктов зовёт переход, который дала Студия', async () => {
    const onOpenProducts = vi.fn();
    const c = await openTab({ embedded: true, onOpenProducts });
    click(buttonWith(c, intro.products_button));
    expect(onOpenProducts).toHaveBeenCalledTimes(1);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('без перехода от Студии — обычный переход на вкладку продуктов', async () => {
    const c = await openTab({ embedded: true });
    click(buttonWith(c, intro.products_button));
    expect(nav.navigate).toHaveBeenCalledWith('/studio?tab=products');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run src/components/tg-bot/TgBotsListView.test.tsx`
Expected: FAIL. Сценарии «развёрнута/свёрнута» и кнопки не находят текста карточки. Сценарий «до ответа сервера карточки нет» проходит и сейчас: карточки ещё нет вовсе.

- [ ] **Step 3: Встроить карточку в `TgBotsListView.tsx`**

Импорт рядом с остальными компонентами вкладки:

```tsx
import { TgBotIntro } from './TgBotIntro';
```

`Props`:

```tsx
interface Props {
  /** Если true — без внешней h-full обёртки и без заголовка страницы. */
  embedded?: boolean;
  /**
   * Открыть вкладку «Продукты». Студия передаёт свой setTab, чтобы переход вёл
   * себя как нажатие на вкладку: параметры адреса на месте, новой записи в
   * истории нет. Без него — обычный переход на адрес вкладки.
   */
  onOpenProducts?: () => void;
}

export const TgBotsListView: React.FC<Props> = ({ embedded = false, onOpenProducts }) => {
```

Состояние — после `const [reconnect, setReconnect] = …`:

```tsx
  // Развёрнута ли карточка «что это за бот», решает ПЕРВАЯ загрузка списка:
  // новичку (ни одного бота, даже в архиве) — целиком, остальным — строкой.
  // null — список ещё не приходил, и карточку не рисуем: иначе она прыгала бы
  // «развёрнута → свёрнута» на глазах. Повторные загрузки (архив,
  // переподключение) значение не трогают: карточка, раскрытая вручную,
  // схлопывалась бы после каждого действия со списком.
  const [introOpen, setIntroOpen] = useState<boolean | null>(null);
```

`reload`:

```tsx
  const reload = async () => {
    setLoading(true);
    try {
      const list = await tgBotApi.list();
      setConfigs(list);
      setIntroOpen(prev => prev ?? list.length === 0);
    }
    catch (e: any) {
      toast.error(e?.message ?? t('tgBot.list_load_error'));
      // О человеке ничего не известно — объяснение лишним не будет.
      setIntroOpen(prev => prev ?? true);
    }
    finally { setLoading(false); }
  };
```

В `content` — сразу после блока `{!embedded && (…заголовок страницы…)}` и перед блоком `{embedded && (…кнопка «Создать»…)}`:

```tsx
      {introOpen !== null && (
        <TgBotIntro
          defaultOpen={introOpen}
          onOpenProducts={onOpenProducts ?? (() => navigate('/studio?tab=products'))}
        />
      )}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run src/components/tg-bot/`
Expected: PASS — 8 тестов в `TgBotsListView.test.tsx` и 4 в `TgBotIntro.test.tsx`.

- [ ] **Step 5: Сломать нарочно**

Обернуть карточку в `!loading && …` (рисовать только вне загрузки) → сценарий «раскрытая вручную не схлопывается…» должен покраснеть. Вернуть как было → зелёный. Правку не коммитить.

- [ ] **Step 6: Коммит**

```bash
git branch --show-current
git add src/components/tg-bot/TgBotsListView.tsx src/components/tg-bot/TgBotsListView.test.tsx
git commit -m "feat(tg-bot): карточка «что это за бот» вверху вкладки — новичку развёрнута, остальным строкой"
```

---

### Task 4: Переход в «Продукты» из Студии

**Files:**
- Modify: `src/pages/StudioPage.tsx` (строка `{tab === 'bots' && …}`)
- Test: `src/pages/StudioPage.test.tsx`

- [ ] **Step 1: Написать падающий тест**

В `StudioPage.test.tsx`:

1. Импорт стенда дополнить: `import { mount, click, byButton, tRu } from '../test/dom';`
2. Заглушку вкладки ботов заменить:

```tsx
vi.mock('../components/tg-bot/TgBotsListView', () => ({
  // Кнопка повторяет указатель из карточки «что это за бот»: по ней видно,
  // какой переход Студия отдала вкладке ботов.
  TgBotsListView: ({ onOpenProducts }: { onOpenProducts?: () => void }) => (
    <div>
      СПИСОК-БОТОВ
      <button onClick={onOpenProducts}>В-ПРОДУКТЫ</button>
    </div>
  ),
}));
```

3. Заглушку роутера заменить — `setParams` должен быть виден тесту:

```tsx
let search = '';
const setParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(search), setParams],
}));
```

4. В `afterEach` добавить `setParams.mockReset();`.
5. В конец файла:

```tsx
describe('переход из вкладки ботов в «Продукты»', () => {
  it('ведёт себя как нажатие на вкладку: параметры адреса на месте, история не растёт', () => {
    // Ровно тот адрес, с которым владелец пришёл с лендинга.
    search = 'utm_content=sites&lang=ru&tab=bots';
    const { container } = mount(<StudioPage />);

    click(byButton(container, /В-ПРОДУКТЫ/)!);

    expect(setParams).toHaveBeenCalledTimes(1);
    const [next, opts] = setParams.mock.calls[0] as [URLSearchParams, unknown];
    expect(next.get('tab')).toBe('products');
    expect(next.get('utm_content')).toBe('sites');
    expect(next.get('lang')).toBe('ru');
    expect(opts).toEqual({ replace: true });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run src/pages/StudioPage.test.tsx`
Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times`. Шесть прежних сценариев зелёные.

- [ ] **Step 3: Передать переход**

В `StudioPage.tsx`:

```tsx
      {tab === 'bots' && <TgBotsListView embedded onOpenProducts={() => setTab('products')} />}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: та же команда. Expected: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git branch --show-current
git add src/pages/StudioPage.tsx src/pages/StudioPage.test.tsx
git commit -m "feat(studio): «Открыть «Продукты»» из карточки бота переключает вкладку, не теряя параметров адреса"
```

---

### Task 5: Полная проверка на ноде

- [ ] **Step 1: Довезти ветку до ноды и встать на её sha**

```bash
git push -u origin feat/studio-bots-intro
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/studio-bots-intro && git fetch -q origin feat/studio-bots-intro && git checkout -q --detach $SHA && git log --oneline -1"
```

Expected: последняя строка — sha и сообщение коммита из задачи 4.

- [ ] **Step 2: Тесты, проверки, типы, сборка**

```bash
ssh dv@85.192.61.231 'cd ~/ci/wt/studio-bots-intro && source ~/.nvm/nvm.sh >/dev/null && pnpm install --frozen-lockfile >/dev/null && ./node_modules/.bin/vitest run 2>&1 | tail -6; node scripts/check-locales.mjs | tail -7; node scripts/check-keys-exist.mjs; node scripts/check-no-hardcoded.mjs | tail -2; ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" > /tmp/tsc-studio-bots.txt; wc -l < /tmp/tsc-studio-bots.txt; grep -E "tg-bot/|StudioPage" /tmp/tsc-studio-bots.txt; pnpm build 2>&1 | tail -3'
```

Expected:
- vitest: 109 файлов, 1429 тестов, все зелёные (база 107/1416 плюс 2 файла и 13 тестов: 4 + 8 + 1);
- `check-locales` и `check-keys`: ✅;
- `check-no-hardcoded`: ✅;
- tsc: `45`, а grep по своим файлам пуст;
- build: `✓ built in …`.

- [ ] **Step 3: Сломать проверку локали нарочно**

На ноде удалить `tgBot.intro.cost` из `de.json` → `node scripts/check-locales.mjs` должен назвать ключ. Вернуть: `git checkout src/i18n/locales/de.json`.

---

### Task 6: Слияние в main

Порядок — из памяти про параллельные сессии: мерж собирается в своём detached-воркдереве поверх свежего `origin/main`, проверяется на ноде, и только потом пуш. Перед пушем отдельным шагом проверить, что ни на маке, ни на ноде не идёт `deploy.sh`.

- [ ] **Step 1:** `git fetch origin`; `git worktree add --detach .worktrees/merge-studio-bots origin/main`; в нём `git merge --no-ff feat/studio-bots-intro -m "Merge feat/studio-bots-intro: описание бота во вкладке «Telegram-боты» Студии"`.
- [ ] **Step 2:** запушить мерж в `verify/studio-bots-intro` и прогнать на ноде команду задачи 5, шаг 2, на sha мержа.
- [ ] **Step 3:** отдельной командой проверить, нет ли выката:
  - на маке: `ps -eo pid,command | grep -E "^\s*[0-9]+ (bash|/bin/bash) .*deploy\.sh"`;
  - на ноде: та же команда по ssh.
- [ ] **Step 4:** если выката нет — `git push origin <sha мержа>:main`. Пуш отказал (non-fast-forward) — вернуться к шагу 1.
- [ ] **Step 5:** `git merge-base --is-ancestor <sha мержа> origin/main` после `git fetch`; снять `.worktrees/merge-studio-bots`, удалить ветку `verify/studio-bots-intro` на GitHub.
- [ ] **Step 6:** выкат `deploy.sh` — только после явного OK владельца.
