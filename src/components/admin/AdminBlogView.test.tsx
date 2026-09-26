// @vitest-environment jsdom
/**
 * Вкладка блога проверяется живым монтированием, а не чтением кода: три
 * свойства, ради которых она и переписана против образца из плана, глазами не
 * доказываются — поведение на 409, сорвавшийся пост в очереди и дни слотов,
 * которые физически нельзя отправить кривыми.
 *
 * Без @testing-library: её в репозитории нет, а тянуть зависимость ради трёх
 * тестов дороже, чем два десятка строк на createRoot и act.
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { post } }));

import AdminBlogView from './AdminBlogView';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const res = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const basePost = {
  id: 'p1',
  rubric: 'case' as const,
  source: 'manual',
  topicKey: 'tema',
  topicHint: 'Тема',
  title: 'Заголовок',
  body: 'Текст',
  imageUrl: null,
  status: 'pending_review',
  slotAt: null,
  tgUrl: null,
  attempts: 0,
  lastError: null,
  updatedAt: '2026-09-21T10:00:00.000Z',
};

let container: HTMLDivElement;
let root: Root;

const mount = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AdminBlogView />);
  });
};

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (testid: string) => {
  const el = q(testid);
  if (!el) throw new Error(`нет элемента ${testid}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const type = async (testid: string, value: string) => {
  const el = q(testid) as HTMLInputElement | HTMLTextAreaElement;
  if (!el) throw new Error(`нет поля ${testid}`);
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

/** Аргументы всех вызовов эндпоинта в порядке отправки. */
const sentActions = () => post.mock.calls.map((c) => c[1]);

beforeEach(() => {
  post.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('конкурентная правка (409)', () => {
  const setup = () => {
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action === 'list') return res(200, [basePost]);
      if (payload.action === 'approve') {
        return res(409, {
          statusCode: 409,
          message: 'нельзя pending_review → approved: пост уже в статусе approved',
        });
      }
      throw new Error(`неожиданное действие ${payload.action}`);
    });
  };

  it('показывает человеческую причину с сервера, а не «Ошибка 409»', async () => {
    setup();
    await mount();
    await click('blog-approve-p1');

    const banner = q('blog-error');
    expect(banner).toBeTruthy();
    expect(banner!.textContent).toContain('Пост изменили в другом месте');
    expect(banner!.textContent).toContain('пост уже в статусе approved');
    expect(banner!.textContent).toContain('Ничего не перезаписано');
    expect(banner!.textContent).not.toContain('409');
  });

  /**
   * Ключевой инвариант: после 409 данные НЕ перечитываются сами. Иначе
   * свежий `updatedAt` снял бы защиту бэка, и второй клик молча затёр бы
   * чужую правку — ровно то, от чего 409 и ставится.
   */
  it('не перечитывает данные молча — иначе второй клик затрёт чужую правку', async () => {
    setup();
    await mount();
    await click('blog-approve-p1');

    expect(sentActions().map((a) => a.action)).toEqual(['list', 'approve']);
  });

  it('перечитывает только по явной кнопке', async () => {
    setup();
    await mount();
    await click('blog-approve-p1');
    await click('blog-conflict-reload');

    expect(sentActions().map((a) => a.action)).toEqual(['list', 'approve', 'list']);
    expect(q('blog-error')).toBeNull();
  });

  it('правка текста уезжает с версией поста — без неё бэку нечего сверять', async () => {
    post.mockImplementation(async (_url: string, payload: any) =>
      payload.action === 'list' ? res(200, [basePost]) : res(200, basePost),
    );
    await mount();
    await type('blog-body-p1', 'Новый текст');
    await click('blog-save-text-p1');

    const save = sentActions().find((a) => a.action === 'update_text');
    expect(save).toMatchObject({ id: 'p1', body: 'Новый текст', updatedAt: basePost.updatedAt });
  });
});

/**
 * Несохранённая правка помнит версию поста, от которой начата. После любого
 * успешного действия очередь перечитывается, и пост с правкой получает свежий
 * `updatedAt` с сервера. Если сохранение уйдёт с ним, бэк сверит правку не с
 * той версией, от которой она сделана, и молча затрёт изменение, сделанное за
 * это время в личке бота или в соседней вкладке.
 */
