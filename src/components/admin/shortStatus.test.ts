import { describe, it, expect } from 'vitest';
import { NOW, detail, item } from './shortFixtures';
import {
  GROUP_ORDER, PublicationStatus, STATUS_TITLES, ShortPlatform, ShortPublication, ShortSettings, ShortStatus,
  actionRequest, actionsFor, archiveOf, draftErrors, draftToPatch, groupOf, isReleased, isTelegramPostUrl,
  noteChars, orderChars, publicationLabel, queueGroups, screenCounts, screenOf, shortTitle, statusLine,
  successText, toDraft,
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
    expect(table.map(([s]) => s).sort()).toEqual((Object.keys(STATUS_TITLES) as ShortStatus[]).sort());
  });

  it('очередь — группы по срочности, пустых нет; внутри по слоту, без слота — после, по созданию', () => {
    const groups = queueGroups([
      item({ id: 'idea', status: 'idea' }),
      item({ id: 'late', slotAt: '2030-01-04T15:00:00.000Z' }),
      item({ id: 'soon', slotAt: '2030-01-02T15:00:00.000Z' }),
      item({ id: 'noslot-new', createdAt: '2029-12-31T10:00:00.000Z' }),
      item({ id: 'noslot-old', createdAt: '2029-12-30T10:00:00.000Z' }),
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
    expect(statusLine(item({ status: 'idea', source: 'manual' }), NOW)).toBe('заказ владельца');
    expect(statusLine(item({ status: 'rejected' }), NOW)).toBe('отклонён');
  });

  it('площадки словами; «уже вышел» — пост в канале или набор YouTube', () => {
    const pub = (status: PublicationStatus, platform: ShortPlatform = 'telegram'): ShortPublication =>
      ({ platform, status, url: null, lastError: null });
    expect(publicationLabel(pub('published'))).toBe('вышел');
    expect(publicationLabel(pub('manual_pending', 'youtube'))).toBe('набор отправлен');
    expect(publicationLabel(pub('manual_done', 'youtube'))).toBe('ссылка записана');
    expect(publicationLabel(pub('publishing'))).toBe('отправляется');
    expect(publicationLabel(pub('failed'))).toBe('упал');
    expect(publicationLabel(pub('pending'))).toBe('ждёт');
    expect(isReleased(item())).toBe(false);
    for (const status of ['published', 'manual_pending', 'manual_done'] as const) {
      expect(isReleased(item({ publications: [pub(status, 'youtube')] }))).toBe(true);
    }
    expect(isReleased(item({ publications: [pub('failed')] }))).toBe(false);
  });

  it('длина заказа и замечания — символы без пробелов по краям, как на бэке', () => {
    expect(orderChars('  тема  ')).toBe(4);
    expect(orderChars('😀😀')).toBe(2);
    expect(noteChars(' коротко ')).toBe(7);
  });

  it('прошедший слот не выглядит будущим', () => {
    const past = '2029-12-31T15:00:00.000Z';
    expect(statusLine(item({ status: 'pending_review', slotAt: past }), NOW)).toMatch(/^слот .+ прошёл — одобрение займёт ближайший свободный$/);
    expect(statusLine(item({ status: 'approved', slotAt: past }), NOW)).toBe('уходит на площадки в ближайшие минуты');
    expect(statusLine(item({ status: 'writing', slotAt: past }), NOW)).toMatch(/^сценарий · слот .+ прошёл$/);
  });

  it('остальные ветки строки', () => {
    expect(statusLine(item({ status: 'publishing' }), NOW)).toBe('отправляется на площадки');
    expect(statusLine(item({ status: 'pending_review', slotAt: null }), NOW)).toBe('ждёт решения');
    expect(statusLine(item({ status: 'approved', slotAt: null }), NOW)).toBe('одобрен, слот не назначен');
    expect(statusLine(item({ status: 'failed', failedFrom: null }), NOW)).toBe('упал');
    expect(statusLine(item({ status: 'writing', slotAt: null }), NOW)).toBe('сценарий');
    expect(statusLine(item({ status: 'idea', source: 'catalog' }), NOW)).toBe('из каталога');
    expect(statusLine(item({ status: 'published', publishedAt: null }), NOW)).toBe('вышел');
    expect(statusLine(item({ status: 'published', publishedAt: '2029-12-31T15:00:00.000Z' }), NOW)).toMatch(/^вышел .+МСК$/);
    expect(statusLine(item({
      status: 'failed', failedFrom: 'publishing',
      publications: [{ platform: 'telegram', status: 'published', url: null, lastError: null }],
    }), NOW)).toBe('вышел не на все площадки');
  });
});

const tg = (status: PublicationStatus): ShortPublication => ({ platform: 'telegram', status, url: null, lastError: null });

