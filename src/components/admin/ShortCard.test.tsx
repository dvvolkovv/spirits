// @vitest-environment jsdom
import { act } from 'react';
import type { ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { click, mount, type, Mounted } from '../../test/dom';
import ShortCard from './ShortCard';
import { NOW, detail as baseDetail, item } from './shortFixtures';

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
  m = mount(
    <ShortCard item={item()} assistantName="Алексей — юрист" open={false} detail={null} detailLoading={false}
      detailError={null} busy={false} now={NOW} onToggle={onToggle} onAction={onAction} {...props} />,
  );
  return { onAction, onToggle };
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

  it('упала публикация — «Пост вышел» только со ссылкой на пост; замечания к повтору нет', () => {
    const { onAction } = render({
      open: true, item: item({ status: 'failed' }),
      detail: detail({ status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z' }),
    });
    const mark = q('short-mark-published') as HTMLButtonElement;
    type(q('short-post-url')!, 'https://t.me/ainomira');
    expect(mark.disabled).toBe(true);
    type(q('short-post-url')!, 'https://t.me/ainomira/90');
    expect(mark.disabled).toBe(false);
    click(mark);
    expect(onAction).toHaveBeenCalledWith('mark_published', { url: 'https://t.me/ainomira/90' });
    expect(q('short-retry-note')).toBeNull();
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
});
