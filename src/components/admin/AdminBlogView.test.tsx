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
