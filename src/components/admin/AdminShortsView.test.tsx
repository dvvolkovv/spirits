// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actAsync, clickAsync, doubleClick, flush, mount, type, Mounted } from '../../test/dom';

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { post, get } }));

import AdminShortsView from './AdminShortsView';

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const VERSION = '2026-10-30 12:34:56.123456+00';
const item = (over: Record<string, unknown> = {}) => ({
  id: 's1', rubric: 'assistant', angle: 'roast', angleLocked: false, source: 'catalog', topicKey: 'catalog:2030-W01:1',
  topicHint: 'Залог при аренде', title: 'Залог при аренде', assistantId: 10, format: 'skit',
  scene: { assistantName: 'Алексей', question: 'Проверьте договор' }, status: 'pending_review',
  slotAt: '2030-01-05T15:00:00.000Z', approvedAt: null, failedFrom: null, lastError: null, attempts: 0,
  ownerNote: null, durationMs: 44000, publishedAt: null, createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z', version: VERSION, publications: [], ...over,
});
const detailOf = (over: Record<string, unknown> = {}) => {
  const base = item(over);
  return {
    ...base, capture: { answerText: 'ответ' }, script: { hook: 'Зацепка', lines: [] },
    captions: { telegram: 'Подпись в канал', youtube: { title: 'Заголовок YouTube' } }, animation: { omniSeconds: 16 },
    // По версии по умолчанию — как на бэке (cache-buster); тест может перебить
    // явным videoUrl через over, он уйдёт вторым спредом ниже.
    videoUrl: `https://my.linkeon.io/smm-media/linkeon-smm-videos/shorts/${base.id}/video.mp4?v=${encodeURIComponent(String(base.version))}`,
    coverUrl: null,
    ...over,
  };
};

let m: Mounted;
const q = (id: string) => m.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const sent = () => post.mock.calls.map((c) => c[1]);
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await flush();
};
/**
 * Действия без обработчика в таблице теста. Раньше `serve()` на них бросал,
 * компонент сам ловил бросок (`fail()` в `load`/`act`/...) и превращал его в
 * баннер — тест, не проверявший баннер, зеленел молча. Теперь неожиданное
 * действие копится здесь, и `afterEach` требует, чтобы список был пуст.
 */
let unexpectedActions: string[] = [];
/** Сервер по таблице действий; незнакомое действие — записано, не только брошено. */
function serve(table: Record<string, (payload: any) => unknown>) {
  post.mockImplementation(async (_url: string, payload: any) => {
    const h = table[payload.action];
    if (!h) {
      unexpectedActions.push(payload.action);
      throw new Error(`неожиданное действие ${payload.action}`);
    }
    return h(payload);
  });
}
const open = async () => {
  m = mount(<AdminShortsView />);
  await settle();
};
const openCard = async () => {
  await clickAsync(q('short-toggle-s1')!);
  await settle();
};

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  get.mockResolvedValue(res(200, [{ id: 10, name: 'Алексей', displayName: 'Алексей — юрист' }]));
  unexpectedActions = [];
});
afterEach(() => {
  m?.unmount();
  vi.restoreAllMocks();
  expect(unexpectedActions, `неожиданные действия: ${unexpectedActions.join(', ')}`).toEqual([]);
});

