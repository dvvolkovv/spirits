// @vitest-environment jsdom
//
// Кнопка «Прослушать» вместе с общим плеером ленты. Утверждения — про надпись
// на кнопке (что видит человек) и про то, что реально ушло в динамик: src
// элемента в момент play(), без беззвучной разблокировки.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actAsync, click, clickAsync, flush, mount, tRu } from '../../../test/dom';
import ListenButton from './ListenButton';
import { useListenPlayer } from './useListenPlayer';
import { apiClient } from '../../../services/apiClient';
import toast from 'react-hot-toast';
import { formatNumber } from '../../../utils/formatters';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../../../services/apiClient', () => ({ apiClient: { post: vi.fn() } }));
// Настоящий форматтер тянет конфиг i18next (initReactI18next), а react-i18next
// здесь подменён. Разряды числа проверяют тесты самого форматтера.
vi.mock('../../../utils/formatters', () => ({ formatNumber: (n: number) => String(n) }));

const post = vi.mocked(apiClient.post);
const toastError = vi.mocked(toast.error);

let played: string[] = [];
let audioEl: HTMLMediaElement | null = null;
let playImpl: () => Promise<void> = async () => {};

beforeEach(() => {
  played = [];
  audioEl = null;
  playImpl = async () => {};
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    audioEl = this;
    if (this.src.startsWith('data:')) return Promise.resolve();
    played.push(this.src);
    return playImpl();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  post.mockReset();
  toastError.mockReset();
  document.body.innerHTML = '';
});

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const OK = (parts: string[]) =>
  reply(200, { ok: true, parts, chars: 10, tokensSpent: 1000, cached: false, voice: 'zahar', provider: 'yandex' });

