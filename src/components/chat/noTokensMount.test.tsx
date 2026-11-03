// @vitest-environment jsdom
//
// Поведенческие проверки «нулевой баланс» (бэклог 2d71aaf8; дизайн — spirits_back
// docs/superpowers/specs/2026-11-03-background-turns-and-no-tokens-draft-design.md,
// §2) живым монтированием НАСТОЯЩЕГО ChatInterface — сеть и тяжёлые дочерние
// компоненты подменены, логика чата своя. Перенесено из стенда повторного
// ревью 03.11 (feat/followups-1103 @ 2646c87): noTokensWiring.test.ts читает
// исходник по тексту и не видит РЕАЛЬНОГО поведения — срез по маркеру мог
// «найти» нужное имя переменной в массиве зависимостей эффекта, даже когда
// проверку в теле эффекта вырезали (см. комментарии в noTokensWiring.test.ts).
// Здесь же монтируется настоящий компонент: утверждения — про то, что человек
// увидел бы на экране (поле ввода, лента, окно задачи), а не про текст файла.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, tRu, type as typeInto, type Mounted } from '../../test/dom';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const { tRu: t } = await import('../../test/dom');
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'ru', changeLanguage: async () => {} } }) };
});

const auth = vi.hoisted(() => ({ user: { phone: '70000000000', tokens: 0 } as Record<string, unknown> }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));

type Planned = () => unknown;
const net = vi.hoisted(() => ({
  history: [] as unknown[],
  chatStreams: [] as Array<() => unknown>,
  uploadStreams: [] as Array<() => unknown>,
  posts: [] as Array<{ path: string; body: unknown }>,
}));

vi.mock('../../services/apiClient', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
  return {
    apiClient: {
      get: async (url: string) => {
        if (url.startsWith('/webhook/chat/history')) return ok({ messages: net.history, hasMore: false });
        if (url.startsWith('/webhook/chat/active-turn')) return ok({ active: false });
        if (url.startsWith('/webhook/agents')) return ok([]);
        return ok({});
      },
      post: async (path: string, body: unknown) => {
        net.posts.push({ path, body });
        if (path === '/webhook/soulmate/chat') {
          const f = net.chatStreams.shift();
          if (!f) throw new Error('no planned chat stream');
          return f();
        }
        if (path === '/webhook/agent/upload-and-chat') {
          const f = net.uploadStreams.shift();
          if (!f) throw new Error('no planned upload stream');
          return f();
        }
        return ok({ ok: true });
      },
      delete: async () => ok({}),
      refreshTokenIfNeeded: async () => {},
    },
  };
});

vi.mock('./AssistantSelection', () => ({ AssistantSelection: () => null }));
vi.mock('./action-plan/ActionPlanPanel', () => ({ default: () => null }));
vi.mock('./FloatingCallButton', () => ({ FloatingCallButton: () => null }));
vi.mock('../../services/customAgentsApi', () => ({ customAgentsApi: { list: async () => [] } }));
vi.mock('../tokens/TokenPackages', () => ({ TokenPackages: () => null }));
vi.mock('../tokens/OfferBanner', () => ({ default: () => null }));
vi.mock('../tokens/SessionPaywallNudge', () => ({ default: () => null }));
vi.mock('../../services/voiceDictation', () => ({ VoiceDictation: { supported: false } }));
vi.mock('./AudioClip', () => ({ default: () => null }));
vi.mock('./files/ChatFilesPanel', () => ({ default: () => null }));
vi.mock('./listen/ListenButton', () => ({ default: () => null }));
const listen = vi.hoisted(() => ({ stop: () => {}, phaseOf: () => 'idle', isKnown: () => false, toggle: () => {} }));
vi.mock('./listen/useListenPlayer', () => ({ useListenPlayer: () => listen }));
vi.mock('./VoiceCallCard', () => ({ default: () => null }));
vi.mock('./MeetingJoinCard', () => ({ default: () => null }));
vi.mock('./MeetingStatusBar', () => ({ default: () => null }));
vi.mock('../../services/avatarService', () => ({ avatarService: { getAvatarUrl: async () => '' } }));
vi.mock('../../services/widgetClient', () => ({ refreshWidget: () => {} }));
const videoJobs = vi.hoisted(() => ({ jobs: [] as unknown[] }));
vi.mock('../video/useVideoJobs', () => ({ useVideoJobs: () => videoJobs }));
vi.mock('../video/VideoJobCard', () => ({ default: () => null }));
vi.mock('../calendar/InlineCalendarProposals', () => ({ InlineCalendarProposals: () => null }));
vi.mock('../../services/eventsClient', () => ({ trackAuthed: () => {} }));
vi.mock('./ActivitySteps', () => ({ LiveActivity: () => null, ActivitySummaryView: () => null }));
vi.mock('../products/ProductActionCard', () => ({ ProductActionCard: () => null }));
vi.mock('./AskCard', () => ({ AskBlockView: () => null }));
vi.mock('./ChatImageAttachment', () => ({ default: () => null }));

