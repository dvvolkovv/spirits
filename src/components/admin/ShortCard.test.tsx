// @vitest-environment jsdom
import { act } from 'react';
import type { ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { click, mount, type, Mounted } from '../../test/dom';
import ShortCard from './ShortCard';
import { NOW, detail as baseDetail, item } from './shortFixtures';
import { MAX_NOTE_CHARS, ROW_ACTIONS, ShortAction, ShortDetail, ShortStatus, actionsFor } from './shortStatus';

const detail = (over: Parameters<typeof baseDetail>[0] = {}) =>
  baseDetail({
    title: 'Залог при аренде', durationMs: 44000, animation: { omniSeconds: 16 },
    captions: { telegram: 'Подпись в канал', youtube: { title: 'Заголовок YouTube' } },
    script: { hook: 'Зацепка', lines: [{ id: 'l1', scene: 'answer', text: 'Реплика' }] },
    videoUrl: 'https://my.linkeon.io/smm-media/linkeon-smm-videos/shorts/s1/video.mp4?v=V1',
    coverUrl: 'https://my.linkeon.io/smm-media/linkeon-smm-videos/shorts/s1/cover.jpg?v=V1',
    ...over,
  });

let m: Mounted;
afterEach(() => m?.unmount());
const q = (id: string) => m.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

const render = (props: Partial<ComponentProps<typeof ShortCard>> = {}) => {
  const onAction = vi.fn();
  const onToggle = vi.fn();
  const base: ComponentProps<typeof ShortCard> = {
    item: item(), assistantName: 'Алексей — юрист', open: false, detail: null, detailLoading: false,
    detailError: null, busy: false, now: NOW, onToggle, onAction, ...props,
  };
  m = mount(<ShortCard {...base} />);
  const rerender = (next: Partial<ComponentProps<typeof ShortCard>> = {}) => m.rerender(<ShortCard {...base} {...next} />);
  return { onAction, onToggle, rerender };
};

describe('строка ролика', () => {
  it('статус, название, рубрика, подача, ассистент, формат, когда; детали скрыты', () => {
    render({ item: item({ title: 'Залог при аренде', slotAt: '2030-01-02T15:00:00.000Z' }) });
    const text = m.container.textContent!;
    expect(text).toContain('Ждёт решения');
    expect(text).toContain('Залог при аренде');
    expect(text).toContain('Ассистент за работой · Разнос · Алексей — юрист · сценки');
    expect(q('short-line-s1')!.textContent).toBe('под слот завтра в 18:00 МСК');
    expect(q('short-details-s1')).toBeNull();
  });

  it('идея — «Запустить сейчас» прямо в строке; подача по ритму, если не задана', () => {
    const { onAction } = render({ item: item({ status: 'idea', angleLocked: false }) });
    expect(m.container.textContent).toContain('подача по ритму недели');
    click(q('short-start-s1')!);
    expect(onAction).toHaveBeenCalledWith('start_now');
  });

  it('идея — «Отклонить» в строке рядом с «Запустить сейчас» зовёт onAction', () => {
    const { onAction } = render({ item: item({ status: 'idea' }) });
    click(q('short-idea-reject-s1')!);
    expect(onAction).toHaveBeenCalledWith('reject');
  });

  it('идея занята — «Запустить сейчас» и «Отклонить» в строке недоступны', () => {
    render({ item: item({ status: 'idea' }), busy: true });
    expect((q('short-start-s1') as HTMLButtonElement).disabled).toBe(true);
    expect((q('short-idea-reject-s1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('строка идеи — перенос на мобильных: группа кнопок не растягивает колонку текста', () => {
    // Измерено в Chromium на 360px: без flex-wrap и с min-w-0 на кнопке
    // раскрытия колонка текста ужималась до ~47px, карточка идеи вдвое
    // выше нужного, а «Запустить сейчас» наезжала на плашку «Идея».
    render({ item: item({ status: 'idea' }) });
    const row = q('short-toggle-s1')!.parentElement!;
    expect(row.className).toContain('flex-wrap');
    const toggle = q('short-toggle-s1')!;
    expect(toggle.className).toContain('min-w-[12rem]');
    expect(toggle.className).not.toContain('min-w-0');
    const group = q('short-start-s1')!.parentElement!;
    expect(group.className).toContain('flex-shrink-0');
    expect(group.className).toContain('ml-auto');
    expect(q('short-start-s1')!.className).not.toContain('flex-shrink-0');
    expect(q('short-idea-reject-s1')!.className).not.toContain('flex-shrink-0');
  });

  it('кнопки строки идеи — aria-describedby на заголовок ролика', () => {
    render({ item: item({ status: 'idea' }) });
    const titleId = 'short-title-s1';
    expect(m.container.querySelector(`#${titleId}`)).not.toBeNull();
    expect(q('short-start-s1')!.getAttribute('aria-describedby')).toBe(titleId);
    expect(q('short-idea-reject-s1')!.getAttribute('aria-describedby')).toBe(titleId);
  });

  it('заголовок — min-w-0, чтобы длинная неразрывная ссылка не распирала строку', () => {
    // Измерено в Chromium на 320px: без min-w-0 на заголовке вставленная
    // ссылка без пробелов распирала строку на 244px поверх контейнера.
    render({ item: item({ title: 'https://example.com/очень/длинная/неразрывная/ссылка/без/пробелов-1234567890' }) });
    const title = m.container.querySelector('#short-title-s1')!;
    expect(title.className).toContain('min-w-0');
    expect(title.className).toContain('break-words');
  });

  it('подача идеи, заведённой с плейсхолдером «Как это работает» (calm), — всё равно «по ритму», пока не задана явно', () => {
    // Идеи заводятся с angle:'calm' как плейсхолдером — это не «решение»,
    // пока angleLocked не подтвердит, что подачу выбрали осознанно.
    render({ item: item({ status: 'idea', angle: 'calm', angleLocked: false }) });
    expect(m.container.textContent).toContain('подача по ритму недели');
    expect(m.container.textContent).not.toContain('Как это работает');
  });

  it('отклонённая идея, которую не запускали (нет slotAt), — тоже «по ритму», не плейсхолдер «Как это работает»', () => {
    render({ item: item({ status: 'rejected', angle: 'calm', angleLocked: false, slotAt: null }) });
    expect(m.container.textContent).toContain('подача по ритму недели');
    expect(m.container.textContent).not.toContain('Как это работает');
  });

  it('отклонённый ролик, который реально запускали (есть slotAt) до отказа, — показывает настоящую подачу', () => {
    render({ item: item({ status: 'rejected', angle: 'roast', angleLocked: false, slotAt: '2030-01-02T15:00:00.000Z' }) });
    expect(m.container.textContent).toContain('Разнос');
    expect(m.container.textContent).not.toContain('подача по ритму недели');
  });

  it('отклонённая идея без slotAt, но с явно заданной подачей (angleLocked) — показывает её, не «по ритму»', () => {
    render({ item: item({ status: 'rejected', angle: 'myth', angleLocked: true, slotAt: null }) });
    expect(m.container.textContent).toContain('ИИ против мифа');
    expect(m.container.textContent).not.toContain('подача по ритму недели');
  });

  it('площадки — ссылка на вышедшее, причина у упавшего', () => {
    render({
      item: item({
        status: 'published',
        publications: [
          { platform: 'telegram', status: 'published', url: 'https://t.me/ainomira/90', lastError: null },
          { platform: 'youtube', status: 'failed', url: null, lastError: 'quota' },
        ],
      }),
    });
    expect(q('short-pub-s1-telegram')!.getAttribute('href')).toBe('https://t.me/ainomira/90');
    expect(q('short-pub-s1-youtube')!.textContent).toBe('YouTube: упал');
    expect(q('short-pub-s1-youtube')!.getAttribute('title')).toBe('quota');
  });

  it('небезопасная ссылка на пост — без href, только плашка с причиной', () => {
    render({
      item: item({
        status: 'failed',
        publications: [{ platform: 'youtube', status: 'failed', url: 'javascript:alert(1)', lastError: 'quota' }],
      }),
    });
    const chip = q('short-pub-s1-youtube')!;
    expect(chip.tagName).toBe('SPAN');
    expect(chip.querySelector('a')).toBeNull();
    expect(chip.textContent).toBe('YouTube: упал');
    expect(chip.getAttribute('title')).toBe('quota');
  });

  it('кнопка строки — aria-expanded следует open, aria-controls указывает на блок деталей, клик зовёт onToggle', () => {
    const { onToggle, rerender } = render({ open: false });
    const toggle = q('short-toggle-s1')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('short-details-s1');
    click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender({ open: true, detail: detail() });
    expect(q('short-toggle-s1')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('ошибка в строке — одна строка без block, скрыта при раскрытой карточке', () => {
    const longError = 'x'.repeat(50);
    const { rerender } = render({ item: item({ status: 'failed', lastError: longError }) });
    const line = m.container.querySelector('.line-clamp-1');
    expect(line).toBeTruthy();
    expect(line!.textContent).toBe(longError);
    expect(line!.className).not.toContain('block');
    expect(line!.className).not.toContain('line-clamp-2');

    rerender({ open: true, detail: detail({ status: 'failed', failedFrom: 'rendering' }) });
    expect(m.container.querySelector('.line-clamp-1')).toBeNull();
  });
});

describe('раскрытая карточка', () => {
  it('видео грузится только по нажатию; подпись в канал, сценарий, цифры', () => {
    render({ open: true, detail: detail() });
    const video = q('short-video-s1') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.getAttribute('src')).toBe(detail().videoUrl);
    expect(video.getAttribute('poster')).toBe(detail().coverUrl);
    expect(m.container.textContent).toContain('Подпись в канал');
    expect(m.container.textContent).toContain('Зацепка');
    expect(q('short-stats-s1')!.textContent).toBe('44 с · Omni: 16 с');
  });

  it('видео не загрузилось — ссылка на файл', () => {
    render({ open: true, detail: detail() });
    act(() => {
      q('short-video-s1')!.dispatchEvent(new Event('error'));
    });
    expect(q('short-video-broken-s1')!.querySelector('a')!.getAttribute('href')).toBe(detail().videoUrl);
  });

  it('видео недоступно (409) — после подмены ссылки плеер возвращается с новым src', () => {
    const { rerender } = render({ open: true, detail: detail({ videoUrl: 'https://my.linkeon.io/v1.mp4' }) });
    act(() => {
      q('short-video-s1')!.dispatchEvent(new Event('error'));
    });
    expect(q('short-video-broken-s1')).toBeTruthy();
    expect(q('short-video-s1')).toBeNull();

    rerender({ detail: detail({ videoUrl: 'https://my.linkeon.io/v2.mp4' }) });
    const video = q('short-video-s1') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute('src')).toBe('https://my.linkeon.io/v2.mp4');
    expect(q('short-video-broken-s1')).toBeNull();
  });

  it('идёт загрузка карточки — индикатор с role=status', () => {
    render({ open: true, detail: null, detailLoading: true });
    const status = m.container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status!.textContent).toContain('Загружаю ролик');
  });

  it('ошибка загрузки карточки — текст с role=status', () => {
    render({ open: true, detail: null, detailLoading: false, detailError: 'нет сети' });
    const status = m.container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status!.textContent).toBe('Не загрузил ролик: нет сети');
  });

  it('ждёт решения — кнопки решения; пустое замечание не отправить', () => {
    const { onAction } = render({ open: true, detail: detail({ status: 'pending_review' }) });
    expect(q('short-approve')).toBeTruthy();
    expect(q('short-publish-now')).toBeNull();
    const send = q('short-send-note') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    type(q('short-note')!, 'короче');
    expect(send.disabled).toBe(false);
    click(send);
    expect(onAction).toHaveBeenCalledWith('note', { text: 'короче' });
  });

  it('замечание из пробелов и длиннее лимита не отправить; счётчик считает символы', () => {
    const { onAction } = render({ open: true, detail: detail({ status: 'pending_review' }) });
    const send = q('short-send-note') as HTMLButtonElement;
    const counter = () => q('short-note-counter')!.textContent;

    expect(counter()).toBe(`0 / ${MAX_NOTE_CHARS}`);
    type(q('short-note')!, '   ');
    expect(send.disabled).toBe(true);
    expect(counter()).toBe(`0 / ${MAX_NOTE_CHARS}`);

    const long = 'a'.repeat(MAX_NOTE_CHARS + 1);
    type(q('short-note')!, long);
    expect(send.disabled).toBe(true);
    expect(counter()).toBe(`${MAX_NOTE_CHARS + 1} / ${MAX_NOTE_CHARS}`);
    expect(q('short-note-counter')!.className).toContain('text-rose-600');
    expect(m.container.textContent).toContain(`Замечание длиннее ${MAX_NOTE_CHARS} знаков.`);
    click(send);
    expect(onAction).not.toHaveBeenCalled();

    type(q('short-note')!, 'короче');
    expect(send.disabled).toBe(false);
    expect(counter()).toBe(`6 / ${MAX_NOTE_CHARS}`);
  });

  it('упала публикация — «Пост вышел» только со ссылкой на пост; замечания к повтору нет', () => {
    const { onAction } = render({
      open: true, item: item({ status: 'failed' }),
      detail: detail({
        status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z',
        // Строка Telegram нужна, чтобы «Пост вышел» вообще показался — без
        // неё (например, площадки только YouTube) кнопки нет.
        publications: [{ platform: 'telegram', status: 'failed', url: null, lastError: null }],
      }),
    });
    const mark = q('short-mark-published') as HTMLButtonElement;
    expect(q('short-post-url')!.getAttribute('inputmode')).toBe('url');
    type(q('short-post-url')!, 'https://t.me/ainomira');
    expect(mark.disabled).toBe(true);
    type(q('short-post-url')!, 'https://t.me/ainomira/90');
    expect(mark.disabled).toBe(false);
    click(mark);
    expect(onAction).toHaveBeenCalledWith('mark_published', { url: 'https://t.me/ainomira/90' });
    expect(q('short-retry-note')).toBeNull();
  });

  it('повтор упавшей публикации — старое замечание из прежнего состояния карточки не утекает', () => {
    const { rerender, onAction } = render({
      open: true, item: item({ status: 'failed' }),
      detail: detail({ status: 'failed', failedFrom: 'rendering', capture: { answerText: 'x' } }),
    });
    type(q('short-retry-note')!, 'старое замечание');
    rerender({
      item: item({ status: 'failed' }),
      detail: detail({ status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z' }),
    });
    expect(q('short-retry-note')).toBeNull();
    click(q('short-retry')!);
    expect(onAction).toHaveBeenCalledWith('retry', undefined);
  });

  it('упал до публикации — повтор с необязательным замечанием', () => {
    const { onAction } = render({
      open: true, item: item({ status: 'failed' }),
      detail: detail({ status: 'failed', failedFrom: 'rendering', capture: { answerText: 'x' } }),
    });
    type(q('short-retry-note')!, 'другой вопрос');
    click(q('short-retry-directing')!);
    expect(onAction).toHaveBeenCalledWith('retry_directing', { note: 'другой вопрос' });
  });

  it('замечание к повтору длиннее лимита — кнопки повтора недоступны', () => {
    render({
      open: true, item: item({ status: 'failed' }),
      detail: detail({ status: 'failed', failedFrom: 'rendering', capture: { answerText: 'x' } }),
    });
    const retry = q('short-retry') as HTMLButtonElement;
    const directing = q('short-retry-directing') as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    type(q('short-retry-note')!, 'a'.repeat(MAX_NOTE_CHARS + 1));
    expect(retry.disabled).toBe(true);
    expect(directing.disabled).toBe(true);
    expect(m.container.textContent).toContain(`Замечание длиннее ${MAX_NOTE_CHARS} знаков.`);
  });

  it('раскрытая идея — без пустой обёртки действий (кнопка только в строке)', () => {
    render({ open: true, item: item({ status: 'idea' }), detail: detail({ status: 'idea' }) });
    expect(q('short-actions-s1')).toBeNull();
  });

  it('раскрытая идея — «Отклонить» не дублируется в карточке', () => {
    render({ open: true, item: item({ status: 'idea' }), detail: detail({ status: 'idea', videoUrl: null }) });
    expect(q('short-reject')).toBeNull();
    expect(q('short-idea-reject-s1')).not.toBeNull();
  });

  it('строка — идея, но открытая карточка уже обогнала (автозапуск сменил статус) — кнопок строки нет, карточка не дублируется своим «Отклонить», а строка объясняет почему', () => {
    render({
      open: true,
      item: item({ status: 'idea' }),
      detail: detail({ status: 'pending_review', approvedAt: null }),
    });
    expect(q('short-start-s1')).toBeNull();
    expect(q('short-idea-reject-s1')).toBeNull();
    expect(q('short-reject')).not.toBeNull();
    // Кнопки строки не пропадают молча — короткая строка называет текущий
    // статус карточки и подсказывает обновить список.
    expect(q('short-row-stale-s1')!.textContent).toBe('Сейчас — «Ждёт решения»: список устарел, нажмите «Обновить».');
  });

  it('то же устаревание, но список, наоборот, новее карточки — свою подсказку не дублируем (внутри карточки уже есть своя плашка)', () => {
    render({
      open: true,
      item: item({ status: 'idea', updatedAt: '2030-01-01T10:05:00.000Z' }),
      detail: detail({ status: 'pending_review', approvedAt: null, updatedAt: '2030-01-01T10:00:00.000Z' }),
    });
    expect(q('short-start-s1')).toBeNull();
    expect(q('short-idea-reject-s1')).toBeNull();
    // rowNewer виновата строка — про неё уже говорит short-stale внутри
    // карточки; вторая, построчная подсказка здесь избыточна.
    expect(q('short-row-stale-s1')).toBeNull();
    expect(q('short-stale-s1')!.textContent).toBe(
      'Ролик изменился, пока карточка была открыта — сверните и раскройте её заново.',
    );
  });

  it('отклонённый без видео — текст заказа, а не «Видео ещё нет»', () => {
    render({
      open: true,
      item: item({ status: 'rejected' }),
      detail: detail({ status: 'rejected', videoUrl: null, topicHint: 'Залог при аренде квартиры' }),
    });
    expect(q('short-idea-order-s1')!.textContent).toBe('Залог при аренде квартиры');
    expect(m.container.textContent).not.toContain('Видео ещё нет');
  });

  it('отклонённый без темы — «Видео нет.», не «Видео ещё нет» (он никогда не соберётся)', () => {
    render({
      open: true,
      item: item({ status: 'rejected', topicHint: null }),
      detail: detail({ status: 'rejected', videoUrl: null, topicHint: null }),
    });
    expect(m.container.textContent).toContain('Видео нет.');
    expect(m.container.textContent).not.toContain('Видео ещё нет');
    expect(q('short-idea-order-s1')).toBeNull();
  });

  it('отклонённый, но с видео — видео показано как обычно', () => {
    render({ open: true, item: item({ status: 'rejected' }), detail: detail({ status: 'rejected' }) });
    const video = q('short-video-s1') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute('src')).toBe(detail().videoUrl);
    expect(q('short-idea-order-s1')).toBeNull();
  });

  it('раскрытая идея без видео — полный текст заказа вместо «Видео ещё нет», с переносами строк', () => {
    render({
      open: true,
      item: item({ status: 'idea' }),
      detail: detail({ status: 'idea', videoUrl: null, topicHint: 'Строка первая\nСтрока вторая' }),
    });
    expect(m.container.textContent).not.toContain('Видео ещё нет');
    const order = q('short-idea-order-s1')!;
    expect(order.textContent).toBe('Строка первая\nСтрока вторая');
    expect(order.className).toContain('whitespace-pre-wrap');
    expect(order.className).toContain('break-words');
  });

  it('раскрытая идея без видео и без темы — старая фраза остаётся (нечего показать вместо неё)', () => {
    render({
      open: true,
      item: item({ status: 'idea', topicHint: null }),
      detail: detail({ status: 'idea', videoUrl: null, topicHint: null }),
    });
    expect(m.container.textContent).toContain('Видео ещё нет — ролик не собран.');
    expect(q('short-idea-order-s1')).toBeNull();
  });

  it('строка новее открытой карточки — подсказка свернуть и раскрыть заново', () => {
    render({
      open: true,
      item: item({ version: 'V_LIST_NEW', updatedAt: '2030-01-01T10:05:00.000Z' }),
      detail: detail({ version: 'V_CARD_OLD', updatedAt: '2030-01-01T10:00:00.000Z' }),
    });
    expect(q('short-stale-s1')!.textContent).toBe(
      'Ролик изменился, пока карточка была открыта — сверните и раскройте её заново.',
    );
  });

  it('открытая карточка новее строки (список просто не успел обновиться до раскрытия) — подсказки нет', () => {
    // Раскрытие зовёт get и приносит уже свежие данные; список обновится
    // позже или не обновится вовсе — это не «изменился, пока было открыто».
    render({
      open: true,
      item: item({ version: 'V_LIST_OLD', updatedAt: '2030-01-01T10:00:00.000Z' }),
      detail: detail({ version: 'V_CARD_NEW', updatedAt: '2030-01-01T10:05:00.000Z' }),
    });
    expect(q('short-stale-s1')).toBeNull();
  });

  it('версии совпадают — подсказки нет', () => {
    render({ open: true, detail: detail() });
    expect(q('short-stale-s1')).toBeNull();
  });

  it('причина сбоя публикации видна текстом в раскрытой карточке (не только в title)', () => {
    render({
      open: true,
      item: item({ status: 'failed' }),
      detail: detail({
        status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z',
        publications: [{ platform: 'youtube', status: 'failed', url: null, lastError: 'quota exceeded' }],
      }),
    });
    expect(m.container.textContent).toContain('YouTube: quota exceeded');
  });
});

describe('кнопки раскрытой карточки — по actionsFor', () => {
  const ACTION_TESTID: [ShortAction, string][] = [
    ['approve', 'short-approve'], ['publish_now', 'short-publish-now'], ['retry', 'short-retry'],
    ['retry_directing', 'short-retry-directing'], ['retry_writing', 'short-retry-writing'],
    ['redo', 'short-redo'], ['reject', 'short-reject'], ['mark_published', 'short-mark-published'],
  ];

  const cases: [string, Partial<ShortDetail>][] = [
    ['идея', { status: 'idea' }],
    ['одобрен, не вышел нигде', { status: 'approved', approvedAt: '2030-01-01T11:00:00.000Z' }],
    ['упал на публикации без одобрения — только «Отклонить»', { status: 'failed', failedFrom: 'publishing', approvedAt: null }],
    ['упал без этапа — только «Отклонить»', { status: 'failed', failedFrom: null }],
    ['упал на публикации — пост ещё не вышел', {
      status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z',
    }],
    ['упал до публикации — на сборке', { status: 'failed', failedFrom: 'rendering' }],
    ['упал на публикации, но уже вышел в телеграм (released)', {
      status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z',
      publications: [
        { platform: 'telegram', status: 'published', url: 'https://t.me/ainomira/90', lastError: null },
        { platform: 'youtube', status: 'failed', url: null, lastError: 'quota' },
      ],
    }],
  ];

  it.each(cases)('%s', (_label, over) => {
    const d = detail(over);
    render({ open: true, item: item({ status: d.status, failedFrom: d.failedFrom }), detail: d });
    // Кнопки карточки — это actionsFor МИНУС действия строки (ROW_ACTIONS):
    // у идеи обе её кнопки («Запустить сейчас», «Отклонить») — в строке
    // (ShortCard), не здесь.
    const rowOnly = ROW_ACTIONS[d.status] ?? [];
    const actions = new Set(actionsFor(d).filter((a) => !rowOnly.includes(a)));
    const result: Record<string, boolean> = {};
    const want: Record<string, boolean> = {};
    for (const [action, testid] of ACTION_TESTID) {
      result[testid] = q(testid) !== null;
      want[testid] = actions.has(action);
    }
    expect(result).toEqual(want);

    // Кнопки строки («Запустить сейчас», «Отклонить» идеи) — только у идеи;
    // у остальных статусов их нет вовсе (не только их действий в карточке).
    expect(q('short-start-s1') !== null).toBe(d.status === 'idea');
    expect(q('short-idea-reject-s1') !== null).toBe(d.status === 'idea');
  });

  it('ROW_ACTIONS — каждое перечисленное действие и впрямь рисует кнопку в строке', () => {
    // ShortCard умеет рисовать СТРОКОЙ только 'start_now' и 'reject' — этот
    // список и проверяем. Если в ROW_ACTIONS добавят статус с действием, для
    // которого строка кнопки не рисует (например, approved: ['publish_now']
    // без кнопки в ShortCard), этот тест падает, а не молчит.
    const ROW_ACTION_TESTID: Partial<Record<ShortAction, (id: string) => string>> = {
      start_now: (id) => `short-start-${id}`,
      reject: (id) => `short-idea-reject-${id}`,
    };
    const entries = Object.entries(ROW_ACTIONS) as [ShortStatus, readonly ShortAction[]][];
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach(([status, actions], i) => {
      render({ item: item({ status }) });
      for (const action of actions) {
        const testid = ROW_ACTION_TESTID[action];
        expect(testid, `нет отображения действия строки «${action}» статуса «${status}» — добавьте кнопку в ShortCard и её testid в ROW_ACTION_TESTID этого теста`).toBeDefined();
        expect(q(testid!('s1')), `кнопка строки для действия «${action}» статуса «${status}» не отрисована`).not.toBeNull();
      }
      if (i < entries.length - 1) m.unmount();
    });
  });
});

describe('busy гасит кнопки решения', () => {
  it('ждёт решения: занято гасит одобрить/переснять/отклонить/отправить замечание', () => {
    render({ open: true, detail: detail({ status: 'pending_review' }), busy: true });
    type(q('short-note')!, 'правка');
    expect((q('short-approve') as HTMLButtonElement).disabled).toBe(true);
    expect((q('short-redo') as HTMLButtonElement).disabled).toBe(true);
    expect((q('short-reject') as HTMLButtonElement).disabled).toBe(true);
    expect((q('short-send-note') as HTMLButtonElement).disabled).toBe(true);
  });

  it('запланирован: занято гасит «Опубликовать сейчас»', () => {
    render({ open: true, detail: detail({ status: 'approved', approvedAt: '2030-01-01T11:00:00.000Z' }), busy: true });
    expect((q('short-publish-now') as HTMLButtonElement).disabled).toBe(true);
  });

  it('упал на съёмке: занято гасит повтор/новую сцену/новый текст', () => {
    render({
      open: true,
      detail: detail({ status: 'failed', failedFrom: 'capturing', capture: { answerText: 'x' } }),
      busy: true,
    });
    type(q('short-retry-note')!, 'заметка');
    expect((q('short-retry') as HTMLButtonElement).disabled).toBe(true);
    expect((q('short-retry-directing') as HTMLButtonElement).disabled).toBe(true);
    expect((q('short-retry-writing') as HTMLButtonElement).disabled).toBe(true);
  });

  it('упал на публикации: занято гасит «Пост вышел»', () => {
    render({
      open: true,
      detail: detail({
        status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z',
        publications: [{ platform: 'telegram', status: 'failed', url: null, lastError: null }],
      }),
      busy: true,
    });
    type(q('short-post-url')!, 'https://t.me/ainomira/90');
    expect((q('short-mark-published') as HTMLButtonElement).disabled).toBe(true);
  });
});