describe('правка помнит версию, от которой начата', () => {
  type Payload = { action: string; id?: string; title?: string; body?: string; updatedAt?: string };
  type Row = typeof basePost;

  const A = { ...basePost, id: 'a1', title: 'Пост A', body: 'Текст A', updatedAt: '2026-09-21T10:00:00.000Z' };
  const B = { ...basePost, id: 'b1', title: 'Пост B', body: 'Текст B', updatedAt: '2026-09-21T10:05:00.000Z' };

  /**
   * Сервер, как настоящий: `update_text` сверяет присланную версию (если она
   * есть) и на расхождение отвечает 409 тем же телом, что Nest из
   * `assertVersion`; выброшенное `list` не отдаёт; любая запись сдвигает версию.
   */
  const server = (initial: Row[]) => {
    const db = new Map<string, Row>(initial.map((p) => [p.id, { ...p }]));
    let tick = 0;
    const bump = (p: Row) => {
      p.updatedAt = new Date(Date.parse('2026-09-21T12:00:00.000Z') + ++tick * 1000).toISOString();
    };
    const handler = async (_url: string, payload: Payload) => {
      const p = payload.id ? db.get(payload.id) : undefined;
      switch (payload.action) {
        case 'list':
          return res(200, [...db.values()].filter((x) => x.status !== 'rejected').map((x) => ({ ...x })));
        case 'reject':
          if (!p) return res(404, { message: 'пост не найден' });
          p.status = 'rejected';
          bump(p);
          return res(200, { ...p });
        case 'update_text':
          if (!p) return res(404, { message: 'пост не найден' });
          if (payload.updatedAt && Date.parse(payload.updatedAt) !== Date.parse(p.updatedAt)) {
            return res(409, {
              statusCode: 409,
              message: 'пост изменился в другом месте — обнови страницу',
              error: 'Conflict',
            });
          }
          p.title = payload.title ?? '';
          p.body = payload.body ?? '';
          bump(p);
          return res(200, { ...p });
        default:
          throw new Error(`неожиданное действие ${payload.action}`);
      }
    };
    /** Правка мимо этой вкладки: замечание или «Переписать» в личке бота, соседняя вкладка. */
    const editElsewhere = (id: string, body: string) => {
      const p = db.get(id)!;
      p.body = body;
      bump(p);
    };
    return { handler, editElsewhere, row: (id: string) => ({ ...db.get(id)! }) };
  };

  const body = (id: string) => (q(`blog-body-${id}`) as HTMLTextAreaElement).value;

  /** Сценарий из разбора: правка A → A меняют в другом месте → действие над B перечитывает очередь. */
  const editThenActOnOther = async (srv: ReturnType<typeof server>) => {
    await mount();
    await type('blog-body-a1', 'Моя правка A');
    srv.editElsewhere('a1', 'Текст A после замечания в Telegram');
    await click('blog-reject-b1');
  };

  it('сохранение уходит с версией, от которой начата правка, а не с версией последней загрузки', async () => {
    const srv = server([A, B]);
    post.mockImplementation(srv.handler);
    await editThenActOnOther(srv);
    // Очередь действительно перечитана — у A в ней уже новая версия.
    expect(sentActions().map((a) => a.action)).toEqual(['list', 'reject', 'list']);

    await click('blog-save-text-a1');

    const save = sentActions().find((a) => a.action === 'update_text');
    expect(save).toMatchObject({ id: 'a1', body: 'Моя правка A', updatedAt: A.updatedAt });
  });

  it('поэтому чужое изменение не затирается молча: конфликт, чужой текст цел, своя правка на экране', async () => {
    const srv = server([A, B]);
    post.mockImplementation(srv.handler);
    await editThenActOnOther(srv);
    await click('blog-save-text-a1');

    expect(q('blog-error')!.textContent).toContain('Пост изменили в другом месте');
    expect(srv.row('a1').body).toBe('Текст A после замечания в Telegram');
    expect(body('a1')).toBe('Моя правка A');
  });

  it('версия фиксируется при первом изменении: правка, продолженная после перезагрузки, помнит исходную', async () => {
    const srv = server([A, B]);
    post.mockImplementation(srv.handler);
    await editThenActOnOther(srv);
    await type('blog-body-a1', 'Моя правка A, дописанная после перезагрузки');
    await click('blog-save-text-a1');

    const save = sentActions().find((a) => a.action === 'update_text');
    expect(save!.updatedAt).toBe(A.updatedAt);
    expect(srv.row('a1').body).toBe('Текст A после замечания в Telegram');
  });

  it('о том, что пост изменился, видно заранее — до нажатия «Сохранить текст»', async () => {
    const srv = server([A, B]);
    post.mockImplementation(srv.handler);
    await editThenActOnOther(srv);

    expect(q('blog-draft-stale-a1')!.textContent).toMatch(/пост изменился с начала вашей правки/i);
    expect(sentActions().some((a) => a.action === 'update_text')).toBe(false);
  });

  it('пометки нет, пока пост не менялся, и нет у поста без правки', async () => {
    const C = { ...basePost, id: 'c1', title: 'Пост C', body: 'Текст C', updatedAt: '2026-09-21T10:10:00.000Z' };
    const srv = server([A, B, C]);
    post.mockImplementation(srv.handler);
    await mount();
    await type('blog-body-a1', 'Моя правка A');
    srv.editElsewhere('c1', 'Текст C, поправленный в другом месте'); // C поменяли, но правки у нас нет
    await click('blog-reject-b1');

    expect(q('blog-draft-stale-a1')).toBeNull();
    expect(q('blog-draft-stale-c1')).toBeNull();
    expect(body('c1')).toBe('Текст C, поправленный в другом месте');
  });

  it('после успешного сохранения правка закрыта: следующая начинается с новой версии', async () => {
    const srv = server([A, B]);
    post.mockImplementation(srv.handler);
    await mount();
    await type('blog-body-a1', 'Первая правка');
    await click('blog-save-text-a1');
    const afterFirst = srv.row('a1').updatedAt;

    await type('blog-body-a1', 'Вторая правка');
    await click('blog-save-text-a1');

    const saves = sentActions().filter((a) => a.action === 'update_text');
    expect(saves.map((s) => s.updatedAt)).toEqual([A.updatedAt, afterFirst]);
    expect(q('blog-error')).toBeNull();
    expect(srv.row('a1').body).toBe('Вторая правка');
  });
});

describe('сорвавшийся пост', () => {
  const failed = {
    ...basePost,
    id: 'f1',
    status: 'failed',
    attempts: 3,
    lastError: 'Telegram: 400 Bad Request: chat not found',
  };

  beforeEach(() => {
    post.mockImplementation(async (_url: string, payload: any) =>
      payload.action === 'list' ? res(200, [failed, basePost]) : res(200, failed),
    );
  });

  it('отличается от обычного визуально', async () => {
    await mount();
    const broken = q('blog-post-f1')!;
    const normal = q('blog-post-p1')!;

    expect(broken.getAttribute('data-status')).toBe('failed');
    expect(broken.className).toContain('border-red-300');
    expect(normal.className).not.toContain('border-red-300');
    expect(broken.textContent).toContain('Сорвался');
    expect(broken.textContent).toContain('попыток: 3');
  });

  it('показывает причину из lastError', async () => {
    await mount();
    expect(q('blog-error-f1')!.textContent).toContain('chat not found');
  });

  /**
   * Бэковый `list` отдаёт сорвавшийся пост в очередь, а `isArchive('failed')`
   * — true. Гасить кнопки по `isQueue`, как в образце плана, значит оставить
   * такой пост вообще без действий: ни переписать, ни выбросить.
   */
  it('можно переписать и выбросить, но не одобрить в обход переписывания', async () => {
    await mount();
    expect(q('blog-redraft-f1')).toBeTruthy();
    expect(q('blog-reject-f1')).toBeTruthy();
    expect(q('blog-approve-f1')).toBeNull();
  });
});

