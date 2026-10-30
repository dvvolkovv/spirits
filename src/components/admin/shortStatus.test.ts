import { describe, it, expect } from 'vitest';
import { NOW, item } from './shortFixtures';
import {
  GROUP_ORDER, ShortStatus, archiveOf, groupOf, isReleased, noteChars, orderChars, publicationLabel,
  queueGroups, screenCounts, screenOf, shortTitle, statusLine,
} from './shortStatus';

describe('экраны и группы', () => {
  it('каждый статус — на своём экране и в своей группе', () => {
    const table: [ShortStatus, string, string | null][] = [
      ['pending_review', 'queue', 'review'], ['failed', 'queue', 'failed'],
      ['approved', 'queue', 'scheduled'], ['publishing', 'queue', 'scheduled'], ['idea', 'queue', 'ideas'],
      ['directing', 'queue', 'working'], ['capture_queued', 'queue', 'working'], ['capturing', 'queue', 'working'],
      ['writing', 'queue', 'working'], ['animate_queued', 'queue', 'working'], ['animating', 'queue', 'working'],
      ['render_queued', 'queue', 'working'], ['rendering', 'queue', 'working'],
      ['published', 'published', null], ['rejected', 'rejected', null],
    ];
    for (const [status, screen, group] of table) {
      expect([status, screenOf(status), groupOf(status)]).toEqual([status, screen, group]);
    }
  });

  it('очередь — группы по срочности, пустых нет; внутри по слоту, без слота — после, по созданию', () => {
    const groups = queueGroups([
      item({ id: 'idea', status: 'idea' }),
      item({ id: 'late', slotAt: '2030-01-04T15:00:00.000Z' }),
      item({ id: 'soon', slotAt: '2030-01-02T15:00:00.000Z' }),
      item({ id: 'noslot-old', createdAt: '2029-12-30T10:00:00.000Z' }),
      item({ id: 'noslot-new', createdAt: '2029-12-31T10:00:00.000Z' }),
      item({ id: 'pub', status: 'published' }),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['review', 'ideas']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['soon', 'late', 'noslot-old', 'noslot-new']);
    expect(GROUP_ORDER).toEqual(['review', 'failed', 'scheduled', 'working', 'ideas']);
  });

  it('архив — новые сверху; числа экранов', () => {
    const items = [
      item({ id: 'a', status: 'published', publishedAt: '2030-01-01T15:00:00.000Z' }),
      item({ id: 'b', status: 'published', publishedAt: '2030-01-03T15:00:00.000Z' }),
      item({ id: 'c', status: 'rejected' }),
      item({ id: 'd', status: 'writing' }),
    ];
    expect(archiveOf(items, 'published').map((i) => i.id)).toEqual(['b', 'a']);
    expect(archiveOf(items, 'rejected').map((i) => i.id)).toEqual(['c']);
    expect(screenCounts(items)).toEqual({ queue: 1, published: 2, rejected: 1 });
  });
});

describe('строка ролика', () => {
  it('название, иначе тема, иначе ключ темы', () => {
    expect(shortTitle(item({ title: 'Залог' }))).toBe('Залог');
    expect(shortTitle(item({ title: '  ' }))).toBe('Залог при аренде');
    expect(shortTitle(item({ title: null, topicHint: null }))).toBe('catalog:2030-W01:1');
  });

  it('что сказать по статусу — та же фраза о слоте, что у постов', () => {
    const slot = '2030-01-02T15:00:00.000Z';
    expect(statusLine(item({ status: 'pending_review', slotAt: slot }), NOW)).toBe('под слот завтра в 18:00 МСК');
    expect(statusLine(item({ status: 'approved', slotAt: slot }), NOW)).toBe('выйдет завтра в 18:00 МСК');
    expect(statusLine(item({ status: 'failed', failedFrom: 'animating' }), NOW)).toBe('упал: оживление');
    expect(statusLine(item({ status: 'writing', slotAt: slot }), NOW)).toBe('сценарий · под слот завтра в 18:00 МСК');
    expect(statusLine(item({ status: 'idea', source: 'manual' }), NOW)).toBe('идея · заказ');
    expect(statusLine(item({ status: 'rejected' }), NOW)).toBe('отклонён');
  });

  it('площадки словами; «уже вышел» — пост в канале или набор YouTube', () => {
    const pub = (status: any, platform: any = 'telegram') => ({ platform, status, url: null, lastError: null });
    expect(publicationLabel(pub('published'))).toBe('вышел');
    expect(publicationLabel(pub('manual_pending', 'youtube'))).toBe('набор отправлен');
    expect(publicationLabel(pub('manual_done', 'youtube'))).toBe('ссылка записана');
    expect(publicationLabel(pub('publishing'))).toBe('отправляется');
    expect(publicationLabel(pub('failed'))).toBe('упал');
    expect(publicationLabel(pub('pending'))).toBe('ждёт');
    expect(isReleased(item())).toBe(false);
    for (const status of ['published', 'manual_pending', 'manual_done']) {
      expect(isReleased(item({ publications: [pub(status, 'youtube')] }))).toBe(true);
    }
    expect(isReleased(item({ publications: [pub('failed')] }))).toBe(false);
  });

  it('длина заказа и замечания — символы без пробелов по краям, как на бэке', () => {
    expect(orderChars('  тема  ')).toBe(4);
    expect(orderChars('😀😀')).toBe(2);
    expect(noteChars(' коротко ')).toBe(7);
  });
});
