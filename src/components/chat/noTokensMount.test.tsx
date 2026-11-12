// @vitest-environment jsdom
//
// Живой стенд no_tokens: настоящий ChatInterface, NDJSON-стримы и видимый DOM.
// Подменены только сеть и тяжёлые дочерние компоненты. В частности, мок
// TokenPackages намеренно видим: отказ по балансу НЕ должен открывать его сам.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, tRu, type as typeInto, type Mounted } from '../../test/dom';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const { tRu: t } = await import('../../test/dom');
  return {
    ...actual,
    useTranslation: () => ({ t, i18n: { language: 'ru', changeLanguage: async () => {} } }),
  };
});

const auth = vi.hoisted(() => ({
  user: { phone: '70000000000', tokens: 0 } as Record<string, unknown>,
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));

type PlannedStream = (request?: { signal?: AbortSignal }) => unknown;
const net = vi.hoisted(() => ({
  history: [] as unknown[],
  chatStreams: [] as PlannedStream[],
  uploadStreams: [] as PlannedStream[],
  activeTurnGates: [] as Array<Promise<unknown>>,
  activeTurnGateEnabled: false,
  historyGates: [] as Array<Promise<void>>,
  historyGateEnabled: false,
  posts: [] as Array<{ path: string; body: unknown }>,
}));

vi.mock('../../services/apiClient', () => {
  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => '',
  });
  return {
    apiClient: {
      get: async (url: string) => {
        if (url.startsWith('/webhook/chat/history')) {
          if (net.historyGateEnabled) {
            const gate = net.historyGates.shift();
            if (gate) return gate.then(() => ok({ messages: net.history, hasMore: false }));
          }
          return ok({ messages: net.history, hasMore: false });
        }
        if (url.startsWith('/webhook/chat/active-turn')) {
          const gate = net.activeTurnGateEnabled ? net.activeTurnGates.shift() : undefined;
          return gate ? gate.then((body) => ok(body)) : ok({ active: false });
        }
        if (url.startsWith('/webhook/agents')) return ok([]);
        return ok({});
      },
      post: async (path: string, body: unknown, options?: { signal?: AbortSignal }) => {
        net.posts.push({ path, body });
        if (path === '/webhook/soulmate/chat') {
          const planned = net.chatStreams.shift();
          if (!planned) throw new Error('no planned chat stream');
          return planned(options);
        }
        if (path === '/webhook/agent/upload-and-chat') {
          const planned = net.uploadStreams.shift();
          if (!planned) throw new Error('no planned upload stream');
          return planned(options);
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
vi.mock('../tokens/TokenPackages', () => ({
  TokenPackages: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="token-packages">
      <button type="button" data-testid="token-packages-close" onClick={onClose}>Закрыть пополнение</button>
    </div>
  ),
}));
vi.mock('../tokens/OfferBanner', () => ({ default: () => null }));
vi.mock('../tokens/SessionPaywallNudge', () => ({ default: () => null }));
vi.mock('../../services/voiceDictation', () => ({ VoiceDictation: { supported: false } }));
vi.mock('./AudioClip', () => ({ default: () => null }));
vi.mock('./files/ChatFilesPanel', () => ({ default: () => null }));
vi.mock('./listen/ListenButton', () => ({ default: () => null }));
const listen = vi.hoisted(() => ({
  stop: () => {}, phaseOf: () => 'idle', isKnown: () => false, toggle: () => {},
}));
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
vi.mock('./ActivitySteps', () => ({
  LiveActivity: () => <div data-testid="live-activity">Ассистент работает</div>,
  ActivitySummaryView: () => null,
}));
vi.mock('../products/ProductActionCard', () => ({ ProductActionCard: () => null }));
vi.mock('./AskCard', () => ({ AskBlockView: () => null }));
vi.mock('./ChatImageAttachment', () => ({ default: () => null }));

import ChatInterface from './ChatInterface';

const STOP = 'STOPZEROBALANCE';
const NO_TOKENS = [
  { type: 'begin' },
  { type: 'item', content: STOP },
  // usage специально есть: распознавание обязано зависеть от type/reason,
  // а не от наличия или отсутствия usage.
  { type: 'end', content: STOP, reason: 'no_tokens', usage: { input: 0, output: 0, total: 0 } },
];
const NORMAL = (text: string) => [
  { type: 'begin' },
  { type: 'item', content: text },
  { type: 'end', usage: { input: 1, output: 1, total: 2 } },
];

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

async function waitWithAbort(gate: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return gate;
  if (signal.aborted) throw abortError();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    gate.then(
      () => { signal.removeEventListener('abort', onAbort); resolve(); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

function ndjson(
  events: object[],
  endGate?: Promise<void>,
  behavior?: { deliverEndAfterAbort?: boolean },
): PlannedStream {
  return (request) => {
    const encoder = new TextEncoder();
    const chunks = events.map((event) => encoder.encode(`${JSON.stringify(event)}\n`));
    let index = 0;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            const atEnd = index === chunks.length - 1;
            if (endGate && atEnd) {
              if (behavior?.deliverEndAfterAbort) await endGate;
              else await waitWithAbort(endGate, request?.signal);
            }
            // deliverEndAfterAbort моделирует END, уже лежавший в очереди
            // транспорта к моменту abort; ранний abort по-прежнему ошибка.
            if (request?.signal?.aborted && !(behavior?.deliverEndAfterAbort && atEnd)) {
              throw abortError();
            }
            if (index < chunks.length) return { done: false, value: chunks[index++] };
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
let activeAssistant = ASSISTANT;
const page = () => (
  <MemoryRouter initialEntries={[route]}>
    <ChatInterface preSelectedAssistant={activeAssistant} />
  </MemoryRouter>
);
const settle = async (rounds = 10) => { for (let i = 0; i < rounds; i++) await flush(); };
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function open() { view = mount(page()); await settle(); }
const rerender = async () => { view!.rerender(page()); await settle(); };
async function switchTo(assistant: typeof ASSISTANT) {
  activeAssistant = assistant;
  view!.rerender(page());
  await settle(14);
}

const container = () => view!.container;
const field = () => container().querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement;
const sendButton = () => container().querySelector('svg.lucide-send')!.closest('button') as HTMLButtonElement;
async function clickElement(element: Element) {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function send(text: string) {
  typeInto(field(), text);
  await clickElement(sendButton());
  await settle();
}
const storedDraft = (): { text: string; assistant: string } | null => {
  const raw = localStorage.getItem('pending_draft');
  return raw ? JSON.parse(raw) : null;
};
const feedText = () => {
  const clone = container().cloneNode(true) as HTMLElement;
  clone.querySelectorAll('textarea, [data-testid="token-packages"]').forEach((el) => el.remove());
  return clone.textContent ?? '';
};
const countStops = () => (feedText().match(new RegExp(STOP, 'g')) ?? []).length;
const tokenPackagesVisible = () => container().querySelector('[data-testid="token-packages"]') !== null;
const fileModal = () => (Array.from(container().querySelectorAll('h3'))
  .find((h) => h.textContent?.includes(tRu('chat.file_modal_title')))?.closest('.fixed') ?? null) as HTMLElement | null;
const modalVisible = () => fileModal() !== null;
const modalTask = () => (fileModal()?.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? null;
const modalText = () => fileModal()?.textContent ?? '';
const buttonByText = (text: string) => Array.from(container().querySelectorAll('button'))
  .find((button) => (button.textContent ?? '').trim() === text) ?? null;
async function attach(file: File) {
  const input = container().querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
}
async function submitFileTask(task: string) {
  const textarea = fileModal()?.querySelector('textarea') as HTMLTextAreaElement;
  expect(textarea).not.toBeNull();
  typeInto(textarea, task);
  await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
  await settle(14);
}
async function removeOnlyFile() {
  const button = fileModal()?.querySelector(`button[title="${tRu('chat.file_remove')}"]`);
  expect(button).not.toBeNull();
  await clickElement(button!);
  await settle(14);
}
async function reload() {
  view!.unmount();
  view = null;
  await open();
}
const setTokens = async (tokens: number) => {
  auth.user = { ...auth.user, tokens };
  await rerender();
};
const chatPosts = () => net.posts.filter((post) => post.path === '/webhook/soulmate/chat');
const image = (name: string, byte = 1) => new File([new Uint8Array([byte])], name, { type: 'image/png' });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  if (!File.prototype.text) {
    File.prototype.text = function (this: File) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
  const globals = globalThis as Record<string, unknown>;
  if (!globals.ResizeObserver) globals.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!globals.IntersectionObserver) {
    globals.IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    };
  }
  if (!window.matchMedia) {
    (window as unknown as Record<string, unknown>).matchMedia = () => ({
      matches: false,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/chat');
  auth.user = { phone: '70000000000', tokens: 0 };
  net.history = HISTORY;
  net.chatStreams = [];
  net.uploadStreams = [];
  net.activeTurnGates = [];
  net.activeTurnGateEnabled = false;
  net.historyGates = [];
  net.historyGateEnabled = false;
  net.posts = [];
  route = '/chat';
  activeAssistant = ASSISTANT;
});

afterEach(() => {
  view?.unmount();
  view = null;
});

describe('no_tokens — живое монтирование ChatInterface', () => {
  it('E0: успешный текстовый ход показывает ответ, очищает поле и не открывает пополнение', async () => {
    net.chatStreams.push(ndjson(NORMAL('обычный ответ')));
    await open();
    await send('вопрос');
    expect(feedText()).toContain('обычный ответ');
    expect(field().value).toBe('');
    expect(storedDraft()).toBeNull();
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E1: отказ возвращает текст и pending_draft, убирает пузырь, оставляет один stop без auto-open', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    await send('привет');
    expect(field().value).toBe('привет');
    expect(storedDraft()).toMatchObject({ text: 'привет', assistant: '12' });
    expect(feedText()).not.toContain('привет');
    expect(countStops()).toBe(1);
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E2: deferred END не затирает новый набор и возвращает отклонённый текст ровно один раз', async () => {
    const gate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    typeInto(field(), 'первое');
    await clickElement(sendButton());
    await settle();
    typeInto(field(), 'набираю');
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(field().value).toBe('набираю\n\nпервое');
    expect(field().value.split('первое')).toHaveLength(2);
    expect(storedDraft()?.text).toBe('первое');
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E3: ?say= и очередь после отказа — один POST, обе реплики и новый набор сохранены', async () => {
    sessionStorage.setItem('selected_assistant', JSON.stringify(ASSISTANT));
    route = `/chat?say=${encodeURIComponent('первое')}`;
    const gate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    for (let i = 0; i < 20 && chatPosts().length === 0; i++) await sleep(100);
    expect(chatPosts()).toHaveLength(1);
    await send('второе');
    typeInto(field(), 'третье');
    await act(async () => { gate.resolve(); });
    await settle(14);
    await sleep(300);
    expect(chatPosts()).toHaveLength(1);
    for (const text of ['первое', 'второе', 'третье']) {
      expect(field().value.split(text)).toHaveLength(2);
    }
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E4: два отказа подряд оставляют одно сообщение остановки', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await send('раз');
    typeInto(field(), '');
    await send('два');
    expect(countStops()).toBe(1);
    expect(field().value).toBe('два');
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E5: synthetic greeting на нуле не создаёт черновик и не заполняет поле', async () => {
    net.history = [];
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    for (let i = 0; i < 20 && chatPosts().length === 0; i++) await sleep(100);
    await settle();
    expect(chatPosts()).toHaveLength(1);
    expect(field().value).toBe('');
    expect(storedDraft()).toBeNull();
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E6: multipart 0→5000→4990→Cancel→4980 открывает задачу только на переходе ≤0→>0 один раз', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('photo.png'));
    await submitFileTask('сожми фото');
    expect(modalVisible()).toBe(false);
    expect(field().value).toBe('');
    expect(storedDraft()).toMatchObject({ text: 'сожми фото', assistant: '12' });
    expect(countStops()).toBe(1);
    expect(tokenPackagesVisible()).toBe(false);
    await setTokens(0);
    expect(modalVisible()).toBe(false);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('сожми фото');
    expect(modalText()).toContain('photo.png');
    await setTokens(4990);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle();
    await setTokens(4980);
    expect(modalVisible()).toBe(false);
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E7: отказ текста затем отказ .txt — один stop, файл не затирает текст в поле', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await send('привет');
    await attach(new File(['строка'], 'note.txt', { type: 'text/plain' }));
    await submitFileTask('перескажи');
    expect(countStops()).toBe(1);
    expect(field().value).toBe('привет');
    expect(modalVisible()).toBe(false);
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E8: stale positive 120 не открывает задачу, пока сначала не наблюдался ноль', async () => {
    auth.user = { phone: '70000000000', tokens: 120 };
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('photo.png'));
    await submitFileTask('сожми фото');
    expect(modalVisible()).toBe(false);
    await setTokens(0);
    expect(modalVisible()).toBe(false);
    await setTokens(500);
    expect(modalVisible()).toBe(true);
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('E9: отказ у A не переносит файлы и задачу в новое вложение B', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('для-романа.png'));
    await submitFileTask('сожми');
    await switchTo(OLYA);
    expect(field().value).not.toContain('сожми');
    expect(modalVisible()).toBe(false);
    await attach(image('для-оли.png', 2));
    expect(modalText()).toContain('для-оли.png');
    expect(modalText()).not.toContain('для-романа.png');
    expect(modalTask()).toBe('');
  });

  it('E10: A→B→A→positive с надёжным draft оставляет задачу только в одном носителе', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('photo.png'));
    await submitFileTask('сожми фото');
    await switchTo(OLYA);
    expect(field().value).not.toContain('сожми фото');
    await switchTo(ASSISTANT);
    expect(field().value).toBe('сожми фото');
    expect(modalVisible()).toBe(false);
    await setTokens(5000);
    const inField = field().value.includes('сожми фото');
    const inModal = modalTask() === 'сожми фото';
    expect(inField && inModal).toBe(false);
    expect(inField || inModal).toBe(true);
    expect(tokenPackagesVisible()).toBe(false);
  });
});

describe('no_tokens — файловые регрессии повторного ревью', () => {
  it('R6: clean sheet→positive не дублирует задачу в поле и файловой модалке', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('photo.png'));
    await submitFileTask('сожми фото');
    const toggle = container().querySelector('[data-testid="fresh-mode-toggle"]') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    await clickElement(toggle!);
    await settle(14);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('сожми фото');
    expect(field().value).not.toContain('сожми фото');
  });

  it('R11: два multipart refusal заменяют stop; после positive видны вторая задача и актуальные файлы', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await attach(image('one.png'));
    await submitFileTask('первая задача');
    await attach(image('two.png', 2));
    await submitFileTask('вторая задача');
    expect(countStops()).toBe(1);
    expect(modalVisible()).toBe(false);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('вторая задача');
    expect(modalText()).toContain('one.png');
    expect(modalText()).toContain('two.png');
    expect(field().value).not.toContain('вторая задача');
  });

  it('R12: живой draft другого assistant блокирует save, но A→B→A→positive не теряет задачу и файлы', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('photo.png'));
    await submitFileTask('сожми фото');
    expect(storedDraft()).toMatchObject({ text: 'черновик для Райи', assistant: '14' });
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('сожми фото');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('сожми фото');
    expect(modalText()).toContain('photo.png');
    expect(storedDraft()).toMatchObject({ text: 'черновик для Райи', assistant: '14' });
  });

  it('R13: refusal→positive→refusal на stale positive→0→7000 reopen только на новом переходе', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await attach(image('one.png'));
    await submitFileTask('раз');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(14);
    expect(modalVisible()).toBe(false);
    await setTokens(6000);
    expect(modalVisible()).toBe(false);
    await setTokens(0);
    expect(modalVisible()).toBe(false);
    await setTokens(7000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('раз');
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('R14: .txt refusal→positive→success очищает draft; B→A его не воскрешает', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('перескажал')));
    await open();
    await attach(new File(['строка'], 'note.txt', { type: 'text/plain' }));
    await submitFileTask('перескажи');
    expect(storedDraft()).toMatchObject({ text: 'перескажи', assistant: '12' });
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(14);
    expect(feedText()).toContain('перескажал');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    expect(modalVisible()).toBe(false);
  });

  it('R17: успешный multipart без refusal показывает ответ и не оставляет draft/модалку', async () => {
    auth.user = { phone: '70000000000', tokens: 5000 };
    net.uploadStreams.push(ndjson(NORMAL('файл получен')));
    await open();
    await attach(image('photo.png'));
    await submitFileTask('посмотри');
    await setTokens(4990);
    expect(feedText()).toContain('файл получен');
    expect(storedDraft()).toBeNull();
    expect(modalVisible()).toBe(false);
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('R18: END после A→B сохраняет draft assistant=12; B чист, при возврате текст только в A', async () => {
    const gate = deferred();
    net.uploadStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    await attach(image('photo.png'));
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'сожми фото');
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle();
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(storedDraft()).toMatchObject({ text: 'сожми фото', assistant: '12' });
    expect(field().value).not.toContain('сожми фото');
    expect(modalVisible()).toBe(false);
    expect(feedText()).not.toContain('photo.png');
    await switchTo(ASSISTANT);
    expect(field().value).toBe('сожми фото');
    expect(modalVisible()).toBe(false);
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('R19: старый same-assistant draft + задача >2000 при save=false не снимает единственный носитель', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS));
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await send('текстовый вопрос');
    expect(storedDraft()).toMatchObject({ text: 'текстовый вопрос', assistant: '12' });
    const longTask = `длинная файловая задача ${'я'.repeat(2050)}`;
    await attach(image('long-task.png'));
    await submitFileTask(longTask);
    // savePendingDraft отклонил длинную задачу: прежний текстовый draft остался.
    expect(storedDraft()).toMatchObject({ text: 'текстовый вопрос', assistant: '12' });
    await switchTo(OLYA);
    typeInto(field(), '');
    await switchTo(ASSISTANT);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe(longTask);
    expect(modalText()).toContain('long-task.png');
    expect(storedDraft()).toMatchObject({ text: 'текстовый вопрос', assistant: '12' });
  });

  it('R20: save=false у A затем явный attach у B — в модалке B только файл B и пустая задача', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('only-a.png'));
    await submitFileTask('задача A');
    expect(storedDraft()).toMatchObject({ text: 'черновик для Райи', assistant: '14' });
    await switchTo(OLYA);
    await attach(image('only-b.png', 2));
    expect(modalText()).toContain('only-b.png');
    expect(modalText()).not.toContain('only-a.png');
    expect(modalTask()).toBe('');
  });

  it('R21: явный файловый retry снимает hold — queued text после success досылается', async () => {
    const retryGate = deferred();
    net.uploadStreams.push(
      ndjson(NO_TOKENS),
      ndjson(NORMAL('файл принят'), retryGate.promise),
    );
    net.chatStreams.push(ndjson(NORMAL('очередь доставлена')));
    await open();
    await attach(image('photo.png'));
    await submitFileTask('сожми фото');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle();
    await send('текст из очереди');
    expect(chatPosts()).toHaveLength(0);
    await act(async () => { retryGate.resolve(); });
    await settle(20);
    for (let i = 0; i < 10 && chatPosts().length === 0; i++) await sleep(50);
    expect(chatPosts()).toHaveLength(1);
    expect(chatPosts()[0].body).toMatchObject({ chatInput: 'текст из очереди' });
    expect(feedText()).toContain('файл принят');
    expect(feedText()).toContain('очередь доставлена');
  });

  it('R22: late multipart A→B при save=false сохраняет носитель в памяти, не трогая ленту B', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    const gate = deferred();
    net.uploadStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    await attach(image('late-multipart.png'));
    await submitFileTask('поздняя задача');
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(modalVisible()).toBe(false);
    expect(feedText()).not.toContain('late-multipart.png');
    expect(storedDraft()).toMatchObject({ text: 'черновик для Райи', assistant: '14' });
    await switchTo(ASSISTANT);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('поздняя задача');
    expect(modalText()).toContain('late-multipart.png');
  });

  it('R23: другой text draft не доказывает сохранность file draft; Cancel его не удаляет', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('exact-draft.png'));
    await submitFileTask('исходная файловая задача');
    expect(storedDraft()).toMatchObject({ text: 'исходная файловая задача', assistant: '12' });
    await send('другой текст');
    expect(storedDraft()).toMatchObject({ text: 'другой текст', assistant: '12' });
    await switchTo(OLYA);
    typeInto(field(), '');
    await switchTo(ASSISTANT);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('исходная файловая задача');
    expect(modalText()).toContain('exact-draft.png');
    await clickElement(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle();
    expect(storedDraft()).toMatchObject({ text: 'другой текст', assistant: '12' });
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('исходная файловая задача');
  });

  it('R24: inline .txt END после A→B/abort остаётся no_tokens и восстанавливает носитель', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    const gate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS, gate.promise, { deliverEndAfterAbort: true }));
    await open();
    await attach(new File(['строка'], 'late-inline.txt', { type: 'text/plain' }));
    await submitFileTask('поздний inline');
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(modalVisible()).toBe(false);
    expect(feedText()).not.toContain('late-inline.txt');
    expect(storedDraft()).toMatchObject({ text: 'черновик для Райи', assistant: '14' });
    await switchTo(ASSISTANT);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('поздний inline');
    expect(modalText()).toContain('late-inline.txt');
  });

  it('R25: переход 0→5000 на B не расходует reopen deferred files A', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('balance-a.png'));
    await submitFileTask('задача A');
    await switchTo(OLYA);
    await setTokens(5000);
    expect(modalVisible()).toBe(false);
    expect(feedText()).not.toContain('balance-a.png');
    await switchTo(ASSISTANT);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('задача A');
    expect(modalText()).toContain('balance-a.png');
  });

  it('R26: history reload во время retry не подставляет уже отправленный draft повторно', async () => {
    const retryGate = deferred();
    net.uploadStreams.push(
      ndjson(NO_TOKENS),
      ndjson(NORMAL('retry завершён'), retryGate.promise),
    );
    await open();
    await attach(image('retry-reload.png'));
    await submitFileTask('задача retry');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle();
    const toggle = container().querySelector('[data-testid="fresh-mode-toggle"]') as HTMLButtonElement;
    await clickElement(toggle);
    await settle(20);
    await act(async () => { retryGate.resolve(); });
    await settle(20);
    expect(feedText()).toContain('retry завершён');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
  });

  it('R27: Cancel удаляет exact file draft и освобождает queue; F5/A→B→A не воскрешает задачу', async () => {
    const refusalGate = deferred();
    net.uploadStreams.push(ndjson(NO_TOKENS, refusalGate.promise));
    net.chatStreams.push(ndjson(NORMAL('очередь после Cancel доставлена')));
    await open();
    await attach(image('cancel-task.png'));
    await submitFileTask('задача Cancel');
    await send('текст после Cancel');
    await act(async () => { refusalGate.resolve(); });
    await settle(20);
    expect(chatPosts()).toHaveLength(0);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle(20);
    for (let i = 0; i < 10 && chatPosts().length === 0; i++) await sleep(50);
    const afterCancel = {
      draft: storedDraft(),
      posts: chatPosts().length,
      replyVisible: feedText().includes('очередь после Cancel доставлена'),
    };
    await reload();
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(afterCancel).toEqual({ draft: null, posts: 1, replyVisible: true });
    expect(chatPosts()[0].body).toMatchObject({ chatInput: 'текст после Cancel' });
    expect(field().value).not.toContain('задача Cancel');
    expect(modalVisible()).toBe(false);
  });

  it('R28: удаление последнего файла крестиком эквивалентно Cancel и освобождает queue', async () => {
    const refusalGate = deferred();
    net.uploadStreams.push(ndjson(NO_TOKENS, refusalGate.promise));
    net.chatStreams.push(ndjson(NORMAL('очередь после удаления доставлена')));
    await open();
    await attach(image('remove-last.png'));
    await submitFileTask('задача удаления');
    await send('текст после удаления');
    await act(async () => { refusalGate.resolve(); });
    await settle(20);
    expect(chatPosts()).toHaveLength(0);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await removeOnlyFile();
    for (let i = 0; i < 10 && chatPosts().length === 0; i++) await sleep(50);
    const afterRemove = {
      draft: storedDraft(),
      posts: chatPosts().length,
      replyVisible: feedText().includes('очередь после удаления доставлена'),
    };
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(afterRemove).toEqual({ draft: null, posts: 1, replyVisible: true });
    expect(chatPosts()[0].body).toMatchObject({ chatInput: 'текст после удаления' });
    expect(field().value).not.toContain('задача удаления');
    expect(modalVisible()).toBe(false);
  });

  it('R29: late A save=false не затирает уже открытую модалку B; после возврата A носитель цел', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    const gate = deferred();
    net.uploadStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    await attach(image('late-a.png'));
    await submitFileTask('поздняя задача A');
    await switchTo(OLYA);
    await attach(image('open-b.png', 2));
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'открытая задача B');
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('открытая задача B');
    expect(modalText()).toContain('open-b.png');
    expect(modalText()).not.toContain('late-a.png');
    await switchTo(ASSISTANT);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('поздняя задача A');
    expect(modalText()).toContain('late-a.png');
    expect(modalText()).not.toContain('open-b.png');
  });

  it('R30: late END затем positive на B не расходует reopen — при возврате A модалка открывается', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'черновик для Райи', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    const gate = deferred();
    net.uploadStreams.push(ndjson(NO_TOKENS, gate.promise));
    await open();
    await attach(image('late-balance.png'));
    await submitFileTask('поздний баланс A');
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    await setTokens(5000);
    expect(modalVisible()).toBe(false);
    expect(feedText()).not.toContain('late-balance.png');
    await switchTo(ASSISTANT);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('поздний баланс A');
    expect(modalText()).toContain('late-balance.png');
  });

  it('R31: reload в окне file.text не подставляет draft; повторный refusal/успех оставляет один носитель', async () => {
    net.chatStreams.push(
      ndjson(NO_TOKENS),
      ndjson(NO_TOKENS),
      ndjson(NORMAL('inline retry завершён')),
    );
    const file = new File(['строка'], 'retry-inline.txt', { type: 'text/plain' });
    await open();
    await attach(file);
    await submitFileTask('задача inline retry');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);

    let resolveRead!: (text: string) => void;
    const readPromise = new Promise<string>((resolve) => { resolveRead = resolve; });
    Object.defineProperty(file, 'text', { value: () => readPromise, configurable: true });
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle();
    const toggle = container().querySelector('[data-testid="fresh-mode-toggle"]') as HTMLButtonElement;
    await clickElement(toggle);
    await settle(20);
    await act(async () => { resolveRead('строка'); });
    await settle(20);

    expect(countStops()).toBe(1);
    expect(field().value).toBe('');
    expect(storedDraft()).toMatchObject({ text: 'задача inline retry', assistant: '12' });
    expect(modalVisible()).toBe(false);
    await setTokens(0);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('задача inline retry');
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('строка'), configurable: true });
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(feedText()).toContain('inline retry завершён');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    expect(modalVisible()).toBe(false);
  });

  it('R32: повторный late refusal после observed positive сбрасывает ноль для reopen на A', async () => {
    const secondRefusal = deferred();
    net.uploadStreams.push(
      ndjson(NO_TOKENS),
      ndjson(NO_TOKENS, secondRefusal.promise),
    );
    await open();
    await attach(image('repeat-late.png'));
    await submitFileTask('первая задача');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);

    const longTask = `повторная поздняя задача ${'я'.repeat(2050)}`;
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, longTask);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle();
    await switchTo(OLYA);
    await act(async () => { secondRefusal.resolve(); });
    await settle(14);
    // Вторая задача >2000: save=false, прежний draft не доказывает её носитель.
    expect(storedDraft()).toMatchObject({ text: 'первая задача', assistant: '12' });
    await setTokens(0);
    await setTokens(5000);
    expect(modalVisible()).toBe(false);
    expect(feedText()).not.toContain('repeat-late.png');
    await switchTo(ASSISTANT);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe(longTask);
    expect(modalText()).toContain('repeat-late.png');
  });

  it('R33: delayed file.text при активном B не отправляет A, не abort и не очищает B streaming', async () => {
    const bStreamGate = deferred();
    net.chatStreams.push(ndjson(NORMAL('ответ B'), bStreamGate.promise));
    const file = new File(['текст A'], 'delayed-a.txt', { type: 'text/plain' });
    let resolveRead!: (text: string) => void;
    const readPromise = new Promise<string>((resolve) => { resolveRead = resolve; });
    Object.defineProperty(file, 'text', { value: () => readPromise, configurable: true });
    await open();
    await attach(file);
    await submitFileTask('задача A');
    await switchTo(OLYA);
    sessionStorage.setItem('selected_assistant', JSON.stringify(OLYA));
    expect(container().querySelector('[data-testid="assistant-dropdown-btn"]')?.textContent).toContain('Оля');
    await send('ход B');
    expect(chatPosts()).toHaveLength(1);
    expect(chatPosts()[0].body).toMatchObject({ assistant: 2, chatInput: 'ход B' });
    expect(container().querySelector('[data-testid="live-activity"]') !== null || feedText().includes('ответ B')).toBe(true);

    await act(async () => { resolveRead('текст A'); });
    await settle(14);
    expect(chatPosts()).toHaveLength(1);
    expect(chatPosts()[0].body).toMatchObject({ chatInput: 'ход B' });
    expect(container().querySelector('[data-testid="live-activity"]') !== null || feedText().includes('ответ B')).toBe(true);
    await act(async () => { bStreamGate.resolve(); });
    await settle(14);
    expect(feedText()).toContain('ответ B');

    await switchTo(ASSISTANT);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('задача A');
    expect(modalText()).toContain('delayed-a.txt');
  });

  it('R34: редактирование задачи после refusal синхронизирует draft и не стирает правку на A→B→A', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('edited-task.png'));
    await submitFileTask('исходная задача');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'отредактированная задача');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    const inField = field().value.includes('отредактированная задача');
    const inModal = modalTask() === 'отредактированная задача';
    expect(inField || inModal).toBe(true);
    expect(inField && inModal).toBe(false);
    expect(field().value).not.toContain('исходная задача');
    expect(modalTask()).not.toBe('исходная задача');
  });

  it('R35 inline: edited-success очищает draft и не возвращает исходный текст в поле', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('inline edited успех')));
    await open();
    await attach(new File(['строка'], 'edited-inline.txt', { type: 'text/plain' }));
    await submitFileTask('исходный inline');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'edited inline');
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(feedText()).toContain('inline edited успех');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('исходный inline');
    expect(field().value).not.toContain('edited inline');
  });

  it('R35 multipart: edited-success очищает draft и не возвращает исходный текст в поле', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('multipart edited успех')));
    await open();
    await attach(image('edited-multipart.png'));
    await submitFileTask('исходный multipart');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'edited multipart');
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(feedText()).toContain('multipart edited успех');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('исходный multipart');
    expect(field().value).not.toContain('edited multipart');
  });

  it('R36: ordinary A files до первого refusal не смешиваются с новым attach B', async () => {
    await open();
    await attach(image('ordinary-a.png'));
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'обычная задача A');
    await switchTo(OLYA);
    await attach(image('ordinary-b.png', 2));
    expect(modalVisible()).toBe(true);
    expect(modalText()).toContain('ordinary-b.png');
    expect(modalText()).not.toContain('ordinary-a.png');
    expect(modalTask()).toBe('');
  });

  it('R37 inline: edited >2000 при save=false всё равно удаляет original draft после успеха', async () => {
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('long inline успех')));
    await open();
    await attach(new File(['строка'], 'long-inline.txt', { type: 'text/plain' }));
    await submitFileTask('original inline draft');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    const longEdit = `edited inline ${'я'.repeat(2050)}`;
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, longEdit);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(feedText()).toContain('long inline успех');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('original inline draft');
    expect(field().value).not.toContain('edited inline');
  });

  it('R37 multipart: edited >2000 при save=false всё равно удаляет original draft после успеха', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('long multipart успех')));
    await open();
    await attach(image('long-multipart.png'));
    await submitFileTask('original multipart draft');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    const longEdit = `edited multipart ${'я'.repeat(2050)}`;
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, longEdit);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(feedText()).toContain('long multipart успех');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('original multipart draft');
    expect(field().value).not.toContain('edited multipart');
  });

  it('R37 control: более новый текстовый refusal не удаляется при edited file success', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('файл успешен')));
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('control-draft.png'));
    await submitFileTask('original file draft');
    await send('другой живой draft');
    expect(storedDraft()).toMatchObject({ text: 'другой живой draft', assistant: '12' });
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    const longEdit = `edited control ${'я'.repeat(2050)}`;
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, longEdit);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(feedText()).toContain('файл успешен');
    expect(storedDraft()).toMatchObject({ text: 'другой живой draft', assistant: '12' });
  });

  it('R38 Cancel: после редактирования удаляется original draft, F5/A→B→A его не воскрешает', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('cancel-original.png'));
    await submitFileTask('original cancel draft');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'edited cancel');
    await clickElement(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle();
    expect(storedDraft()).toBeNull();
    await reload();
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('original cancel draft');
    expect(field().value).not.toContain('edited cancel');
    expect(modalVisible()).toBe(false);
  });

  it('R38 remove-last: после редактирования X тоже удаляет original draft без воскрешения', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('remove-original.png'));
    await submitFileTask('original remove draft');
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'edited remove');
    await removeOnlyFile();
    expect(storedDraft()).toBeNull();
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('original remove draft');
    expect(field().value).not.toContain('edited remove');
    expect(modalVisible()).toBe(false);
  });

  it('R38 control: Cancel после другого text refusal не удаляет более новый draft', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS));
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('cancel-control.png'));
    await submitFileTask('original control draft');
    await send('более новый текстовый draft');
    expect(storedDraft()).toMatchObject({ text: 'более новый текстовый draft', assistant: '12' });
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'edited control cancel');
    await clickElement(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle();
    expect(storedDraft()).toMatchObject({ text: 'более новый текстовый draft', assistant: '12' });
  });

  it('R39: shared image A получает owner и не смешивается с новым attach B', async () => {
    const originalCaches = globalThis.caches;
    const shared = new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), {
      headers: { 'X-Share-Filename': 'shared-a.png' },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        open: async () => ({
          match: async () => shared,
          delete: async () => true,
        }),
      },
    });
    try {
      window.history.replaceState({}, '', '/chat?shared_image=1');
      await open();
      await settle(14);
      expect(modalVisible()).toBe(true);
      expect(modalText()).toContain('shared-a.png');
      typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'задача shared A');
      await switchTo(OLYA);
      await attach(image('ordinary-b.png', 2));
      expect(modalText()).toContain('ordinary-b.png');
      expect(modalText()).not.toContain('shared-a.png');
      expect(modalTask()).toBe('');
    } finally {
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
    }
  });

  it('R40 success: повторный refusal длинной редактуры сохраняет original draft для удаления', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS), ndjson(NORMAL('R40 success')));
    await open();
    await attach(image('r40-success.png'));
    await submitFileTask('original R40 draft');
    await setTokens(5000);
    const longEdit = `R40 long edit ${'я'.repeat(2050)}`;
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, longEdit);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(storedDraft()).toMatchObject({ text: 'original R40 draft', assistant: '12' });
    await setTokens(0);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(feedText()).toContain('R40 success');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    await reload();
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('original R40 draft');
  });

  it('R40 Cancel: повторный refusal длинной редактуры не мешает удалить original draft', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    await open();
    await attach(image('r40-cancel.png'));
    await submitFileTask('original R40 cancel');
    await setTokens(5000);
    const longEdit = `R40 cancel edit ${'я'.repeat(2050)}`;
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, longEdit);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    expect(storedDraft()).toMatchObject({ text: 'original R40 cancel', assistant: '12' });
    await setTokens(0);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle();
    expect(storedDraft()).toBeNull();
    await reload();
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    expect(field().value).not.toContain('original R40 cancel');
    expect(modalVisible()).toBe(false);
  });

  it('R40 control: после повторного refusal более новый text draft сохраняется', async () => {
    net.uploadStreams.push(ndjson(NO_TOKENS), ndjson(NO_TOKENS));
    net.chatStreams.push(ndjson(NO_TOKENS));
    await open();
    await attach(image('r40-control.png'));
    await submitFileTask('original R40 control');
    await setTokens(5000);
    const longEdit = `R40 control edit ${'я'.repeat(2050)}`;
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, longEdit);
    await clickElement(buttonByText(tRu('chat.file_modal_submit'))!);
    await settle(20);
    await send('новый текстовый draft R40');
    expect(storedDraft()).toMatchObject({ text: 'новый текстовый draft R40', assistant: '12' });
    await setTokens(0);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    await clickElement(buttonByText(tRu('chat.file_modal_cancel'))!);
    await settle();
    expect(storedDraft()).toMatchObject({ text: 'новый текстовый draft R40', assistant: '12' });
  });

  it('R41 ordinary: задача без refusal видна после A→B→A без нового balance transition', async () => {
    await open();
    await attach(image('ordinary-return.png'));
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'ordinary task A');
    await switchTo(OLYA);
    expect(modalVisible()).toBe(false);
    await switchTo(ASSISTANT);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('ordinary task A');
    expect(modalText()).toContain('ordinary-return.png');
  });

  it('R41 shared: shared-image задача без refusal видна после A→B→A', async () => {
    const originalCaches = globalThis.caches;
    const shared = new Response(new Blob([new Uint8Array([1])], { type: 'image/png' }), {
      headers: { 'X-Share-Filename': 'shared-return.png' },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: async () => ({ match: async () => shared, delete: async () => true }) },
    });
    try {
      window.history.replaceState({}, '', '/chat?shared_image=1');
      await open();
      await settle(14);
      typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'shared task A');
      await switchTo(OLYA);
      expect(modalVisible()).toBe(false);
      await switchTo(ASSISTANT);
      expect(modalVisible()).toBe(true);
      expect(modalTask()).toBe('shared task A');
      expect(modalText()).toContain('shared-return.png');
    } finally {
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
    }
  });

  it('R42: late TEXT no_tokens сохраняет rejected для A и добавляет его к непустому полю при возврате', async () => {
    const gate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS, gate.promise, { deliverEndAfterAbort: true }));
    await open();
    typeInto(field(), 'late text A');
    await clickElement(sendButton());
    await settle();
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(field().value).not.toContain('late text A');
    expect(feedText()).not.toContain('late text A');
    expect(tokenPackagesVisible()).toBe(false);
    typeInto(field(), 'заметка B');
    await switchTo(ASSISTANT);
    expect(field().value.split('late text A')).toHaveLength(2);
    expect(field().value).toContain('заметка B');
    expect(storedDraft()).toBeNull();
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('R43 success: late multipart success не меняет ленту, streaming-state и поле активного B', async () => {
    const aGate = deferred();
    const bGate = deferred();
    net.uploadStreams.push(ndjson(NORMAL('A multipart success'), aGate.promise));
    net.chatStreams.push(ndjson(NORMAL('B stream answer'), bGate.promise));
    await open();
    await attach(image('late-success-a.png'));
    await submitFileTask('задача A');
    await switchTo(OLYA);
    sessionStorage.setItem('selected_assistant', JSON.stringify(OLYA));
    await send('ход B');
    expect(chatPosts()).toHaveLength(1);
    expect(chatPosts()[0].body).toMatchObject({ assistant: 2, chatInput: 'ход B' });
    typeInto(field(), 'поле B сохраняется');
    await act(async () => { aGate.resolve(); });
    await settle(14);
    expect(feedText()).not.toContain('A multipart success');
    expect(field().value).toBe('поле B сохраняется');
    expect(container().querySelector('[data-testid="live-activity"]') !== null || feedText().includes('B stream answer')).toBe(true);
    await act(async () => { bGate.resolve(); });
    await settle(14);
    expect(feedText()).toContain('B stream answer');
  });

  it('R43 error: late multipart error/finally не добавляет ошибку и не очищает активный B', async () => {
    const aGate = deferred();
    const bGate = deferred();
    net.uploadStreams.push(async () => {
      await aGate.promise;
      return { ok: false, status: 500, body: null };
    });
    net.chatStreams.push(ndjson(NORMAL('B active answer'), bGate.promise));
    await open();
    await attach(image('late-error-a.png'));
    await submitFileTask('задача A');
    await switchTo(OLYA);
    sessionStorage.setItem('selected_assistant', JSON.stringify(OLYA));
    await send('ход B');
    typeInto(field(), 'поле B не очищено');
    await act(async () => { aGate.resolve(); });
    await settle(14);
    expect(feedText()).not.toContain(tRu('chat.file_error_fallback'));
    expect(field().value).toBe('поле B не очищено');
    expect(container().querySelector('[data-testid="live-activity"]') !== null || feedText().includes('B active answer')).toBe(true);
    await act(async () => { bGate.resolve(); });
    await settle(14);
    expect(feedText()).toContain('B active answer');
  });

  it('R44: delayed Cache Storage после A→B не затирает B и сохраняет shared image для A', async () => {
    const originalCaches = globalThis.caches;
    let resolveCache!: (value: { match: () => Promise<Response>; delete: () => Promise<boolean> }) => void;
    const cacheGate = new Promise<{ match: () => Promise<Response>; delete: () => Promise<boolean> }>((resolve) => { resolveCache = resolve; });
    const shared = new Response(new Blob([new Uint8Array([1])], { type: 'image/png' }), {
      headers: { 'X-Share-Filename': 'delayed-shared-a.png' },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: () => cacheGate },
    });
    try {
      window.history.replaceState({}, '', '/chat?shared_image=1');
      await open();
      await switchTo(OLYA);
      await attach(image('current-b.png', 2));
      typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'задача B');
      await act(async () => {
        resolveCache({ match: async () => shared, delete: async () => true });
      });
      await settle(14);
      expect(modalVisible()).toBe(true);
      expect(modalTask()).toBe('задача B');
      expect(modalText()).toContain('current-b.png');
      expect(modalText()).not.toContain('delayed-shared-a.png');
      await switchTo(ASSISTANT);
      expect(modalVisible()).toBe(true);
      expect(modalText()).toContain('delayed-shared-a.png');
      expect(modalText()).not.toContain('current-b.png');
      expect(modalTask()).not.toBe('задача B');
    } finally {
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
    }
  });

  it('R45: history reload во время active-turn check не подставляет draft перед успешным retry', async () => {
    const activeTurnGate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('text retry success')));
    await open();
    await send('text retry draft');
    expect(storedDraft()).toMatchObject({ text: 'text retry draft', assistant: '12' });
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
    net.activeTurnGates.push(activeTurnGate.promise);
    net.activeTurnGateEnabled = true;
    await clickElement(sendButton());
    await settle();
    const toggle = container().querySelector('[data-testid="fresh-mode-toggle"]') as HTMLButtonElement;
    await clickElement(toggle);
    await settle(20);
    await act(async () => { activeTurnGate.resolve(); });
    await settle(20);
    expect(feedText()).toContain('text retry success');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
    nowSpy.mockRestore();
  });

  it('R46A: rejected >2000 при save=false возвращается полностью из late носителя и очищается после retry', async () => {
    const gate = deferred();
    const longRejected = `late long ${'я'.repeat(2050)}`;
    net.chatStreams.push(
      ndjson(NO_TOKENS, gate.promise, { deliverEndAfterAbort: true }),
      ndjson(NORMAL('late long success')),
    );
    await open();
    typeInto(field(), longRejected);
    await clickElement(sendButton());
    await settle();
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(storedDraft()).toBeNull();
    expect(field().value).not.toContain('late long');
    expect(tokenPackagesVisible()).toBe(false);
    await switchTo(ASSISTANT);
    expect(field().value).toBe(longRejected);
    await clickElement(sendButton());
    await settle(20);
    expect(feedText()).toContain('late long success');
    expect(field().value).toBe('');
    expect(storedDraft()).toBeNull();
  });

  it('R46B: живой draft другого assistant не мешает late носителю A и сохраняется', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'живой draft B', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    const gate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS, gate.promise, { deliverEndAfterAbort: true }));
    await open();
    typeInto(field(), 'late rejected A');
    await clickElement(sendButton());
    await settle();
    await switchTo(OLYA);
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(storedDraft()).toMatchObject({ text: 'живой draft B', assistant: '14' });
    expect(field().value).not.toContain('late rejected A');
    typeInto(field(), 'заметка B');
    await switchTo(ASSISTANT);
    expect(field().value.split('late rejected A')).toHaveLength(2);
    expect(field().value).toContain('заметка B');
    expect(storedDraft()).toMatchObject({ text: 'живой draft B', assistant: '14' });
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('R47: ordinary A files/task открываются после возврата с активного B до конца его stream', async () => {
    const gate = deferred();
    net.chatStreams.push(ndjson(NORMAL('B late answer'), gate.promise));
    await open();
    await attach(image('ordinary-r47.png'));
    typeInto(fileModal()?.querySelector('textarea') as HTMLTextAreaElement, 'ordinary R47 task');
    await switchTo(OLYA);
    sessionStorage.setItem('selected_assistant', JSON.stringify(OLYA));
    await send('B active turn');
    expect(chatPosts()).toHaveLength(1);
    await switchTo(ASSISTANT);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('ordinary R47 task');
    expect(modalText()).toContain('ordinary-r47.png');
    await act(async () => { gate.resolve(); });
    await settle(14);
    expect(feedText()).not.toContain('B late answer');
    expect(modalVisible()).toBe(true);
  });

  it('R48: два A multipart в обратном порядке — поздний старый refusal не затирает новую задачу', async () => {
    const first = deferred();
    const second = deferred();
    net.uploadStreams.push(
      ndjson(NO_TOKENS, first.promise),
      ndjson(NO_TOKENS, second.promise),
    );
    await open();
    await attach(image('attempt-one.png'));
    await submitFileTask('первая попытка');
    await switchTo(OLYA);
    await switchTo(ASSISTANT);
    await attach(image('attempt-two.png', 2));
    await submitFileTask('вторая попытка');
    await act(async () => { second.resolve(); });
    await settle(14);
    expect(storedDraft()).toMatchObject({ text: 'вторая попытка', assistant: '12' });
    await act(async () => { first.resolve(); });
    await settle(14);
    await setTokens(5000);
    expect(modalVisible()).toBe(true);
    expect(modalTask()).toBe('вторая попытка');
    expect(modalText()).toContain('attempt-two.png');
    expect(modalText()).not.toContain('attempt-one.png');
    expect(storedDraft()).toMatchObject({ text: 'вторая попытка', assistant: '12' });
  });

  it('R49: late text A/B имеют независимые носители, старая попытка не затирает новую', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({
      text: 'живой чужой draft', assistant: '14', expires: Date.now() + 3_600_000,
    }));
    const a1 = deferred();
    const b1 = deferred();
    const a2 = deferred();
    net.chatStreams.push(
      ndjson(NO_TOKENS, a1.promise, { deliverEndAfterAbort: true }),
      ndjson(NO_TOKENS, b1.promise, { deliverEndAfterAbort: true }),
      ndjson(NO_TOKENS, a2.promise, { deliverEndAfterAbort: true }),
    );
    await open();
    typeInto(field(), 'старый late A');
    await clickElement(sendButton());
    await settle();
    await switchTo(OLYA);
    sessionStorage.setItem('selected_assistant', JSON.stringify(OLYA));
    typeInto(field(), 'late B');
    await clickElement(sendButton());
    await settle();
    await switchTo(ASSISTANT);
    sessionStorage.setItem('selected_assistant', JSON.stringify(ASSISTANT));
    typeInto(field(), 'новый late A');
    await clickElement(sendButton());
    await settle();
    await switchTo(OLYA);
    await act(async () => { a2.resolve(); });
    await settle(10);
    await act(async () => { a1.resolve(); });
    await settle(10);
    await switchTo(ASSISTANT);
    await act(async () => { b1.resolve(); });
    await settle(14);
    typeInto(field(), '');
    await switchTo(OLYA);
    expect(field().value).toContain('late B');
    typeInto(field(), '');
    await switchTo(ASSISTANT);
    expect(field().value).toContain('новый late A');
    expect(field().value).not.toContain('старый late A');
    expect(storedDraft()).toMatchObject({ text: 'живой чужой draft', assistant: '14' });
    expect(tokenPackagesVisible()).toBe(false);
  });

  it('R50: queue-flush/history pull не возвращает отправляемый draft до успеха', async () => {
    const historyGate = deferred();
    net.chatStreams.push(ndjson(NO_TOKENS), ndjson(NORMAL('queue flush success')));
    await open();
    await send('queue draft');
    expect(storedDraft()).toMatchObject({ text: 'queue draft', assistant: '12' });
    const toggle = container().querySelector('[data-testid="fresh-mode-toggle"]') as HTMLButtonElement;
    await clickElement(toggle);
    net.historyGates.push(historyGate.promise);
    net.historyGateEnabled = true;
    await send('queue draft');
    await settle(20);
    await act(async () => { historyGate.resolve(); });
    await settle(20);
    expect(feedText()).toContain('queue flush success');
    expect(storedDraft()).toBeNull();
    expect(field().value).toBe('');
  });
});