describe('дни слотов', () => {
  const settings = {
    channelChatId: '@linkeon',
    slotDays: [1, 3, 5],
    slotHourMsk: 10,
    imageStyle: 'минимализм',
  };

  const openSettings = async () => {
    post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.action === 'get_settings') return res(200, settings);
      if (payload.action === 'update_settings') return res(200, settings);
      return res(200, []);
    });
    await mount();
    await click('blog-screen-settings');
  };

  /**
   * Бэк `slotDays` не валидирует вовсе — кладёт массив в JSONB как есть.
   * Текстовое поле «через запятую» из плана пропускало бы `99`, и вылезло бы
   * это только на апруве поста: `nextSlotAfter` не нашёл бы слот за две
   * недели вперёд.
   */
  it('форма не даёт ввести число вне недели: только семь кнопок', async () => {
    await openSettings();
    const days = [...container.querySelectorAll('[data-testid^="blog-day-"]')];
    expect(days.map((d) => d.getAttribute('data-testid'))).toEqual([
      'blog-day-1', 'blog-day-2', 'blog-day-3',
      'blog-day-4', 'blog-day-5', 'blog-day-6', 'blog-day-7',
    ]);
    expect(days.every((d) => d.tagName === 'BUTTON')).toBe(true);
  });

  it('отправляет только выбранные дни в диапазоне 1…7', async () => {
    await openSettings();
    await click('blog-day-7');
    await click('blog-save-settings');

    const saved = sentActions().find((a) => a.action === 'update_settings');
    expect(saved!.slotDays).toEqual([1, 3, 5, 7]);
    expect(saved!.slotHourMsk).toBe(10);
  });

  it('пустой список дней отправить нельзя: апрув на нём падает', async () => {
    await openSettings();
    for (const d of [1, 3, 5]) await click(`blog-day-${d}`);

    expect((q('blog-save-settings') as HTMLButtonElement).disabled).toBe(true);
    await click('blog-save-settings');
    expect(sentActions().some((a) => a.action === 'update_settings')).toBe(false);
  });

  it('час вне суток отправить нельзя', async () => {
    await openSettings();
    await type('blog-hour', '99');
    expect((q('blog-save-settings') as HTMLButtonElement).disabled).toBe(true);

    await type('blog-hour', '');
    expect((q('blog-save-settings') as HTMLButtonElement).disabled).toBe(true);

    await type('blog-hour', '7');
    expect((q('blog-save-settings') as HTMLButtonElement).disabled).toBe(false);
  });
});

/**
 * Перенос слота одобренного поста. Время заморожено на пятнице 25.09, 12:00
 * МСК: ближайшие слоты пн/ср/пт в 10:00 МСК — 28.09, 30.09, 02.10 и т.д.
 */