import ChatInterface from './ChatInterface';

const STOP = 'STOPZEROBALANCE';
const NO_TOKENS = [
  { type: 'begin' },
  { type: 'item', content: STOP },
  { type: 'end', content: STOP, reason: 'no_tokens', usage: { input: 0, output: 0, total: 0 } },
];
const NORMAL = (text: string) => [
  { type: 'begin' },
  { type: 'item', content: text },
  { type: 'end', usage: { input: 1, output: 1, total: 2 } },
];

/** NDJSON-ответ; если задан gate — последняя строка (end) ждёт его. */
function ndjson(events: object[], gate?: Promise<void>): Planned {
  return () => {
    const enc = new TextEncoder();
    const lines = events.map((e) => enc.encode(JSON.stringify(e) + '\n'));
    let i = 0;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (gate && i === lines.length - 1) await gate;
            if (i < lines.length) return { done: false, value: lines[i++] };
            return { done: true, value: undefined };
          },
          releaseLock() {},
          cancel: async () => {},
        }),
      },
    };
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

const ASSISTANT = { id: 12, name: 'Роман', description: '' };
const OLYA = { id: 2, name: 'Оля', description: '' };
const HISTORY = [
  { id: 'h1', type: 'user', content: 'старый вопрос', timestamp: '2026-11-01T10:00:00Z' },
  { id: 'h2', type: 'assistant', content: 'старый ответ', timestamp: '2026-11-01T10:00:05Z' },
];

let view: Mounted | null = null;
let route = '/chat';
const page = () => (
  <MemoryRouter initialEntries={[route]}>
    <ChatInterface preSelectedAssistant={ASSISTANT} />
  </MemoryRouter>
);
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await flush(); };
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function open() { view = mount(page()); await settle(); }
const rerender = async () => { view!.rerender(page()); await settle(); };
/** Смена ассистента тем же путём, что боковая панель (preSelectedAssistant). */
const switchTo = async (a: { id: number; name: string; description: string }) => {
  view!.rerender(
    <MemoryRouter initialEntries={[route]}>
      <ChatInterface preSelectedAssistant={a} />
    </MemoryRouter>,
  );
  await settle(14);
};
const c = () => view!.container;
const field = () => c().querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement;
const sendBtn = () => c().querySelector('svg.lucide-send')!.closest('button') as HTMLButtonElement;
async function clickEl(el: Element) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function send(text: string) {
  typeInto(field(), text);
  await clickEl(sendBtn());
  await settle();
}
const draft = (): { text: string; assistant: string } | null => {
  const r = localStorage.getItem('pending_draft');
  return r ? JSON.parse(r) : null;
};
/** Текст ленты без полей ввода. */
const feedText = () => {
  const clone = c().cloneNode(true) as HTMLElement;
  clone.querySelectorAll('textarea').forEach((t) => t.remove());
  return clone.textContent ?? '';
};
const countStops = () => (feedText().match(new RegExp(STOP, 'g')) || []).length;
const modalVisible = () => feedText().includes(tRu('chat.file_modal_title'));
const modalTask = () =>
  (c().querySelector(`textarea[placeholder="${tRu('chat.file_modal_placeholder')}"]`) as HTMLTextAreaElement | null)?.value ?? null;
