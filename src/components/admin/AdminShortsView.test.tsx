// @vitest-environment jsdom
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
const detailOf = (over: Record<string, unknown> = {}) => ({
  ...item(over), capture: { answerText: 'ответ' }, script: { hook: 'Зацепка', lines: [] },
  captions: { telegram: 'Подпись в канал', youtube: { title: 'Заголовок YouTube' } }, animation: { omniSeconds: 16 },
  videoUrl: `https://my.linkeon.io/smm-media/linkeon-smm-videos/shorts/s1/video.mp4?v=${encodeURIComponent(VERSION)}`,
  coverUrl: null,
});

let m: Mounted;
const q = (id: string) => m.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const sent = () => post.mock.calls.map((c) => c[1]);
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await flush();
};
/** Сервер по таблице действий; незнакомое действие — ошибка теста. */
function serve(table: Record<string, (payload: any) => unknown>) {
  post.mockImplementation(async (_url: string, payload: any) => {
    const h = table[payload.action];
    if (!h) throw new Error(`неожиданное действие ${payload.action}`);
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
});
afterEach(() => m?.unmount());

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

  it('409 — жёлтая плашка с причиной, сам список не перечитывается; «Загрузить заново» — список и карточка', async () => {
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
    await clickAsync(q('shorts-conflict-reload')!);
    await settle();
    expect(sent().filter((p) => p.action === 'list')).toHaveLength(2);
    expect(sent().filter((p) => p.action === 'get')).toHaveLength(2);
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
    confirm.mockRestore();
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
    confirm.mockRestore();
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
    expect(q('shorts-error')!.textContent).toBe('Не подтверждено: сервер ответил 502. Нажмите «Обновить», прежде чем повторять.');
    expect(q('shorts-notice')).toBeNull();
  });
});
