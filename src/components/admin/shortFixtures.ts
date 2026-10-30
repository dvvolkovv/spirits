import type { ShortDetail, ShortItem } from './shortStatus';

/** Образцы роликов для тестов экрана «Ролики» — общие у тестов правил и карточки. */
export const item = (over: Partial<ShortItem> = {}): ShortItem => ({
  id: 's1', rubric: 'assistant', angle: 'roast', angleLocked: false, source: 'catalog', topicKey: 'catalog:2030-W01:1',
  topicHint: 'Залог при аренде', title: null, assistantId: 10, format: 'skit',
  scene: { assistantName: 'Алексей' }, status: 'pending_review', slotAt: null, approvedAt: null, failedFrom: null,
  lastError: null, attempts: 0, ownerNote: null, durationMs: null, publishedAt: null,
  createdAt: '2030-01-01T10:00:00.000Z', updatedAt: '2030-01-01T10:00:00.000Z', version: '2030-01-01 10:00:00.123456+00',
  publications: [], ...over,
});

export const detail = (over: Partial<ShortDetail> = {}): ShortDetail => ({
  ...item(), capture: null, script: null, captions: null, animation: null, videoUrl: null, coverUrl: null, ...over,
});

/** Вторник, 1 января 2030, 12:00 МСК. */
export const NOW = new Date('2030-01-01T09:00:00.000Z');
