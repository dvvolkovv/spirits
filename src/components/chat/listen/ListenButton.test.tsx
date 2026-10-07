// @vitest-environment jsdom
//
// Кнопка «Прослушать» вместе с общим плеером ленты. Утверждения — про надпись
// на кнопке (что видит человек) и про то, что реально ушло в динамик: src
// элемента в момент play(), без беззвучной разблокировки.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actAsync, click, clickAsync, doubleClick, flush, mount, tRu } from '../../../test/dom';
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
let playImpl: () => Promise<void> = async () => {};

beforeEach(() => {
  played = [];
  playImpl = async () => {};
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
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
            isKnown={listen.isKnown}
            onToggle={listen.toggle}
          />
        </div>
      ))}
    </div>
  );
}

/** Надпись в покое: с ценой, пока ответ не прослушан в этой сессии. */
const priced = (tokens: number) => tRu('chat.listen_priced', { tokens: formatNumber(tokens) });

const btn = (c: HTMLElement, id: string) => c.querySelector(`[data-id="${id}"] button`) as HTMLButtonElement | null;
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Общий <audio> ленты — тот, на ком последний раз звали play(). */
const audio = (): HTMLMediaElement => {
  const contexts = vi.mocked(HTMLMediaElement.prototype.play).mock.contexts;
  return contexts[contexts.length - 1] as HTMLMediaElement;
};
const fire = async (type: 'ended' | 'error' | 'pause') => {
  await actAsync(() => { audio().dispatchEvent(new Event(type)); });
  await settle();
};