describe('экран «Ролики»', () => {
  it('очередь — группы по срочности, числа на переключателе, архив отдельно', async () => {
    serve({
      list: () => res(200, [
        item({ id: 'a', status: 'idea', slotAt: null }),
        item({ id: 'b', status: 'writing' }),
        item({ id: 'c', status: 'approved' }),
        item({ id: 'd', status: 'failed', failedFrom: 'animating', lastError: 'Omni 429' }),
        item({ id: 'e', status: 'pending_review' }),
        item({
          id: 'f', status: 'published', publishedAt: '2030-01-02T15:00:00.000Z',
          publications: [{ platform: 'telegram', status: 'published', url: 'https://t.me/ainomira/90', lastError: null }],
        }),
        item({ id: 'g', status: 'rejected' }),
      ]),
    });
    await open();
    const groups = [...m.container.querySelectorAll('[data-testid^="shorts-group-"]')].map((el) => el.getAttribute('data-testid'));
    expect(groups).toEqual(['shorts-group-review', 'shorts-group-failed', 'shorts-group-scheduled', 'shorts-group-working', 'shorts-group-ideas']);
    expect(q('shorts-screen-queue')!.textContent).toBe('В очереди 5');
    expect(q('shorts-screen-published')!.textContent).toBe('Вышли 1');
    expect(q('short-line-d')!.textContent).toBe('упал: оживление');
    await clickAsync(q('shorts-screen-published')!);
    expect(q('short-f')).toBeTruthy();
    expect(q('short-e')).toBeNull();
  });

  it('раскрытие зовёт get; видео — по нажатию, с меткой версии', async () => {
    serve({ list: () => res(200, [item()]), get: () => res(200, detailOf()) });
    await open();
    await openCard();
    expect(sent()).toContainEqual({ action: 'get', id: 's1' });
    const video = q('short-video-s1') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.getAttribute('src')).toContain('?v=');
    expect(m.container.textContent).toContain('Подпись в канал');
  });

  it('«Одобрить» — с версией открытой карточки; итог — когда выйдет; список перечитан, карточка закрыта', async () => {
    serve({
      list: () => res(200, [item()]),
      get: () => res(200, detailOf()),
      approve: () => res(200, item({ status: 'approved', slotAt: '2030-01-05T15:00:00.000Z' })),
    });
    await open();
    await openCard();
    await clickAsync(q('short-approve')!);
    await settle();
    expect(sent()).toContainEqual({ action: 'approve', id: 's1', version: VERSION });
    expect(q('shorts-notice')!.textContent).toMatch(/^Одобрено\. Выйдет /);
    expect(sent().filter((p) => p.action === 'list')).toHaveLength(2);
    expect(q('short-details-s1')).toBeNull();
  });

  it('409 — жёлтая плашка с причиной, сам список не перечитывается; «Загрузить заново» даёт новую версию и видео, следующее решение — с ними', async () => {
    serve({
      list: () => res(200, [item()]),
      get: () => res(200, detailOf()),
      approve: () => res(409, {
        statusCode: 409, error: 'version_conflict', message: 'Ролик изменился, пока был открыт: на экране устаревшая версия',
      }),
    });
    await open();
    await openCard();
    await clickAsync(q('short-approve')!);
    await settle();
    const banner = q('shorts-error')!;
    expect(banner.getAttribute('data-conflict')).toBe('true');
    expect(banner.textContent).toContain('Ролик изменился, пока был открыт');
    expect(sent().filter((p) => p.action === 'list')).toHaveLength(1);

    // «Загрузить заново» приносит новую версию и новое видео — и то, и то
    // ложится в открытую карточку, а не только в строку списка.
    const V2 = '2026-10-30 13:00:00.000000+00';
    const videoV2 = `https://my.linkeon.io/smm-media/linkeon-smm-videos/shorts/s1/video.mp4?v=${encodeURIComponent(V2)}`;
    serve({
      list: () => res(200, [item({ version: V2 })]),
      get: () => res(200, detailOf({ version: V2, videoUrl: videoV2 })),
      approve: () => res(200, item({ version: V2, status: 'approved' })),
    });
    await clickAsync(q('shorts-conflict-reload')!);
    await settle();
    expect(sent().filter((p) => p.action === 'list')).toHaveLength(2);
    expect(sent().filter((p) => p.action === 'get')).toHaveLength(2);
    expect((q('short-video-s1') as HTMLVideoElement).getAttribute('src')).toBe(videoV2);

    await clickAsync(q('short-approve')!);
    await settle();
    expect(sent()).toContainEqual({ action: 'approve', id: 's1', version: V2 });
  });

  it('двойное нажатие «Одобрить» — один запрос', async () => {
    let release: () => void = () => {};
    serve({
      list: () => res(200, [item()]),
      get: () => res(200, detailOf()),
      approve: () => new Promise((resolve) => {
        release = () => resolve(res(200, item({ status: 'approved' })));
      }),
    });
    await open();
    await openCard();
    doubleClick(q('short-approve')!);
    expect(sent().filter((p) => p.action === 'approve')).toHaveLength(1);
    await actAsync(() => release());
    await settle();
  });

  it('«Опубликовать сейчас» — только после подтверждения', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const approved = { status: 'approved', approvedAt: '2030-01-01T11:00:00.000Z' };
    serve({ list: () => res(200, [item(approved)]), get: () => res(200, detailOf(approved)) });
    await open();
    await openCard();
    await clickAsync(q('short-publish-now')!);
    expect(confirm).toHaveBeenCalled();
    expect(sent().some((p) => p.action === 'publish_now')).toBe(false);
  });

  it('отказ от подтверждения «Опубликовать сейчас» не держит замок — следующий клик снова спрашивает и, если принят, отправляет запрос', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    confirm.mockReturnValueOnce(false);
    const approved = { status: 'approved', approvedAt: '2030-01-01T11:00:00.000Z' };
    serve({
      list: () => res(200, [item(approved)]),
      get: () => res(200, detailOf(approved)),
      publish_now: () => res(200, item({ ...approved, status: 'publishing' })),
    });
    await open();
    await openCard();

    // Отказ: замок не берётся (он ставится только ПОСЛЕ подтверждения) —
    // следующее нажатие должно снова спросить, а не молча ничего не сделать.
    await clickAsync(q('short-publish-now')!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(sent().some((p) => p.action === 'publish_now')).toBe(false);

    confirm.mockReturnValueOnce(true);
    await clickAsync(q('short-publish-now')!);
    await settle();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(sent()).toContainEqual({ action: 'publish_now', id: 's1' });
  });

  it('«Запустить сейчас» у идеи — прямо в строке, после подтверждения (сборка тратит секунды Omni)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    serve({ list: () => res(200, [item({ status: 'idea', slotAt: null })]), start_now: () => res(200, item({ status: 'directing' })) });
    await open();
    await clickAsync(q('short-start-s1')!);
    await settle();
    expect(confirm).toHaveBeenCalled();
    expect(sent()).toContainEqual({ action: 'start_now', id: 's1' });
    expect(q('shorts-notice')!.textContent).toContain('Ролик запущен');
  });

  it('замечание уходит с версией и текстом', async () => {
    serve({ list: () => res(200, [item()]), get: () => res(200, detailOf()), note: () => res(200, item({ status: 'writing' })) });
    await open();
    await openCard();
    type(q('short-note')!, '  короче и без цифр ');
    await clickAsync(q('short-send-note')!);
    await settle();
    expect(sent()).toContainEqual({ action: 'note', id: 's1', version: VERSION, text: 'короче и без цифр' });
  });

  it('нет внятного ответа на решение — «Не подтверждено», без вывода о результате', async () => {
    serve({ list: () => res(200, [item()]), get: () => res(200, detailOf()), approve: () => res(502, '<html>') });
    await open();
    await openCard();
    await clickAsync(q('short-approve')!);
    await settle();
    expect(q('shorts-error')!.textContent).toBe(
      'Не подтверждено: сервер ответил 502. Нажмите «Обновить», затем сверните и раскройте ролик заново, прежде чем повторять.',
    );
    expect(q('shorts-notice')).toBeNull();
  });

  it('дубль заказа (order → null) — новое уведомление, тема остаётся в поле', async () => {
    serve({ list: () => res(200, []), order: () => res(200, null) });
    await open();
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    await clickAsync(q('shorts-order-submit')!);
    await settle();
    expect(q('shorts-notice')!.textContent).toBe('Такой ролик уже заказан — он в «Идеях». Текст оставлен в поле.');
    expect((q('shorts-order-topic') as HTMLInputElement).value).toBe('Разнос плохого договора аренды');
  });

  it('заказ прошёл, но список не перечитался — поясняет, что не обновился список, а не что заказ не прошёл', async () => {
    serve({ list: () => res(200, []) });
    await open();
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action === 'order') return res(200, { id: 'new1' });
      if (payload.action === 'list') return res(500, { statusCode: 500, message: 'Внутренняя ошибка' });
      unexpectedActions.push(payload.action);
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await clickAsync(q('shorts-order-submit')!);
    await settle();
    expect(q('shorts-notice')!.textContent).toContain('Ролик заказан');
    expect(q('shorts-error')!.textContent).toBe('Список не обновился: Внутренняя ошибка');
  });

  it('пополнение тем прошло, но список не перечитался — поясняет, что не обновился список, а не что пополнение не прошло', async () => {
    serve({ list: () => res(200, []) });
    await open();
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action === 'refill_topics') return res(200, { added: 3 });
      if (payload.action === 'list') return res(500, { statusCode: 500, message: 'Внутренняя ошибка' });
      unexpectedActions.push(payload.action);
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await clickAsync(q('shorts-refill')!);
    await settle();
    expect(q('shorts-notice')!.textContent).toBe('Добавлено тем: 3');
    expect(q('shorts-error')!.textContent).toBe('Список не обновился: Внутренняя ошибка');
  });

  it('набранная тема переживает переключение на «Вышли» и обратно', async () => {
    serve({
      list: () => res(200, [item({
        id: 'f', status: 'published', publishedAt: '2030-01-02T15:00:00.000Z',
        publications: [{ platform: 'telegram', status: 'published', url: 'https://t.me/ainomira/90', lastError: null }],
      })]),
    });
    await open();
    type(q('shorts-order-topic')!, 'Начатая, но не отправленная тема');
    expect(q('shorts-order')!.closest('[hidden]')).toBeNull();
    await clickAsync(q('shorts-screen-published')!);
    expect(q('shorts-order')!.closest('[hidden]')).not.toBeNull();
    await clickAsync(q('shorts-screen-queue')!);
    expect(q('shorts-order')!.closest('[hidden]')).toBeNull();
    expect((q('shorts-order-topic') as HTMLInputElement).value).toBe('Начатая, но не отправленная тема');
  });

  it('решение подписано версией раскрытой карточки, а не свежей версией строки после «Обновить»', async () => {
    serve({ list: () => res(200, [item({ version: 'LIST' })]), get: () => res(200, detailOf({ version: 'CARD' })) });
    await open();
    await openCard();
    // Фоновое «Обновить» принесло новую версию строки — открытая карточка её не видела.
    serve({
      list: () => res(200, [item({ version: 'LIST2' })]),
      get: () => res(200, detailOf({ version: 'CARD' })),
      approve: () => res(200, item({ version: 'CARD2', status: 'approved' })),
    });
    await clickAsync(q('shorts-refresh')!);
    await settle();
    await clickAsync(q('short-approve')!);
    await settle();
    expect(sent()).toContainEqual({ action: 'approve', id: 's1', version: 'CARD' });
  });

  it('решение по ролику не закрывает карточку другого ролика, раскрытую пока решение летело', async () => {
    const s2 = item({ id: 's2', topicKey: 'catalog:2030-W01:2', topicHint: 'Второй ролик', title: 'Второй ролик' });
    let releaseApprove: () => void = () => {};
    serve({
      list: () => res(200, [item(), s2]),
      get: (p: any) => res(200, p.id === 's2' ? detailOf({ id: 's2', title: 'Второй ролик' }) : detailOf()),
      approve: () => new Promise((resolve) => { releaseApprove = () => resolve(res(200, item({ status: 'approved' }))); }),
    });
    await open();
    await openCard(); // раскрыли s1
    await clickAsync(q('short-approve')!); // одобрение s1 отправлено и висит
    await clickAsync(q('short-toggle-s2')!); // раскрыли s2, не дожидаясь ответа по s1
    await settle();
    // Заголовок — в строке карточки (short-s2), не в её details-блоке.
    expect(q('short-s2')!.textContent).toContain('Второй ролик');

    await actAsync(() => releaseApprove());
    await settle();

    // Одобрение s1 прошло, но открытая СЕЙЧАС карточка — s2, закрывать её не надо.
    expect(sent()).toContainEqual(expect.objectContaining({ action: 'approve', id: 's1' }));
    expect(q('short-details-s2')).toBeTruthy();
  });

  it('замок одобрения снимается и после 409, и после 5xx — следующий клик уходит отдельным запросом', async () => {
    let approveCalls = 0;
    serve({
      list: () => res(200, [item()]),
      get: () => res(200, detailOf()),
      approve: () => {
        approveCalls += 1;
        if (approveCalls === 1) return res(409, { statusCode: 409, error: 'version_conflict', message: 'Ролик изменился' });
        if (approveCalls === 2) return res(502, '<html>');
        return res(200, item({ status: 'approved' }));
      },
    });
    await open();
    await openCard();
    await clickAsync(q('short-approve')!);
    await settle();
    expect(sent().filter((p) => p.action === 'approve')).toHaveLength(1);
    await clickAsync(q('short-approve')!);
    await settle();
    expect(sent().filter((p) => p.action === 'approve')).toHaveLength(2);
    await clickAsync(q('short-approve')!);
    await settle();
    expect(sent().filter((p) => p.action === 'approve')).toHaveLength(3);
  });

  it('сетевой сбой на решении — «Не подтверждено» с подсказкой раскрыть ролик заново; двойная точка не слипается', async () => {
    serve({ list: () => res(200, [item()]), get: () => res(200, detailOf()) });
    await open();
    await openCard();

    post.mockImplementationOnce(async (_url: string, payload: any) => {
      if (payload.action !== 'approve') {
        unexpectedActions.push(payload.action);
        throw new Error(`неожиданное действие ${payload.action}`);
      }
      throw new TypeError('Failed to fetch');
    });
    await clickAsync(q('short-approve')!);
    await settle();
    expect(q('shorts-error')!.textContent).toBe(
      'Не подтверждено: Failed to fetch. Нажмите «Обновить», затем сверните и раскройте ролик заново, прежде чем повторять.',
    );

    // Firefox формулирует сбой с точкой на конце — вторая точка не должна слипнуться.
    post.mockImplementationOnce(async (_url: string, payload: any) => {
      if (payload.action !== 'approve') {
        unexpectedActions.push(payload.action);
        throw new Error(`неожиданное действие ${payload.action}`);
      }
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    await clickAsync(q('short-approve')!);
    await settle();
    expect(q('shorts-error')!.textContent).toBe(
      'Не подтверждено: NetworkError when attempting to fetch resource. Нажмите «Обновить», затем сверните и раскройте ролик заново, прежде чем повторять.',
    );
  });

  it('4xx не версионный — красная плашка без «Не подтверждено»', async () => {
    serve({
      list: () => res(200, [item()]),
      get: () => res(200, detailOf()),
      approve: () => res(400, { statusCode: 400, error: 'Bad Request', message: 'Нужна причина отказа' }),
    });
    await open();
    await openCard();
    await clickAsync(q('short-approve')!);
    await settle();
    const banner = q('shorts-error')!;
    expect(banner.getAttribute('data-conflict')).toBe('false');
    expect(banner.textContent).toBe('Нужна причина отказа');
    expect(banner.textContent).not.toContain('Не подтверждено');
  });

  it('гонка: раскрытие другого ролика во время «Загрузить заново» получает свои, а не чужие данные', async () => {
    const s1Row = item({ version: 'ROW_S1' });
    const s2Row = item({
      id: 's2', topicKey: 'catalog:2030-W01:2', topicHint: 'Второй ролик', title: 'Второй ролик', version: 'ROW_S2',
    });
    serve({
      list: () => res(200, [s1Row, s2Row]),
      get: (p: any) => res(200, p.id === 's2'
        ? detailOf({ id: 's2', title: 'Второй ролик', version: 'CARD_S2' })
        : detailOf({ version: 'CARD_S1' })),
      approve: () => res(409, { statusCode: 409, error: 'version_conflict', message: 'Ролик изменился' }),
    });
    await open();
    await openCard(); // раскрыли s1
    await clickAsync(q('short-approve')!); // 409
    await settle();

    let releaseList: () => void = () => {};
    let releaseGetS1: () => void = () => {};
    let releaseGetS2: () => void = () => {};
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action === 'list') {
        return new Promise((resolve) => { releaseList = () => resolve(res(200, [s1Row, s2Row])); });
      }
      if (payload.action === 'get' && payload.id === 's1') {
        return new Promise((resolve) => { releaseGetS1 = () => resolve(res(200, detailOf({ version: 'CARD_S1' }))); });
      }
      if (payload.action === 'get' && payload.id === 's2') {
        return new Promise((resolve) => {
          releaseGetS2 = () => resolve(res(200, detailOf({ id: 's2', title: 'Второй ролик', version: 'CARD_S2' })));
        });
      }
      if (payload.action === 'approve' && payload.id === 's2') return res(200, item({ id: 's2', status: 'approved' }));
      unexpectedActions.push(payload.action);
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await clickAsync(q('shorts-conflict-reload')!); // list и get(s1) запущены и висят
    await clickAsync(q('short-toggle-s2')!); // раскрыли s2, пока «Загрузить заново» ещё не вернулось
    await settle();

    await actAsync(() => releaseList());
    await actAsync(() => releaseGetS1());
    await actAsync(() => releaseGetS2());
    await settle();

    // Заголовок — в строке карточки, не в её details-блоке; видео — по версии
    // s2, не s1 (единственная переменная часть внутри самого details-блока).
    expect(q('short-s2')!.textContent).toContain('Второй ролик');
    const video2 = q('short-video-s2') as HTMLVideoElement;
    expect(video2.getAttribute('src')).toContain('CARD_S2');
    expect(video2.getAttribute('src')).not.toContain('CARD_S1');

    await clickAsync(q('short-approve')!);
    await settle();
    expect(sent()).toContainEqual({ action: 'approve', id: 's2', version: 'CARD_S2' });
  });

  it('список — свой счёт у каждого запроса: ответ не по счёту отбрасывается', async () => {
    serve({ list: () => res(200, [item({ id: 'initial' })]) });
    await open(); // первый (от монтирования) список пришёл, busy снова false — кнопка не заблокирована

    let call = 0;
    let resolveFirst: () => void = () => {};
    let resolveSecond: () => void = () => {};
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action !== 'list') {
        unexpectedActions.push(payload.action);
        throw new Error(`неожиданное действие ${payload.action}`);
      }
      call += 1;
      if (call === 1) return new Promise((resolve) => { resolveFirst = () => resolve(res(200, [item({ id: 'stale' })])); });
      return new Promise((resolve) => { resolveSecond = () => resolve(res(200, [item({ id: 'fresh' })])); });
    });
    // Два клика ДО перерисовки: оба load() стартуют и берут билет раньше, чем
    // disabled={busy} успеет отрисоваться, — как настоящий быстрый дубль-клик.
    doubleClick(q('shorts-refresh')!);
    // Отвечаем начавшему ПОЗЖЕ раньше — ответ не по счёту не должен победить.
    await actAsync(() => resolveSecond());
    await actAsync(() => resolveFirst());
    await settle();
    expect(q('short-fresh')).toBeTruthy();
    expect(q('short-stale')).toBeNull();
  });

  it('кнопки раскрытой карточки ждут именно её ответ, даже если список обновился раньше', async () => {
    serve({
      list: () => res(200, [item()]),
      get: () => res(200, detailOf()),
      approve: () => res(409, { statusCode: 409, error: 'version_conflict', message: 'Ролик изменился' }),
    });
    await open();
    await openCard();
    await clickAsync(q('short-approve')!);
    await settle();

    let releaseGet: () => void = () => {};
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action === 'list') return res(200, [item()]); // список приходит сразу
      if (payload.action === 'get') return new Promise((resolve) => { releaseGet = () => resolve(res(200, detailOf())); }); // карточка висит
      unexpectedActions.push(payload.action);
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await clickAsync(q('shorts-conflict-reload')!);
    await settle();
    // Список уже пришёл (общий busy снят), но карточка s1 ещё перечитывается.
    expect((q('short-approve') as HTMLButtonElement).disabled).toBe(true);

    await actAsync(() => releaseGet());
    await settle();
    expect((q('short-approve') as HTMLButtonElement).disabled).toBe(false);
  });

  it('перечитывание списка после удачного решения — поясняет, что не обновился список, а не что решение не прошло', async () => {
    serve({ list: () => res(200, [item()]), get: () => res(200, detailOf()) });
    await open();
    await openCard();

    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action === 'approve') return res(200, item({ status: 'approved', slotAt: '2030-01-05T15:00:00.000Z' }));
      if (payload.action === 'list') return res(500, { statusCode: 500, message: 'Внутренняя ошибка' });
      unexpectedActions.push(payload.action);
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await clickAsync(q('short-approve')!);
    await settle();
    expect(q('shorts-notice')!.textContent).toMatch(/^Одобрено\. Выйдет /);
    expect(q('shorts-error')!.textContent).toBe('Список не обновился: Внутренняя ошибка');
  });

  it('ответ list не массивом — явная ошибка, а не тихая «очередь пуста»', async () => {
    serve({ list: () => res(200, { unexpected: true }) });
    await open();
    expect(q('shorts-error')!.textContent).toBe('сервер прислал не список роликов');
    expect(m.container.textContent).not.toContain('Очередь роликов пуста');
  });

  it('архив подсказывает «Показаны последние 100.» на 100 строках, не раньше; счётчик экрана — «100+» при 100 и больше', async () => {
    const published = (n: number) => Array.from({ length: n }, (_, i) => item({
      id: `p${i}`, topicKey: `catalog:2030-W01:${i}`, status: 'published',
      publishedAt: '2030-01-02T15:00:00.000Z', publications: [],
    }));
    serve({ list: () => res(200, published(99)) });
    await open();
    await clickAsync(q('shorts-screen-published')!);
    expect(m.container.textContent).not.toContain('Показаны последние 100.');
    expect(q('shorts-screen-published')!.textContent).toBe('Вышли 99');
    m.unmount();

    serve({ list: () => res(200, published(100)) });
    await open();
    await clickAsync(q('shorts-screen-published')!);
    expect(m.container.textContent).toContain('Показаны последние 100.');
    expect(q('shorts-screen-published')!.textContent).toBe('Вышли 100+');
  });

  it('кнопка настроек роликов имеет aria-label и title', async () => {
    serve({ list: () => res(200, []) });
    await open();
    const btn = q('shorts-settings-toggle')!;
    expect(btn.getAttribute('aria-label')).toBe('Настройки роликов');
    expect(btn.getAttribute('title')).toBe('Настройки роликов');
  });

  it('замечание, набранное в карточке, не стирается перечитыванием после 409', async () => {
    serve({
      list: () => res(200, [item()]),
      get: () => res(200, detailOf()),
      approve: () => res(409, { statusCode: 409, error: 'version_conflict', message: 'Ролик изменился' }),
    });
    await open();
    await openCard();
    type(q('short-note')!, 'Поправь интонацию');
    await clickAsync(q('short-approve')!);
    await settle();
    await clickAsync(q('shorts-conflict-reload')!);
    await settle();
    expect((q('short-note') as HTMLTextAreaElement).value).toBe('Поправь интонацию');
  });

  it('под StrictMode: список грузится, и настройки грузятся при открытии панели', async () => {
    // src/main.tsx рендерит приложение внутри <React.StrictMode> — настройки
    // монтируются только по клику (showSettings стартует false), так что их
    // собственный эффект впервые проходит двойной прогон (эффект → снятие →
    // эффект) именно в этот момент, а не при монтировании экрана.
    serve({
      list: () => res(200, [item()]),
      get_settings: () => res(200, {
        slotDays: [1, 2, 3, 4, 5, 6, 7], slotHourMsk: 18, prepareLeadHours: 24, minAnswerChars: 400,
        tgChannelChatId: '-1003046204962', platforms: ['telegram', 'youtube'], narratorVoice: 'alena', format: 'skit',
        maxOmniSeconds: 48, youtubeMode: 'unlisted',
      }),
    });
    m = mount(<StrictMode><AdminShortsView /></StrictMode>);
    await settle();
    expect(q('short-s1')).toBeTruthy();

    await clickAsync(q('shorts-settings-toggle')!);
    await settle();
    expect(q('shorts-settings-error')).toBeNull();
    expect(m.container.textContent).not.toContain('Загружаю настройки');
    expect(q('shorts-hour')).toBeTruthy();
  });
});