const buttonByText = (text: string) =>
  Array.from(c().querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === text) ?? null;
async function attach(file: File) {
  const fi = c().querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(fi, 'files', { value: [file], configurable: true });
  await act(async () => { fi.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
}
async function submitFileTask(task: string) {
  const ta = c().querySelector(`textarea[placeholder="${tRu('chat.file_modal_placeholder')}"]`) as HTMLTextAreaElement;
  expect(ta).not.toBeNull();
  typeInto(ta, task);
  await clickEl(buttonByText(tRu('chat.file_modal_submit'))!);
  await settle(14);
}
const setTokens = async (n: number) => { auth.user = { ...auth.user, tokens: n }; await rerender(); };
const chatPosts = () => net.posts.filter((p) => p.path === '/webhook/soulmate/chat');

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom 25 не реализует File.prototype.text: без полифила ветка одиночного
  // текстового файла молча уходила в «не удалось прочитать», и E7/R14
  // проверяли не тот путь (m-3 повторного ревью 03.11).
  if (!File.prototype.text) {
    File.prototype.text = function (this: File) {
      return new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsText(this);
      });
    };
  }
  const g = globalThis as Record<string, unknown>;
  if (!g.ResizeObserver) g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!g.IntersectionObserver) g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  if (!window.matchMedia) {
    (window as unknown as Record<string, unknown>).matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
  localStorage.clear();
  sessionStorage.clear();
  auth.user = { phone: '70000000000', tokens: 0 };
  net.history = HISTORY;
  net.chatStreams = [];
  net.uploadStreams = [];
  net.posts = [];
  route = '/chat';
});

afterEach(() => {
  view?.unmount();
  view = null;
});