describe('ListenButton — вид', () => {
  it('в покое цена видна прямо в надписи — на телефоне подсказок нет', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет! Это ответ ассистента.' }]} />);
    const b = btn(container, 'm1')!;
    expect(b.textContent).toBe(priced(1000));
    expect(b.title).toBe(tRu('chat.listen_title', { tokens: formatNumber(1000), unit: tRu('chat.tokens_suffix') }));
  });

  it('после прослушивания в этой сессии повтор бесплатен — цена из надписи уходит', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }, { id: 'm2', content: 'Другой.' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await fire('ended');
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(btn(container, 'm1')!.title).toBe(tRu('chat.listen_title_free'));
    // Соседний, ещё не прослушанный ответ цену показывает по-прежнему.
    expect(btn(container, 'm2')!.textContent).toBe(priced(1000));
  });

  it('ответ без текста для чтения — кнопки нет', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: '![](https://a.b/c.png)' }]} />);
    expect(btn(container, 'm1')).toBeNull();
  });

  it('слишком длинный ответ — кнопка погашена, без цены, и объясняет почему', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'я'.repeat(10_001) }]} />);
    const b = btn(container, 'm1')!;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe(tRu('chat.listen'));
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
    // Без AbortSignal: синтез оплачивается на сервере в любом случае, брошенный
    // запрос доживает и кладёт куски в кэш.
    expect(post).toHaveBeenCalledWith('/webhook/speech/listen', { text: 'Привет! Это ответ.', assistant: 'Роман' });

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
    audio().dispatchEvent(new Event('ended'));
    expect(played).toEqual(['https://m.test/a-0.mp3']);
  });

  it('второй ответ глушит первый', async () => {
    post.mockImplementation(async (_url: string, body: { text: string }) => OK([`https://m.test/${body.text.length}.mp3`]));
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
    expect(btn(container, 'm1')!.textContent).toBe(priced(1000));
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
    expect(btn(container, 'm1')!.textContent).toBe(priced(1000));
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
    // Битые куски забыты — следующий раз снова запрос, а значит, снова цена.
    expect(btn(container, 'm1')!.textContent).toBe(priced(1000));

    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('битый кусок: и error, и отказ play() — но тост один', async () => {
    // Браузер сначала шлёт событие error, следом отклоняет висящий play() с
    // NotSupportedError (проверено в Chromium). Обе ветки ведут в общий
    // обработчик ошибки, и без защиты пользователь видел два одинаковых тоста.
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    let rejectPlay!: (e: unknown) => void;
    playImpl = () => new Promise<void>((_, rej) => { rejectPlay = rej; });
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await actAsync(() => {
      audio().dispatchEvent(new Event('error'));
      rejectPlay(Object.assign(new Error('no supported source'), { name: 'NotSupportedError' }));
    });
    await settle();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_failed'));
  });

  it('пока озвучивается, кнопка погашена: повторное нажатие не отменяет оплаченный синтез', async () => {
    // Синтез оплачивается на сервере независимо от клиента: «отменить» его
    // нажатием значило бы заплатить и ничего не услышать.
    const d = deferred<Response>();
    post.mockImplementation(() => d.promise);
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    expect(btn(container, 'm1')!.disabled).toBe(true);
    await clickAsync(btn(container, 'm1')!);
    await actAsync(() => d.resolve(OK(['https://m.test/a-0.mp3'])));
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(played).toEqual(['https://m.test/a-0.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('двойной клик (оба нажатия до перерисовки) — один запрос, и звук всё равно звучит', async () => {
    const d = deferred<Response>();
    post.mockImplementation(() => d.promise);
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    doubleClick(btn(container, 'm1')!);
    await actAsync(() => d.resolve(OK(['https://m.test/a-0.mp3'])));
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(played).toEqual(['https://m.test/a-0.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('брошенная озвучка не пропадает: вернулся к ответу — звучит без второго запроса', async () => {
    const d1 = deferred<Response>();
    post
      .mockImplementationOnce(() => d1.promise)
      .mockImplementation(async () => OK(['https://m.test/second.mp3']));
    const { container } = mount(
      <Feed items={[{ id: 'm1', content: 'Первый.' }, { id: 'm2', content: 'Второй.' }]} />,
    );
    await clickAsync(btn(container, 'm1')!);
    await clickAsync(btn(container, 'm2')!);
    await settle();
    await actAsync(() => d1.resolve(OK(['https://m.test/first.mp3'])));
    await settle();
    expect(played).toEqual(['https://m.test/second.mp3']);

    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
    expect(played).toEqual(['https://m.test/second.mp3', 'https://m.test/first.mp3']);
  });

  it('вернулся к ответу, пока он ещё озвучивается, — ждём тот же запрос, второго не шлём', async () => {
    const d1 = deferred<Response>();
    post
      .mockImplementationOnce(() => d1.promise)
      .mockImplementation(async () => OK(['https://m.test/second.mp3']));
    const { container } = mount(
      <Feed items={[{ id: 'm1', content: 'Первый.' }, { id: 'm2', content: 'Второй.' }]} />,
    );
    await clickAsync(btn(container, 'm1')!);
    await clickAsync(btn(container, 'm2')!);
    await settle();
    await clickAsync(btn(container, 'm1')!);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_loading'));
    await actAsync(() => d1.resolve(OK(['https://m.test/first.mp3'])));
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
    expect(played).toEqual(['https://m.test/second.mp3', 'https://m.test/first.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('пауза извне (звонок, экран блокировки) возвращает «Прослушать»', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
    await fire('pause');
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
  });

  it('пауза в конце куска — не стоп: браузер шлёт её перед ended, следующий кусок играет', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3', 'https://m.test/a-1.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    const el = audio();
    Object.defineProperty(el, 'ended', { configurable: true, get: () => true });
    await fire('pause');
    delete (el as unknown as { ended?: boolean }).ended;
    await fire('ended');
    expect(played).toEqual(['https://m.test/a-0.mp3', 'https://m.test/a-1.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('следующий кусок подгружается заранее — без паузы на стыке', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3', 'https://m.test/a-1.mp3']));
    const created: HTMLAudioElement[] = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const el = createElement(tag, options);
      if (tag === 'audio') created.push(el as HTMLAudioElement);
      return el;
    }) as typeof document.createElement);
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    const next = created.filter((el) => el.getAttribute('src') === 'https://m.test/a-1.mp3');
    expect(next).toHaveLength(1);
    expect(next[0].preload).toBe('auto');
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
