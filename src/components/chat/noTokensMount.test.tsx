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
        if (url.startsWith('/webhook/chat/history')) return ok({ messages: net.history, hasMore: false });
        if (url.startsWith('/webhook/chat/active-turn')) return ok({ active: false });
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
vi.mock('./ActivitySteps', () => ({ LiveActivity: () => null, ActivitySummaryView: () => null }));
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
  auth.user = { phone: '70000000000', tokens: 0 };
  net.history = HISTORY;
  net.chatStreams = [];
  net.uploadStreams = [];
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
    await send('ход B');
    expect(chatPosts()).toHaveLength(1);
    expect(container().querySelectorAll('.animate-bounce').length).toBeGreaterThan(0);

    await act(async () => { resolveRead('текст A'); });
    await settle(14);
    expect(chatPosts()).toHaveLength(1);
    expect(chatPosts()[0].body).toMatchObject({ chatInput: 'ход B' });
    expect(container().querySelectorAll('.animate-bounce').length).toBeGreaterThan(0);
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
});