describe('кнопки по статусу', () => {
  it('ждёт решения — одобрить, замечание, переснять, отклонить', () => {
    expect(actionsFor(detail({ status: 'pending_review' }))).toEqual(['approve', 'note', 'redo', 'reject']);
  });

  it('запланирован — опубликовать, переснять, отклонить; вышел хоть где-то — только опубликовать', () => {
    expect(actionsFor(detail({ status: 'approved' }))).toEqual(['publish_now', 'redo', 'reject']);
    expect(actionsFor(detail({ status: 'approved', publications: [tg('published')] }))).toEqual(['publish_now']);
  });

  it('упал до публикации — повтор с этапа, новая сцена, новый текст при съёмке, отклонить', () => {
    expect(actionsFor(detail({ status: 'failed', failedFrom: 'rendering', capture: { answerText: 'x' } })))
      .toEqual(['retry', 'retry_directing', 'retry_writing', 'reject']);
    expect(actionsFor(detail({ status: 'failed', failedFrom: 'capturing' }))).toEqual(['retry', 'retry_directing', 'reject']);
    expect(actionsFor(detail({ status: 'failed', failedFrom: null }))).toEqual(['reject']);
  });

  it('упала публикация — «Повторить» и «Пост вышел» только у одобрявшегося; пост уже в канале — только «Повторить»', () => {
    const approvedAt = '2030-01-01T11:00:00.000Z';
    expect(actionsFor(detail({ status: 'failed', failedFrom: 'publishing', approvedAt }))).toEqual(['retry', 'mark_published', 'reject']);
    // Упал YouTube после вышедшего поста: «Пост вышел» перезаписал бы ссылку на настоящий пост, а отклонить вышедший нельзя.
    expect(actionsFor(detail({ status: 'failed', failedFrom: 'publishing', approvedAt, publications: [tg('published')] })))
      .toEqual(['retry']);
    expect(actionsFor(detail({ status: 'failed', failedFrom: 'publishing', approvedAt: null }))).toEqual(['reject']);
  });

  it('идея — запустить; в работе, публикуется, вышел, отклонён — ничего', () => {
    expect(actionsFor(detail({ status: 'idea' }))).toEqual(['start_now']);
    for (const status of (Object.keys(STATUS_TITLES) as ShortStatus[]).filter((s) => !['pending_review', 'approved', 'idea', 'failed'].includes(s))) expect(actionsFor(detail({ status }))).toEqual([]);
  });

  it('редкие ветки: этап без «Повторить», публикация без одобрения при «вышел», «вышел» без поста в канале', () => {
    expect(actionsFor(detail({ status: 'failed', failedFrom: 'animate_queued' }))).toEqual(['retry_directing', 'reject']);
    expect(actionsFor(detail({ status: 'failed', failedFrom: 'publishing', approvedAt: null, publications: [tg('published')] }))).toEqual([]);
    expect(actionsFor(detail({
      status: 'failed', failedFrom: 'publishing', approvedAt: '2030-01-01T11:00:00.000Z',
      publications: [{ platform: 'youtube', status: 'manual_pending', url: null, lastError: null }],
    }))).toEqual(['retry', 'mark_published']);
  });
});