describe('no_tokens (бэклог 2d71aaf8) — живое монтирование ChatInterface', () => {
  it('E0 (санитарная): обычный успешный ход — ответ в ленте, поле пустое', async () => {
    net.chatStreams.push(ndjson(NORMAL('обычный ответ')));
    await open();
    await send('вопрос');
    expect(feedText()).toContain('обычный ответ');
    expect(field().value).toBe('');
  });

  it('E1 (CRITICAL, C2): набрал «привет», отправил на нуле — в поле ровно «привет», черновик ровно он же', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    await send('привет');
    expect(countStops()).toBe(1);
    expect(field().value).toBe('привет');
    expect(draft()?.text).toBe('привет');
  });

  it('E2: пока шёл ход, набрал ещё (не отправил) — набранное не теряется, отклонённое не задваивается', async () => {
    const gate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    typeInto(field(), 'первое');
    await clickEl(sendBtn()); // не ждём: ход висит на gate
    await settle();
    typeInto(field(), 'набираю');
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(field().value).toContain('набираю');
    expect(field().value.split('первое').length - 1).toBe(1);
  });

  it('E3 (m2, путь ?say=): очередь за время хода — «первое» и «второе» по разу, досылки в ноль нет, набранное не теряется', async () => {
    sessionStorage.setItem('selected_assistant', JSON.stringify(ASSISTANT));
    route = '/chat?say=' + encodeURIComponent('первое');
    const gate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    for (let i = 0; i < 20 && chatPosts().length === 0; i++) await sleep(100);
    expect(chatPosts().length).toBe(1);
    await send('второе'); // ход идёт → очередь
    typeInto(field(), 'третье'); // набрано, не отправлено
    await act(async () => { gate.resolve(); });
    await settle(14);
    await sleep(300);
    expect(chatPosts().length).toBe(1);
    expect(field().value.split('первое').length - 1).toBe(1);
    expect(field().value.split('второе').length - 1).toBe(1);
    expect(field().value).toContain('третье');
  });

  it('E4 (m1): два отказа подряд — одно сообщение остановки', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await send('раз');
    typeInto(field(), '');
    await send('два');
    expect(countStops()).toBe(1);
  });

  it('E5 (C1): автоприветствие на нуле — поле и черновик не трогаются', async () => {
    net.history = [];
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    for (let i = 0; i < 20 && chatPosts().length === 0; i++) await sleep(100);
    await settle();
    expect(chatPosts().length).toBe(1);
    expect(field().value).toBe('');
    expect(draft()).toBeNull();
  });

  it('E6 (I2): мультипарт на нуле — окно не открыто; пополнение — открыто один раз; отмена — не возвращается', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));
    expect(modalVisible()).toBe(true);
    await submitFileTask('сожми фото');
    const afterReject = { modal: modalVisible(), draft: draft()?.text, stops: countStops() };
    await setTokens(0);
    const afterZeroPoll = modalVisible();
    await setTokens(5000);
    const afterTopUp = { modal: modalVisible(), task: modalTask() };
    await setTokens(4990);
    const afterNextPoll = modalVisible();
    await clickEl(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle();
    await setTokens(4980);
    const afterCancelPoll = modalVisible();
    expect(afterReject.modal).toBe(false);
    expect(afterReject.draft).toBe('сожми фото');
    expect(afterZeroPoll).toBe(false);
    expect(afterTopUp.modal).toBe(true);
    expect(afterTopUp.task).toBe('сожми фото');
    expect(afterNextPoll).toBe(true);
    expect(afterCancelPoll).toBe(false);
  });

  it('E7 (m1, один текстовый файл): отказ текста, затем отказ .txt — одно сообщение остановки', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await send('привет');
    expect(countStops()).toBe(1);
    await attach(new File(['строка'], 'note.txt', { type: 'text/plain' }));
    await submitFileTask('перескажи');
    expect(countStops()).toBe(1);
    // Отказ .txt не затирает восстановленный текстовым ходом ввод (m-3).
    expect(field().value).toBe('привет');
  });

  it('E8 (I2, баланс в кабинете ещё не обнулился поллингом): окно не должно открываться сразу', async () => {
    auth.user = { phone: '70000000000', tokens: 120 };
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));
    await submitFileTask('сожми фото');
    expect(modalVisible()).toBe(false);
  });

  it('E9 (I3, файлы остались в состоянии): после отказа ушёл к другому ассистенту и прикрепил файл — в окне только новый файл', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1])], 'для-романа.png', { type: 'image/png' }));
    await submitFileTask('сожми');
    // смена ассистента тем же путём, что боковая панель (preSelectedAssistant)
    view!.rerender(
      <MemoryRouter initialEntries={[route]}>
        <ChatInterface preSelectedAssistant={{ id: 2, name: 'Оля', description: '' }} />
      </MemoryRouter>,
    );
    await settle(14);
    await attach(new File([new Uint8Array([2])], 'для-оли.png', { type: 'image/png' }));
    const names = feedText();
    expect(names).toContain('для-оли.png');
    expect(names).not.toContain('для-романа.png');
    // Смена ассистента сбрасывает и текст задачи вместе с файлами (m-3).
    expect(modalTask()).toBe('');
  });

  it('E10 (I3): отказ загрузки у A → ушёл к B → вернулся к A и пополнил — текст задачи не оказывается и в поле, и в окне', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' }));
    await submitFileTask('сожми фото');
    view!.rerender(
      <MemoryRouter initialEntries={[route]}>
        <ChatInterface preSelectedAssistant={{ id: 2, name: 'Оля', description: '' }} />
      </MemoryRouter>,
    );
    await settle(14);
    view!.rerender(page()); // назад к A
    await settle(14);
    const mainAfterReturn = field().value;
    await setTokens(5000);
    expect(mainAfterReturn.includes('сожми фото') && modalTask() === 'сожми фото').toBe(false);
  });
});