describe('перенос слота', () => {
  const NOW = '2026-09-25T09:00:00.000Z'; // пт 25.09, 12:00 МСК
  const MON = '2026-09-28T07:00:00.000Z'; // пн 28.09, 10:00 МСК
  const WED = '2026-09-30T07:00:00.000Z'; // ср 30.09, 10:00 МСК
  const FRI = '2026-10-02T07:00:00.000Z'; // пт 02.10, 10:00 МСК
  const SCHEDULE = [MON, WED, FRI, '2026-10-05T07:00:00.000Z', '2026-10-07T07:00:00.000Z', '2026-10-09T07:00:00.000Z'];

  const caseOnMon = {
    ...basePost,
    id: 'c1',
    title: 'Кейс: школа танцев',
    status: 'approved',
    slotAt: MON,
    updatedAt: '2026-09-24T10:00:00.000Z',
  };
  const newsOnFri = {
    ...basePost,
    id: 'n1',
    rubric: 'news' as const,
    title: 'Срочно: новый ассистент',
    status: 'approved',
    slotAt: FRI,
    updatedAt: '2026-09-24T11:00:00.000Z',
  };

  type Payload = {
    action: string;
    count?: number;
    id?: string;
    slotAt?: string;
    title?: string;
    body?: string;
    updatedAt?: string;
  };
  type FakePost = {
    id: string;
    status: string;
    slotAt: string | null;
    title: string | null;
    body: string | null;
    updatedAt: string;
  };

  /**
   * Бэк блога в миниатюре — строго по контракту: слот занят одобренным
   * постом с таким `slotAt`, версия поста — `updatedAt`, перенос её
   * сдвигает. Чужой слот → 409 slot_taken, устаревшая версия → 409
   * version_conflict (версию, как и настоящий бэк, сверяет только если её
   * прислали). Правка текста сверяет версию так же, как `assertVersion`.
   */
  const fakeBlog = (initial: FakePost[]) => {
    const db = new Map<string, FakePost>(initial.map((p) => [p.id, { ...p }]));
    let version = 0;
    const bump = (id: string) => {
      const p = db.get(id);
      if (!p) throw new Error(`нет поста ${id}`);
      p.updatedAt = new Date(Date.parse(NOW) + ++version * 1000).toISOString();
    };
    const holder = (slotAt: string) =>
      [...db.values()].find((p) => p.status === 'approved' && p.slotAt === slotAt) ?? null;

    const handler = async (_url: string, payload: Payload) => {
      switch (payload.action) {
        case 'list':
          return res(200, [...db.values()]
            .sort((a, b) => String(a.slotAt).localeCompare(String(b.slotAt)))
            .map((p) => ({ ...p })));
        case 'free_slots':
          return res(200, SCHEDULE.slice(0, payload.count ?? 6).map((slotAt) => {
            const p = holder(slotAt);
            return { slotAt, takenBy: p ? { id: p.id, title: p.title } : null };
          }));
        case 'reschedule': {
          const p = payload.id ? db.get(payload.id) : undefined;
          if (!p || !payload.slotAt) {
            return res(400, { error: 'bad_request', message: 'нужны id и slotAt' });
          }
          if (payload.updatedAt && Date.parse(payload.updatedAt) !== Date.parse(p.updatedAt)) {
            return res(409, { error: 'version_conflict', message: 'пост изменился в другом месте' });
          }
          const other = holder(payload.slotAt);
          if (other && other.id !== p.id) {
            return res(409, { error: 'slot_taken', message: `слот занят постом ${other.id}` });
          }
          p.slotAt = payload.slotAt;
          bump(p.id);
          return res(200, { ...p });
        }
        case 'update_text': {
          const p = payload.id ? db.get(payload.id) : undefined;
          if (!p) return res(404, { message: 'пост не найден' });
          if (payload.updatedAt && Date.parse(payload.updatedAt) !== Date.parse(p.updatedAt)) {
            return res(409, {
              statusCode: 409,
              message: 'пост изменился в другом месте — обнови страницу',
              error: 'Conflict',
            });
          }
          p.title = payload.title ?? '';
          p.body = payload.body ?? '';
          bump(p.id);
          return res(200, { ...p });
        }
        default:
          throw new Error(`неожиданное действие ${payload.action}`);
      }
    };
    return { handler, bump, get: (id: string) => ({ ...db.get(id)! }) };
  };

  const slot = (postId: string, slotAt: string) => {
    const el = q(`blog-slot-${postId}-${slotAt}`) as HTMLButtonElement | null;
    if (!el) throw new Error(`нет слота ${slotAt} у поста ${postId}`);
    return el;
  };
  const pick = (postId: string, slotAt: string) => click(`blog-slot-${postId}-${slotAt}`);
  const when = (postId: string) => q(`blog-when-${postId}`)?.textContent;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('одобренный пост говорит, когда выйдет, — по Москве и словами, как в Telegram', async () => {
    post.mockImplementation(fakeBlog([caseOnMon]).handler);
    await mount();

    expect(when('c1')).toBe('Выйдет в понедельник, 28 сентября, в 10:00 МСК');
    expect(q('blog-post-c1')!.textContent).not.toContain('2026-09-28');
  });

  it('«завтра» считается от текущего момента', async () => {
    vi.setSystemTime(new Date('2026-09-27T09:00:00.000Z')); // вс 27.09, 12:00 МСК
    post.mockImplementation(fakeBlog([caseOnMon]).handler);
    await mount();

    expect(when('c1')).toBe('Выйдет завтра в 10:00 МСК');
  });

  it('«Перенести» есть только у одобренного поста', async () => {
    post.mockImplementation(fakeBlog([basePost, caseOnMon]).handler);
    await mount();

    expect(q('blog-reschedule-c1')).toBeTruthy();
    expect(q('blog-reschedule-p1')).toBeNull();
  });

  it('список слотов: свободный выбираем, занятый виден с названием поста, но недоступен, текущий отмечен', async () => {
    post.mockImplementation(fakeBlog([caseOnMon, newsOnFri]).handler);
    await mount();
    await click('blog-reschedule-c1');

    expect(sentActions().slice(-1)[0]).toMatchObject({ action: 'free_slots' });

    const current = slot('c1', MON);
    expect(current.dataset.state).toBe('current');
    expect(current.textContent).toContain('сейчас здесь');
    expect(current.disabled).toBe(true);

    const free = slot('c1', WED);
    expect(free.dataset.state).toBe('free');
    expect(free.disabled).toBe(false);
    expect(free.textContent).toMatch(/в среду, 30 сентября, в 10:00 МСК/i);

    const taken = slot('c1', FRI);
    expect(taken.dataset.state).toBe('taken');
    expect(taken.disabled).toBe(true);
    expect(taken.textContent).toContain('«Срочно: новый ассистент»');

    await pick('c1', FRI);
    expect(sentActions().some((a) => a.action === 'reschedule')).toBe(false);
  });

  it('выбор слота уходит с версией поста, после успеха очередь перечитана', async () => {
    post.mockImplementation(fakeBlog([caseOnMon, newsOnFri]).handler);
    await mount();
    await click('blog-reschedule-c1');
    await pick('c1', WED);

    expect(sentActions().find((a) => a.action === 'reschedule')).toEqual({
      action: 'reschedule',
      id: 'c1',
      slotAt: WED,
      updatedAt: caseOnMon.updatedAt,
    });
    expect(sentActions().map((a) => a.action)).toEqual(['list', 'free_slots', 'reschedule', 'list']);
    expect(q('blog-slots-c1')).toBeNull();
    expect(when('c1')).toBe('Выйдет в среду, 30 сентября, в 10:00 МСК');
    expect(q('blog-error')).toBeNull();
  });

  it('несохранённая правка текста переживает перенос', async () => {
    post.mockImplementation(fakeBlog([caseOnMon]).handler);
    await mount();
    await type('blog-body-c1', 'Правка, которую ещё не сохранили');
    await click('blog-reschedule-c1');
    await pick('c1', WED);

    expect(when('c1')).toBe('Выйдет в среду, 30 сентября, в 10:00 МСК');
    expect((q('blog-body-c1') as HTMLTextAreaElement).value).toBe('Правка, которую ещё не сохранили');
  });

  /**
   * Перенос сам сдвигает версию поста. Правка, начатая до него, от этого не
   * должна стать «чужой»: сервер подтвердил, что с начала правки пост никто
   * не трогал, а слот к тексту отношения не имеет.
   */
  it('собственный перенос не делает правку устаревшей: текст сохраняется без конфликта', async () => {
    const blog = fakeBlog([caseOnMon]);
    post.mockImplementation(blog.handler);
    await mount();
    await type('blog-body-c1', 'Правка до переноса');
    await click('blog-reschedule-c1');
    await pick('c1', WED);

    expect(q('blog-draft-stale-c1')).toBeNull();
    await click('blog-save-text-c1');

    expect(q('blog-error')).toBeNull();
    expect(blog.get('c1').body).toBe('Правка до переноса');
    expect(blog.get('c1').slotAt).toBe(WED);
  });

  it('уже устаревшую правку перенос не «отмывает»', async () => {
    const blog = fakeBlog([caseOnMon, newsOnFri]);
    post.mockImplementation(blog.handler);
    await mount();
    await type('blog-body-c1', 'Моя правка');
    blog.bump('c1'); // кейс тем временем поправили в другом месте
    await click('blog-reschedule-n1');
    await pick('n1', WED); // очередь перечитана — у кейса в ней уже новая версия
    expect(q('blog-draft-stale-c1')).toBeTruthy();

    // Перенос самого кейса проходит: он уходит с последней загруженной версией.
    await click('blog-reschedule-c1');
    await pick('c1', FRI);
    expect(when('c1')).toBe('Выйдет в пятницу, 2 октября, в 10:00 МСК');
    expect(q('blog-draft-stale-c1')).toBeTruthy();

    await click('blog-save-text-c1');
    const saves = sentActions().filter((a) => a.action === 'update_text');
    expect(saves.map((s) => s.updatedAt)).toEqual([caseOnMon.updatedAt]);
    expect(q('blog-error')!.textContent).toContain('Пост изменили в другом месте');
    expect(blog.get('c1').body).toBe(caseOnMon.body);
  });

  it('slot_taken: называет пост, занявший слот, и перезапрашивает список', async () => {
    let asked = 0;
    post.mockImplementation(async (_url: string, payload: Payload) => {
      if (payload.action === 'list') return res(200, [caseOnMon]);
      if (payload.action === 'free_slots') {
        asked += 1;
        return res(200, [
          { slotAt: MON, takenBy: { id: 'c1', title: caseOnMon.title } },
          // В первом ответе среда свободна; пока владелец выбирал, её заняли.
          { slotAt: WED, takenBy: asked === 1 ? null : { id: 'x9', title: 'Анонс вебинара' } },
          { slotAt: FRI, takenBy: null },
        ]);
      }
      if (payload.action === 'reschedule') {
        return res(409, { error: 'slot_taken', message: 'слот уже занят' });
      }
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await mount();
    await click('blog-reschedule-c1');
    await pick('c1', WED);

    expect(q('blog-slot-note-c1')!.textContent).toBe(
      'Этот слот уже занял пост «Анонс вебинара» — выберите другой',
    );
    expect(sentActions().map((a) => a.action)).toEqual(['list', 'free_slots', 'reschedule', 'free_slots']);
    expect(slot('c1', WED).disabled).toBe(true);
    expect(slot('c1', FRI).disabled).toBe(false);
    expect(container.textContent).not.toContain('Пост изменили в другом месте');
  });

  it('version_conflict: как у правки текста — баннер и «Загрузить заново», без перечитывания', async () => {
    const blog = fakeBlog([caseOnMon, newsOnFri]);
    post.mockImplementation(blog.handler);
    await mount();
    blog.bump('c1'); // пост тем временем поправили во второй вкладке или в личке бота

    await click('blog-reschedule-c1');
    await pick('c1', WED);

    const banner = q('blog-error')!;
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Пост изменили в другом месте');
    expect(banner.textContent).toContain('Ничего не перезаписано');
    expect(q('blog-conflict-reload')).toBeTruthy();
    expect(container.textContent).not.toContain('Этот слот уже занял');
    // Сами не перечитаны ни очередь, ни слоты: свежий updatedAt снял бы защиту.
    expect(sentActions().map((a) => a.action)).toEqual(['list', 'free_slots', 'reschedule']);

    // Решает человек: перечитал — и перенос проходит уже с новой версией.
    await click('blog-conflict-reload');
    await click('blog-reschedule-c1');
    await pick('c1', WED);

    expect(q('blog-error')).toBeNull();
    expect(when('c1')).toBe('Выйдет в среду, 30 сентября, в 10:00 МСК');
  });

  it('не загрузились слоты — причина видна в списке, а не вечная крутилка', async () => {
    post.mockImplementation(async (_url: string, payload: Payload) => {
      if (payload.action === 'list') return res(200, [caseOnMon]);
      if (payload.action === 'free_slots') return res(400, { error: 'неизвестное действие: free_slots' });
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await mount();
    await click('blog-reschedule-c1');

    expect(q('blog-slots-c1')!.textContent).toContain('неизвестное действие: free_slots');
  });

  /**
   * Путь из задачи: срочное на ближайший понедельник, кейс на среду. Кейс
   * сначала уходит на свободную среду, потом срочное встаёт на освободившийся
   * понедельник. Тупик здесь был бы, если бы список слотов не перечитывался
   * при открытии: понедельник остался бы «занят кейсом».
   */
  it('срочное — на понедельник, кейс — на среду: два переноса без тупиков', async () => {
    post.mockImplementation(fakeBlog([caseOnMon, newsOnFri]).handler);
    await mount();

    await click('blog-reschedule-c1');
    await pick('c1', WED);
    expect(when('c1')).toBe('Выйдет в среду, 30 сентября, в 10:00 МСК');

    await click('blog-reschedule-n1');
    expect(slot('n1', MON).dataset.state).toBe('free');
    expect(slot('n1', WED).dataset.state).toBe('taken');
    expect(slot('n1', WED).textContent).toContain('«Кейс: школа танцев»');
    expect(slot('n1', FRI).dataset.state).toBe('current');
    await pick('n1', MON);

    expect(when('n1')).toBe('Выйдет в понедельник, 28 сентября, в 10:00 МСК');
    expect(when('c1')).toBe('Выйдет в среду, 30 сентября, в 10:00 МСК');
    expect(q('blog-error')).toBeNull();
    expect(sentActions().map((a) => a.action)).toEqual([
      'list', 'free_slots', 'reschedule', 'list', 'free_slots', 'reschedule', 'list',
    ]);
  });

  /**
   * Если оба нужных слота заняты друг другом, нужен третий шаг через
   * свободный, и кейс переносится второй раз. Второй перенос обязан уйти с
   * версией, выданной после первого, иначе на ровном месте будет 409.
   */
  it('обмен двух занятых слотов через свободный: повторный перенос идёт со свежей версией', async () => {
    const newsOnWed = { ...newsOnFri, slotAt: WED };
    post.mockImplementation(fakeBlog([caseOnMon, newsOnWed]).handler);
    await mount();

    await click('blog-reschedule-c1');
    await pick('c1', FRI);
    await click('blog-reschedule-n1');
    await pick('n1', MON);
    await click('blog-reschedule-c1');
    await pick('c1', WED);

    expect(q('blog-error')).toBeNull();
    expect(when('n1')).toBe('Выйдет в понедельник, 28 сентября, в 10:00 МСК');
    expect(when('c1')).toBe('Выйдет в среду, 30 сентября, в 10:00 МСК');
  });
});

/**
 * «Опубликовать сейчас» — выпуск поста в канал мимо слота. Канал публичный,
 * прочитанное не отменить, поэтому проверяется прежде всего то, что защищает
 * от ошибки: подтверждение, одна публикация на одно нажатие, запрет выпускать
 * старый текст при несохранённой правке и честный итог — «вышел» и «Telegram
 * не принял» не путаются.
 *
 * Время заморожено, как в переносе слота: пятница 25.09, 12:00 МСК.
 */
describe('«Опубликовать сейчас»', () => {
  const NOW = '2026-09-25T09:00:00.000Z'; // пт 25.09, 12:00 МСК
  const MON = '2026-09-28T07:00:00.000Z'; // пн 28.09, 10:00 МСК
  const WED = '2026-09-30T07:00:00.000Z'; // ср 30.09, 10:00 МСК
  const FRI = '2026-10-02T07:00:00.000Z'; // пт 02.10, 10:00 МСК

  type Row = {
    id: string;
    rubric: 'news' | 'case';
    source: string;
    topicKey: string;
    topicHint: string | null;
    title: string | null;
    body: string | null;
    imageUrl: string | null;
    status: string;
    slotAt: string | null;
    tgUrl: string | null;
    attempts: number;
    lastError: string | null;
    updatedAt: string;
  };
  const row = (over: Partial<Row> & { id: string }): Row => ({ ...basePost, ...over });

  const kira = row({
    id: 'k1',
    title: 'Кира: запись без звонков',
    body: 'Текст про Киру',
    status: 'approved',
    slotAt: MON,
    updatedAt: '2026-09-24T10:00:00.000Z',
  });
  const products = row({
    id: 'pr1',
    title: 'Продукты',
    body: 'Текст про продукты',
    status: 'approved',
    slotAt: WED,
    updatedAt: '2026-09-24T11:00:00.000Z',
  });
  // Без заголовка: в списке сдвигов его назовёт тема из очереди.
  const dance = row({
    id: 'd1',
    title: null,
    topicHint: 'Кейс школы танцев',
    body: 'Текст кейса',
    status: 'approved',
    slotAt: FRI,
    updatedAt: '2026-09-24T12:00:00.000Z',
  });
  const review = row({
    id: 'r1',
    title: 'Новинка на проверке',
    body: 'Текст новинки',
    status: 'pending_review',
    updatedAt: '2026-09-24T13:00:00.000Z',
  });

  type Payload = { action: string; id?: string; title?: string; body?: string; updatedAt?: string };
  type Shift = { id: string; title: string | null; from: string; to: string };

  /**
   * Бэк блога в миниатюре — по контракту `publish_now`: версия сверяется,
   * если прислана (409 version_conflict); очередь без дыр — каждый следующий
   * одобренный пост встаёт на слот предыдущего; Telegram либо принимает пост
   * (published + tgUrl), либо нет — тогда пост остаётся approved с lastError
   * и выйдет ближайшим тиком. `update_text` сверяет версию, как `assertVersion`.
   */
  const channel = (initial: Row[], telegram: { refuse?: string } = {}) => {
    const db = new Map<string, Row>(initial.map((p) => [p.id, { ...p }]));
    let version = 0;
    let messageId = 700;
    const bump = (p: Row) => {
      p.updatedAt = new Date(Date.parse(NOW) + ++version * 1000).toISOString();
    };
    const handler = async (_url: string, payload: Payload) => {
      const p = payload.id ? db.get(payload.id) : undefined;
      switch (payload.action) {
        case 'list':
          return res(200, [...db.values()]
            .filter((x) => x.status !== 'published' && x.status !== 'rejected')
            .sort((a, b) => String(a.slotAt).localeCompare(String(b.slotAt)))
            .map((x) => ({ ...x })));
        case 'update_text':
          if (!p) return res(404, { message: 'пост не найден' });
          if (payload.updatedAt && Date.parse(payload.updatedAt) !== Date.parse(p.updatedAt)) {
            return res(409, {
              statusCode: 409,
              error: 'Conflict',
              message: 'пост изменился в другом месте — обнови страницу',
            });
          }
          p.title = payload.title ?? '';
          p.body = payload.body ?? '';
          bump(p);
          return res(200, { ...p });
        case 'publish_now': {
          if (!p || (p.status !== 'approved' && p.status !== 'pending_review')) {
            return res(400, { statusCode: 400, error: 'bad_request', message: 'этот пост нельзя опубликовать' });
          }
          if (payload.updatedAt && Date.parse(payload.updatedAt) !== Date.parse(p.updatedAt)) {
            return res(409, {
              statusCode: 409,
              error: 'version_conflict',
              message: 'пост изменился в другом месте — обнови страницу',
            });
          }
          const shifted: Shift[] = [];
          if (p.status === 'approved' && p.slotAt) {
            const own = Date.parse(p.slotAt);
            let vacated = p.slotAt;
            const later = [...db.values()]
              .filter((x) => x.status === 'approved' && x.slotAt !== null && Date.parse(x.slotAt) > own)
              .sort((a, b) => Date.parse(a.slotAt!) - Date.parse(b.slotAt!));
            for (const x of later) {
              const from = x.slotAt!;
              shifted.push({ id: x.id, title: x.title, from, to: vacated });
              x.slotAt = vacated;
              vacated = from;
              bump(x);
            }
          }
          if (telegram.refuse) {
            p.status = 'approved';
            p.slotAt = NOW;
            p.lastError = telegram.refuse;
          } else {
            p.status = 'published';
            p.tgUrl = `https://t.me/ainomira/${++messageId}`;
          }
          bump(p);
          return res(200, { post: { ...p }, shifted });
        }
        default:
          throw new Error(`неожиданное действие ${payload.action}`);
      }
    };
    /** Правка мимо этой вкладки: замечание в личке бота, соседняя вкладка. */
    const touch = (id: string) => bump(db.get(id)!);
    return { handler, touch, get: (id: string) => ({ ...db.get(id)! }) };
  };

  let confirmSpy: MockInstance<(message?: string) => boolean>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    vi.useRealTimers();
  });

  const button = (id: string) => q(`blog-publish-now-${id}`) as HTMLButtonElement | null;
  const publishes = () => sentActions().filter((a) => a.action === 'publish_now');
  /** Тексты всех показанных подтверждений по порядку. */
  const asked = () => confirmSpy.mock.calls.map((c) => String(c[0]));
  const outcome = () => q('blog-publish-result');
  const shiftLines = () =>
    [...container.querySelectorAll('[data-testid="blog-publish-shift"]')].map((el) => el.textContent);

  it('кнопка есть у одобренного и у поста на проверке, у остальных статусов — нет', async () => {
    const statuses = ['idea', 'drafting', 'pending_review', 'approved', 'publishing', 'published', 'rejected', 'failed'];
    post.mockImplementation(async (_url: string, payload: Payload) => {
      if (payload.action === 'list') return res(200, statuses.map((status) => row({ id: `s-${status}`, status })));
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await mount();

    // Отрисованы все восемь — иначе «кнопки нет» было бы правдой впустую.
    expect(container.querySelectorAll('[data-testid^="blog-post-"]')).toHaveLength(statuses.length);
    expect(statuses.filter((s) => button(`s-${s}`) !== null)).toEqual(['pending_review', 'approved']);
  });

  it('без подтверждения ничего не уходит: «Отмена» — и запроса нет', async () => {
    confirmSpy.mockReturnValue(false);
    post.mockImplementation(channel([kira]).handler);
    await mount();
    await click('blog-publish-now-k1');

    expect(asked()).toHaveLength(1);
    expect(asked()[0]).toContain('Пост уйдёт в канал сразу. Отменить публикацию нельзя.');
    expect(sentActions().map((a) => a.action)).toEqual(['list']);
    expect(outcome()).toBeNull();
    expect(button('k1')!.disabled).toBe(false);
  });

  it('подтверждение называет пост; у одобренного предупреждает о сдвиге очереди, у поста на проверке — нет', async () => {
    confirmSpy.mockReturnValue(false);
    post.mockImplementation(channel([kira, review]).handler);
    await mount();
    await click('blog-publish-now-k1');
    await click('blog-publish-now-r1');

    const [approved, pending] = asked();
    expect(approved).toContain('«Кира: запись без звонков»');
    expect(approved).toContain('Пост уйдёт в канал сразу. Отменить публикацию нельзя.');
    expect(approved).toMatch(/следующие посты в очереди сдвинутся на слот вперёд/i);
    expect(pending).toContain('«Новинка на проверке»');
    expect(pending).toContain('Пост уйдёт в канал сразу. Отменить публикацию нельзя.');
    expect(pending).not.toMatch(/сдвин/i);
    expect(publishes()).toEqual([]);
  });

  it('вышел: ссылка на пост в канале и сдвиги очереди — даты той же фразой, что в Telegram', async () => {
    const blog = channel([kira, products, dance]);
    post.mockImplementation(blog.handler);
    await mount();
    await click('blog-publish-now-k1');

    expect(publishes()).toEqual([{ action: 'publish_now', id: 'k1', updatedAt: kira.updatedAt }]);

    const panel = outcome()!;
    expect(panel.dataset.outcome).toBe('published');
    const link = panel.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://t.me/ainomira/701');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(shiftLines()).toEqual([
      '«Продукты»: в среду, 30 сентября, в 10:00 МСК → в понедельник, 28 сентября, в 10:00 МСК',
      '«Кейс школы танцев»: в пятницу, 2 октября, в 10:00 МСК → в среду, 30 сентября, в 10:00 МСК',
    ]);
    expect(panel.textContent).not.toMatch(/не принял/i);
    expect(q('blog-error')).toBeNull();

    // Очередь перечитана: вышедшего поста в ней нет, остальные на новых слотах.
    expect(sentActions().map((a) => a.action)).toEqual(['list', 'publish_now', 'list']);
    expect(q('blog-post-k1')).toBeNull();
    expect(q('blog-when-pr1')!.textContent).toBe('Выйдет в понедельник, 28 сентября, в 10:00 МСК');
    expect(q('blog-when-d1')!.textContent).toBe('Выйдет в среду, 30 сентября, в 10:00 МСК');
  });

  it('сдвигов нет — списка нет', async () => {
    post.mockImplementation(channel([review, kira]).handler);
    await mount();
    await click('blog-publish-now-r1');

    expect(outcome()!.dataset.outcome).toBe('published');
    expect(q('blog-publish-shifts')).toBeNull();
    expect(outcome()!.textContent).not.toMatch(/сдвин/i);
    // Одобренный пост остался на своём слоте.
    expect(q('blog-when-k1')!.textContent).toBe('Выйдет в понедельник, 28 сентября, в 10:00 МСК');
  });

  it('Telegram не принял: причина и обещание повтора, а не «вышел»', async () => {
    const reason = 'Bad Request: not enough rights to send photos to the chat';
    post.mockImplementation(channel([kira, products], { refuse: reason }).handler);
    await mount();
    await click('blog-publish-now-k1');

    const panel = outcome()!;
    expect(panel.dataset.outcome).toBe('refused');
    expect(panel.textContent).toContain(
      `Telegram не принял пост: ${reason}. Повторим автоматически в ближайшие 5 минут`,
    );
    expect(panel.textContent).not.toMatch(/вышел|опубликован/i);
    expect(panel.querySelector('a')).toBeNull();
    // Очередь на бэке уже сдвинута — это видно и здесь.
    expect(shiftLines()).toEqual([
      '«Продукты»: в среду, 30 сентября, в 10:00 МСК → в понедельник, 28 сентября, в 10:00 МСК',
    ]);
    expect(q('blog-error')).toBeNull();
    // Пост остался в очереди, очередь перечитана.
    expect(sentActions().map((a) => a.action)).toEqual(['list', 'publish_now', 'list']);
    expect(q('blog-post-k1')).toBeTruthy();
  });

  it('выход не подтверждён — ни «вышел», ни «не принял»', async () => {
    post.mockImplementation(async (_url: string, payload: Payload) => {
      if (payload.action === 'list') return res(200, [kira]);
      if (payload.action === 'publish_now') {
        return res(200, { post: { ...kira, status: 'publishing' }, shifted: [] });
      }
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await mount();
    await click('blog-publish-now-k1');

    const panel = outcome()!;
    expect(panel.dataset.outcome).toBe('unconfirmed');
    expect(panel.textContent).toMatch(/не подтвержд/i);
    expect(panel.textContent).toContain('«Публикуется»');
    expect(panel.textContent).not.toMatch(/вышел в канал|не принял/i);
    expect(panel.querySelector('a')).toBeNull();
  });

  it('409 version_conflict: баннер и «Загрузить заново», очередь сама не перечитана, публикации нет', async () => {
    const blog = channel([kira]);
    post.mockImplementation(blog.handler);
    await mount();
    blog.touch('k1'); // пост тем временем поправили в личке бота
    const touched = blog.get('k1').updatedAt;
    await click('blog-publish-now-k1');

    const banner = q('blog-error')!;
    expect(banner.textContent).toContain('Пост изменили в другом месте');
    expect(banner.textContent).toContain('пост изменился в другом месте — обнови страницу');
    expect(banner.textContent).toContain('Публикация не выполнена');
    expect(banner.textContent).not.toContain('409');
    expect(q('blog-conflict-reload')).toBeTruthy();
    expect(outcome()).toBeNull();
    expect(blog.get('k1').status).toBe('approved');
    // Сами не перечитываем: свежая версия сняла бы защиту, и следующее
    // нажатие выпустило бы текст, которого владелец не видел.
    expect(sentActions().map((a) => a.action)).toEqual(['list', 'publish_now']);

    // Решает человек: перечитал — и публикация уходит уже с новой версией.
    await click('blog-conflict-reload');
    await click('blog-publish-now-k1');
    expect(publishes().map((a) => a.updatedAt)).toEqual([kira.updatedAt, touched]);
    expect(outcome()!.dataset.outcome).toBe('published');
  });

  it('400: причина с сервера, а не код ответа', async () => {
    post.mockImplementation(async (_url: string, payload: Payload) => {
      if (payload.action === 'list') return res(200, [kira]);
      if (payload.action === 'publish_now') {
        return res(400, { statusCode: 400, error: 'bad_request', message: 'канал не задан в настройках' });
      }
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await mount();
    await click('blog-publish-now-k1');

    const banner = q('blog-error')!;
    expect(banner.textContent).toMatch(/не опубликовано/i);
    expect(banner.textContent).toContain('канал не задан в настройках');
    expect(banner.textContent).not.toContain('400');
    expect(q('blog-conflict-reload')).toBeNull();
    expect(outcome()).toBeNull();
  });

  it('ответа нет (502 от прокси) — не утверждаем, что пост не вышел', async () => {
    post.mockImplementation(async (_url: string, payload: Payload) => {
      if (payload.action === 'list') return res(200, [kira]);
      if (payload.action === 'publish_now') {
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        };
      }
      throw new Error(`неожиданное действие ${payload.action}`);
    });
    await mount();
    await click('blog-publish-now-k1');

    const banner = q('blog-error')!;
    expect(banner.textContent).toMatch(/публикация не подтверждена/i);
    expect(banner.textContent).toMatch(/мог уйти в канал/i);
    expect(banner.textContent).not.toMatch(/не опубликовано/i);
  });

  it('пока запрос идёт, кнопка недоступна, и второго запроса нет', async () => {
    const blog = channel([kira, products]);
    let release: () => void = () => {};
    post.mockImplementation(async (url: string, payload: Payload) => {
      if (payload.action === 'publish_now') {
        await new Promise<void>((done) => {
          release = done;
        });
      }
      return blog.handler(url, payload);
    });
    await mount();
    await click('blog-publish-now-k1');

    expect(publishes()).toHaveLength(1);
    expect(button('k1')!.disabled).toBe(true);
    expect(button('k1')!.textContent).toMatch(/публикую/i);

    await click('blog-publish-now-k1');
    expect(asked()).toHaveLength(1);
    expect(publishes()).toHaveLength(1);

    await act(async () => release());
    expect(outcome()!.dataset.outcome).toBe('published');
    expect(publishes()).toHaveLength(1);
  });

  it('два нажатия подряд, раньше перерисовки, — одна публикация', async () => {
    post.mockImplementation(channel([kira]).handler);
    await mount();
    const target = button('k1')!;
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(asked()).toHaveLength(1);
    expect(publishes()).toHaveLength(1);
    expect(outcome()!.dataset.outcome).toBe('published');
    expect(q('blog-error')).toBeNull();
  });

  it('несохранённая правка: публиковать нельзя, пока текст не сохранён', async () => {
    post.mockImplementation(channel([kira]).handler);
    await mount();
    expect(button('k1')!.disabled).toBe(false);
    expect(q('blog-publish-unsaved-k1')).toBeNull();

    await type('blog-body-k1', 'Текст про Киру, исправленный');
    expect(button('k1')!.disabled).toBe(true);
    expect(q('blog-publish-unsaved-k1')!.textContent).toMatch(/сначала сохраните текст/i);
    await click('blog-publish-now-k1');
    expect(asked()).toEqual([]);
    expect(publishes()).toEqual([]);

    // Правка, возвращённая к сохранённому тексту, — уже не правка.
    await type('blog-body-k1', 'Текст про Киру');
    expect(button('k1')!.disabled).toBe(false);
    expect(q('blog-publish-unsaved-k1')).toBeNull();

    // Заголовок уходит в подпись вместе с текстом — его правка тоже держит кнопку.
    await type('blog-title-k1', 'Кира: новый заголовок');
    expect(button('k1')!.disabled).toBe(true);
  });

  it('после сохранения уходит сохранённый текст — с версией, которую выдало сохранение', async () => {
    const blog = channel([kira]);
    post.mockImplementation(blog.handler);
    await mount();
    await type('blog-body-k1', 'Текст про Киру, исправленный');
    await click('blog-save-text-k1');
    const saved = blog.get('k1');
    expect(saved.body).toBe('Текст про Киру, исправленный');
    expect(button('k1')!.disabled).toBe(false);

    await click('blog-publish-now-k1');
    expect(publishes()).toEqual([{ action: 'publish_now', id: 'k1', updatedAt: saved.updatedAt }]);
    expect(blog.get('k1').status).toBe('published');
    expect(blog.get('k1').body).toBe('Текст про Киру, исправленный');
  });
});
