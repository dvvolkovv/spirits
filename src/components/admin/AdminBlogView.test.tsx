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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  type Payload = { action: string; count?: number; id?: string; slotAt?: string; updatedAt?: string };
  type FakePost = { id: string; status: string; slotAt: string | null; title: string | null; updatedAt: string };

  /**
   * Бэк блога в миниатюре — строго по контракту: слот занят одобренным
   * постом с таким `slotAt`, версия поста — `updatedAt`, перенос её
   * сдвигает. Чужой слот → 409 slot_taken, устаревшая версия → 409
   * version_conflict (версию, как и настоящий бэк, сверяет только если её
   * прислали).
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
        default:
          throw new Error(`неожиданное действие ${payload.action}`);
      }
    };
    return { handler, bump };
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