// Регрессии повторного ревью 03.11 (стенд review3). Каждый тест утверждает
// ПРАВИЛЬНОЕ поведение; красный = дефект подтверждён. R6/R12/R14 на HEAD
// (9e61a7f) красные — они охраняют правки m-2/m-1/I-1; R11/R13/R17/R18 зелёные
// — охраняют уже сданное от регрессий.
describe('no_tokens — регрессии финального ревью (R)', () => {
  it('R6: отказ загрузки → «Чистый лист» (история перечитывается, эффект черновика срабатывает) → пополнение — задача не задвоена (поле И окно)', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' }));
    await submitFileTask('сожми фото');
    const toggle = c().querySelector('[data-testid="fresh-mode-toggle"]') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    await clickEl(toggle!);
    await settle(14);
    const fieldAfterToggle = field().value;
    await setTokens(5000);
    expect(fieldAfterToggle.includes('сожми фото') && modalTask() === 'сожми фото').toBe(false);
  });

  it('R11: два отказа загрузки подряд у одного ассистента — одна остановка; после пополнения окно открывается с последней задачей', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1])], 'one.png', { type: 'image/png' }));
    await submitFileTask('первая задача');
    // второй отказ: прикрепил ещё (окно открылось с one.png + two.png), отправил
    await attach(new File([new Uint8Array([2])], 'two.png', { type: 'image/png' }));
    const ta = c().querySelector(`textarea[placeholder="${tRu('chat.file_modal_placeholder')}"]`) as HTMLTextAreaElement;
    typeInto(ta, 'вторая задача');
    await clickEl(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(14);
    const stops = countStops();
    const modalAfter2 = modalVisible();
    await setTokens(5000);
    const t = feedText();
    expect(stops).toBe(1);
    expect(modalAfter2).toBe(false);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('вторая задача');
    expect(t).toContain('one.png');
    expect(t).toContain('two.png');
  });

  it('R12: у другого ассистента живой черновик → savePendingDraft молча отказывает → ушёл к B и вернулся — текст задачи не потерян', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({ text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3600_000 }));
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' }));
    await submitFileTask('сожми фото');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    const fieldAtA = field().value;
    await setTokens(5000);
    expect(fieldAtA.includes('сожми фото') || modalTask() === 'сожми фото').toBe(true);
  });

  it('R13: тот же ассистент — второй отказ загрузки после пополнения и нового нуля открывает окно снова', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await attach(new File([new Uint8Array([1])], 'one.png', { type: 'image/png' }));
    await submitFileTask('раз');
    await setTokens(5000);
    const first = modalVisible();
    // баланс в кабинете ещё 5000, но бэк снова отвечает no_tokens (ушёл в ноль другим ходом)
    await clickEl(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(14);
    const afterSecondReject = modalVisible();
    await setTokens(0);
    await setTokens(7000);
    const second = modalVisible();
    expect(first).toBe(true);
    expect(afterSecondReject).toBe(false);
    expect(second).toBe(true);
    expect(modalTask()).toBe('раз');
  });

  it('R14 (I-1): один текстовый файл — отказ → пополнение → успешная отправка — черновик задачи снят, поле пустое', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('перескажал')));
    await open();
    await attach(new File(['строка'], 'note.txt', { type: 'text/plain' }));
    await submitFileTask('перескажи');
    const d1 = draft();
    await setTokens(5000);
    const opened = modalVisible();
    await clickEl(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(14);
    const reply = feedText().includes('перескажал');
    const d2 = draft();
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(d1?.text).toBe('перескажи');
    expect(opened).toBe(true);
    expect(reply).toBe(true);
    expect(d2).toBeNull();
    expect(field().value).toBe('');
  });

  it('R17: обычная успешная мультипарт-загрузка — ответ в ленте, черновика нет, окно закрыто', async () => {
    auth.user = { phone: '70000000000', tokens: 5000 };
    net.uploadStreams.push(ndjson(NORMAL('файл получен')));
    await open();
    await attach(new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));
    await submitFileTask('посмотри');
    await setTokens(4990);
    expect(feedText()).toContain('файл получен');
    expect(draft()).toBeNull();
    expect(modalVisible()).toBe(false);
  });

  it('R18: отказ загрузки пришёл, когда человек уже ушёл к B, — черновик задачи сохранён для A и встаёт в поле при возврате', async () => {
    const gate = deferred();
    net.uploadStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    await attach(new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' }));
    const ta = c().querySelector(`textarea[placeholder="${tRu('chat.file_modal_placeholder')}"]`) as HTMLTextAreaElement;
    typeInto(ta, 'сожми фото');
    await clickEl(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle();
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    const d = draft();
    await switchTo(ASSISTANT);
    expect(d?.text).toBe('сожми фото');
    expect(d?.assistant).toBe('12');
    expect(field().value).toBe('сожми фото');
  });
});