/** Промис, который тест разрешает сам, — чтобы увидеть промежуточную фазу. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function Feed({ items }: { items: Array<{ id: string; content: string }> }) {
  const listen = useListenPlayer();
  return (
    <div>
      {items.map((m) => (
        <div key={m.id} data-id={m.id}>
          <ListenButton
            messageId={m.id}
            content={m.content}
            assistant="Роман"
            phase={listen.phaseOf(m.id)}
            onToggle={listen.toggle}
          />
        </div>
      ))}
    </div>
  );
}

const btn = (c: HTMLElement, id: string) => c.querySelector(`[data-id="${id}"] button`) as HTMLButtonElement | null;
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const fire = async (type: 'ended' | 'error') => {
  await actAsync(() => { audioEl!.dispatchEvent(new Event(type)); });
  await settle();
};

describe('ListenButton — вид', () => {
  it('в покое «Прослушать», цена — в подсказке', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет! Это ответ ассистента.' }]} />);
    const b = btn(container, 'm1')!;
    expect(b.textContent).toBe(tRu('chat.listen'));
    expect(b.title).toBe(tRu('chat.listen_title', { tokens: formatNumber(1000), unit: tRu('chat.tokens_suffix') }));
  });

  it('ответ без текста для чтения — кнопки нет', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: '![](https://a.b/c.png)' }]} />);
    expect(btn(container, 'm1')).toBeNull();
  });

  it('слишком длинный ответ — кнопка погашена и объясняет почему', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'я'.repeat(10_001) }]} />);
    const b = btn(container, 'm1')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(tRu('chat.listen_too_long', { max: formatNumber(10_000) }));
  });
});

describe('плеер ответа', () => {
  it('«Озвучиваю…» → «Остановить» → куски по порядку → снова «Прослушать»', async () => {
    const d = deferred<Response>();
    post.mockImplementation(() => d.promise);
    const { container } = mount(<Feed items={[{ id: 'm1', content: '**Привет!** Это ответ.' }]} />);

    await clickAsync(btn(container, 'm1')!);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_loading'));
    expect(post).toHaveBeenCalledWith(
      '/webhook/speech/listen',
      { text: 'Привет! Это ответ.', assistant: 'Роман' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await actAsync(() => d.resolve(OK(['https://m.test/a-0.mp3', 'https://m.test/a-1.mp3'])));
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
    expect(played).toEqual(['https://m.test/a-0.mp3']);

    await fire('ended');
    expect(played).toEqual(['https://m.test/a-0.mp3', 'https://m.test/a-1.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));

    await fire('ended');
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
  });

  it('звук разблокируется синхронно в момент нажатия — до ответа бэка', () => {
    // iOS даёт звук только элементу, который уже играл по жесту, а куски
    // приходят через секунды синтеза. Без беззвучного play() внутри самого
    // нажатия первый ответ на айфоне молчал бы. В jsdom политики автозапуска
    // нет — поэтому сторожим сам вызов.
    post.mockImplementation(() => deferred<Response>().promise);
    const srcs: string[] = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (this: HTMLMediaElement) {
      srcs.push(this.src.split(';')[0]);
      return Promise.resolve();
    });
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    click(btn(container, 'm1')!);
    expect(srcs).toEqual(['data:audio/wav']);
  });

  it('повторное нажатие на звучащий ответ останавливает его', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));

    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    // Поздний 'ended' остановленного куска ничего не включает.
    audioEl!.dispatchEvent(new Event('ended'));
    expect(played).toEqual(['https://m.test/a-0.mp3']);
  });

  it('второй ответ глушит первый', async () => {
    post.mockImplementation(async (_url: string, body: any) => OK([`https://m.test/${body.text.length}.mp3`]));
    const { container } = mount(
      <Feed items={[{ id: 'm1', content: 'Первый.' }, { id: 'm2', content: 'Второй, подлиннее.' }]} />,
    );
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await clickAsync(btn(container, 'm2')!);
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(btn(container, 'm2')!.textContent).toBe(tRu('chat.listen_stop'));
    expect(played).toEqual(['https://m.test/7.mp3', 'https://m.test/18.mp3']);
  });

  it('повтор в той же сессии не ходит на бэк', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await fire('ended');
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(played).toEqual(['https://m.test/a-0.mp3', 'https://m.test/a-0.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('402 — тост с ценой, кнопка снова «Прослушать», звука нет', async () => {
    post.mockResolvedValue(reply(402, { ok: false, error: 'insufficient_tokens', balance: 0, required: 2000 }));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_no_tokens', { required: formatNumber(2000) }));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(played).toEqual([]);
  });

  it('429 — тост «слишком часто»', async () => {
    post.mockResolvedValue(reply(429, { ok: false, error: 'rate_limited', retryAfterSec: 60 }));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_rate_limited'));
  });

  it('сбой сети — общий тост', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_failed'));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
  });

  it('браузер не дал играть — просим нажать ещё раз; второе нажатие без запроса', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    playImpl = async () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); };
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_tap_again'));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));

    playImpl = async () => {};
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('кусок не загрузился — общий тост, и следующий раз куски берутся заново', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await fire('error');
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_failed'));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));

    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('поздний ответ бэка по брошенному ответу не включает его звук', async () => {
    const d1 = deferred<Response>();
    const d2 = deferred<Response>();
    post.mockImplementationOnce(() => d1.promise).mockImplementationOnce(() => d2.promise);
    const { container } = mount(
      <Feed items={[{ id: 'm1', content: 'Первый.' }, { id: 'm2', content: 'Второй.' }]} />,
    );
    await clickAsync(btn(container, 'm1')!);
    await clickAsync(btn(container, 'm2')!);
    await actAsync(() => d1.resolve(OK(['https://m.test/first.mp3'])));
    await settle();
    expect(played).toEqual([]);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(btn(container, 'm2')!.textContent).toBe(tRu('chat.listen_loading'));

    await actAsync(() => d2.resolve(OK(['https://m.test/second.mp3'])));
    await settle();
    expect(played).toEqual(['https://m.test/second.mp3']);
  });

  it('размонтирование ленты глушит звук', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const m = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(m.container, 'm1')!);
    await settle();
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const before = pause.mock.calls.length;
    m.unmount();
    expect(pause.mock.calls.length).toBeGreaterThan(before);
  });
});