describe('запросы и итоги', () => {
  const d = item({ title: 'Залог при аренде', version: 'V1' });

  it('решения по готовому ролику подписаны версией; одобрение и публикация — под замком', () => {
    expect(actionRequest('approve', d)).toEqual({ payload: { action: 'approve', id: 's1', version: 'V1' }, confirm: null, lock: true });
    expect(actionRequest('note', d, { text: '  короче  ' }).payload).toEqual({ action: 'note', id: 's1', version: 'V1', text: 'короче' });
    expect(actionRequest('redo', d).payload).toEqual({ action: 'redo', id: 's1', version: 'V1' });
    expect(actionRequest('reject', d).payload).toEqual({ action: 'reject', id: 's1', version: 'V1' });
    const pub = actionRequest('publish_now', d);
    expect(pub.payload).toEqual({ action: 'publish_now', id: 's1' });
    expect(pub.lock).toBe(true);
    expect(pub.confirm).toContain('Опубликовать ролик «Залог при аренде» сейчас?');
  });

  it('необратимое и тратящее Omni — с подтверждением, остальное — без', () => {
    for (const kind of ['redo', 'reject', 'publish_now', 'retry_directing', 'mark_published', 'start_now'] as const) {
      expect(actionRequest(kind, d).confirm).toBeTruthy();
    }
    for (const kind of ['approve', 'note', 'retry', 'retry_writing'] as const) {
      expect(actionRequest(kind, d).confirm).toBeNull();
    }
  });

  it('повтор — этап и необязательное замечание; ссылка на пост — без пробелов', () => {
    expect(actionRequest('retry', d, { note: '  ' }).payload).toEqual({ action: 'retry', id: 's1' });
    expect(actionRequest('retry_directing', d, { note: 'другой вопрос' }).payload)
      .toEqual({ action: 'retry', id: 's1', from: 'directing', note: 'другой вопрос' });
    expect(actionRequest('retry_writing', d).payload).toEqual({ action: 'retry', id: 's1', from: 'writing' });
    expect(actionRequest('mark_published', d, { url: ' https://t.me/ainomira/90 ' }).payload)
      .toEqual({ action: 'mark_published', id: 's1', url: 'https://t.me/ainomira/90' });
    expect(actionRequest('start_now', d).payload).toEqual({ action: 'start_now', id: 's1' });
  });

  it('итог словами; одобрение — когда выйдет', () => {
    expect(successText('approve', d, { slotAt: '2030-01-02T15:00:00.000Z' }, NOW)).toBe('Одобрено. Выйдет завтра в 18:00 МСК.');
    expect(successText('approve', d, null, NOW)).toBe('Одобрено.');
    expect(successText('retry', item({ failedFrom: 'publishing' }), null, NOW)).toBe('Публикация повторится в ближайшие 5 минут.');
    expect(successText('retry', item({ failedFrom: 'rendering' }), null, NOW)).toBe('Ролик снова в работе.');
  });

  it('ссылка на пост канала — как на бэке', () => {
    expect(isTelegramPostUrl('https://t.me/ainomira/90')).toBe(true);
    expect(isTelegramPostUrl('https://t.me/c/3046204962/90')).toBe(true);
    expect(isTelegramPostUrl('https://t.me/ainomira')).toBe(false);
    expect(isTelegramPostUrl('http://t.me/ainomira/90')).toBe(false);
    expect(isTelegramPostUrl('  https://t.me/ainomira/90  ')).toBe(true);
  });

  it('повтор упавшей публикации — подтверждение «сначала проверьте канал» и замок; пост уже в канале — без них', () => {
    const failedPub = item({ title: 'Залог при аренде', version: 'V1', status: 'failed', failedFrom: 'publishing' });
    const r = actionRequest('retry', failedPub);
    expect(r.confirm).toContain('Сначала проверьте канал');
    expect(r.lock).toBe(true);
    const out = actionRequest('retry', { ...failedPub, publications: [tg('published')] });
    expect(out.confirm).toBeNull();
    expect(out.lock).toBe(false);
    expect(actionRequest('reject', failedPub).confirm).toContain('Если пост всё-таки вышел в канал');
    expect(actionRequest('mark_published', failedPub, { url: ' https://t.me/ainomira/90 ' }).confirm).toContain('Ссылка: https://t.me/ainomira/90');
  });
});

describe('настройки', () => {
  const s: ShortSettings = {
    slotDays: [1, 2, 3, 4, 5, 6, 7], slotHourMsk: 18, prepareLeadHours: 24, minAnswerChars: 400,
    tgChannelChatId: '-1003046204962', platforms: ['telegram', 'youtube'], narratorVoice: 'alena', format: 'skit',
    maxOmniSeconds: 48, youtubeMode: 'unlisted',
  };

  it('черновик туда и обратно — те же значения, без режима YouTube', () => {
    expect(draftErrors(toDraft(s))).toEqual({});
    expect(draftToPatch(toDraft(s))).toEqual({
      slotDays: [1, 2, 3, 4, 5, 6, 7], slotHourMsk: 18, prepareLeadHours: 24, minAnswerChars: 400,
      tgChannelChatId: '-1003046204962', platforms: ['telegram', 'youtube'], narratorVoice: 'alena', format: 'skit',
      maxOmniSeconds: 48,
    });
  });

  it('пределы — как у бэка; пустой канал — null; площадки — в порядке Telegram, YouTube', () => {
    const bad = {
      ...toDraft(s), slotDays: [], slotHourMsk: '24', platforms: [], maxOmniSeconds: '7', narratorVoice: ' ',
      minAnswerChars: '99', prepareLeadHours: '0', tgChannelChatId: '@ainomira',
    };
    expect(Object.keys(draftErrors(bad)).sort()).toEqual([
      'maxOmniSeconds', 'minAnswerChars', 'narratorVoice', 'platforms', 'prepareLeadHours', 'slotDays', 'slotHourMsk', 'tgChannelChatId',
    ]);
    expect(draftErrors({ ...toDraft(s), slotHourMsk: '' }).slotHourMsk).toBeTruthy();
    expect(draftToPatch({ ...toDraft(s), tgChannelChatId: '  ' }).tgChannelChatId).toBeNull();
    expect(draftToPatch({ ...toDraft(s), platforms: ['youtube', 'telegram'] }).platforms).toEqual(['telegram', 'youtube']);
    expect(draftErrors({ ...toDraft(s), slotDays: [9] }).slotDays).toBeTruthy();
    expect(draftErrors({ ...toDraft(s), platforms: ['vk'] }).platforms).toBeTruthy();
  });
});
