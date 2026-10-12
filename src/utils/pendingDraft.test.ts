// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_KEY, DRAFT_MAX_LENGTH, DRAFT_TTL_MS, hasPendingDraftFor, takePendingDraftFor } from './pendingDraft';

const NOW = 1_700_000_000_000;
const put = (value: unknown) => localStorage.setItem(DRAFT_KEY, JSON.stringify(value));

describe('черновик сообщения со страницы linkeon.io', () => {
  beforeEach(() => localStorage.clear());

  it('отдаётся своему ассистенту один раз', () => {
    put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBe('Райя, привет!');
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('чужому ассистенту — не отдаётся и не стирается', () => {
    put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(12, NOW)).toBeNull();
    expect(takePendingDraftFor('14', NOW)).toBe('Райя, привет!');
  });

  it('через час забывается', () => {
    put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW + DRAFT_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('битое, пустое и длинное отбрасывается', () => {
    localStorage.setItem(DRAFT_KEY, '{oops');
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    put({ text: '   ', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    put({ text: 'я'.repeat(DRAFT_MAX_LENGTH + 1), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ровно DRAFT_MAX_LENGTH символов принимается', () => {
    put({ text: 'я'.repeat(DRAFT_MAX_LENGTH), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBe('я'.repeat(DRAFT_MAX_LENGTH));
  });

  describe('hasPendingDraftFor — проверка без выдачи', () => {
    it('своему ассистенту: true, и запись остаётся на месте', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      expect(hasPendingDraftFor(14, NOW)).toBe(true);
      // Не выдана и не стёрта — takePendingDraftFor потом всё ещё отдаёт её.
      expect(takePendingDraftFor(14, NOW)).toBe('Райя, привет!');
    });

    it('чужому ассистенту: false', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      expect(hasPendingDraftFor(12, NOW)).toBe(false);
    });

    it('просроченной записи: false, и запись стёрта', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      expect(hasPendingDraftFor(14, NOW + DRAFT_TTL_MS + 1)).toBe(false);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
  });
});
