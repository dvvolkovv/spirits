// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pendingDraft from './pendingDraft';
import {
  DRAFT_KEY,
  DRAFT_MAX_LENGTH,
  DRAFT_TTL_MS,
  PENDING_DRAFT_STORE_MAX,
  hasPendingDraftFor,
  savePendingDraft,
  takePendingDraftEntry,
  takePendingDraftFor,
} from './pendingDraft';

const NOW = 1_700_000_000_000;
const put = (value: unknown) => localStorage.setItem(DRAFT_KEY, JSON.stringify(value));

beforeEach(() => localStorage.clear());

describe('черновик сообщения со страницы linkeon.io', () => {

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

  it('битое, пустое и длиннее PENDING_DRAFT_STORE_MAX отбрасывается', () => {
    localStorage.setItem(DRAFT_KEY, '{oops');
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    put({ text: '   ', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    // Предел хранилища — PENDING_DRAFT_STORE_MAX (2000, I7), а не
    // DRAFT_MAX_LENGTH (600 — он только у захвата из #draft=/#ask=).
    put({ text: 'я'.repeat(PENDING_DRAFT_STORE_MAX + 1), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ровно PENDING_DRAFT_STORE_MAX символов принимается (I7)', () => {
    put({ text: 'я'.repeat(PENDING_DRAFT_STORE_MAX), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBe('я'.repeat(PENDING_DRAFT_STORE_MAX));
  });

  it('длиннее DRAFT_MAX_LENGTH (600), но в пределах PENDING_DRAFT_STORE_MAX — принимается (I7)', () => {
    // До I7 read() отбрасывал любую запись длиннее 600 — проба с полем на
    // 2000 символов не смогла бы дождаться входа черновиком длиннее этого.
    put({ text: 'я'.repeat(DRAFT_MAX_LENGTH + 1), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBe('я'.repeat(DRAFT_MAX_LENGTH + 1));
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

describe('savePendingDraft — явный результат', () => {
  afterEach(() => vi.restoreAllMocks());

  it('успешное сохранение возвращает true, trim и TTL ровно один час', () => {
    expect(savePendingDraft('  Вопрос  ', 12, NOW)).toBe(true);
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toEqual({
      text: 'Вопрос',
      assistant: '12',
      expires: NOW + 60 * 60 * 1000,
    });
  });

  it('пустой после trim текст возвращает false и не создаёт запись', () => {
    expect(savePendingDraft('   ', 12, NOW)).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ровно 2000 символов сохраняет, 2001 — отклоняет', () => {
    expect(savePendingDraft('я'.repeat(PENDING_DRAFT_STORE_MAX), 12, NOW)).toBe(true);
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).text).toHaveLength(PENDING_DRAFT_STORE_MAX);

    localStorage.clear();
    expect(savePendingDraft('я'.repeat(PENDING_DRAFT_STORE_MAX + 1), 12, NOW)).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('живой черновик другого ассистента возвращает false и остаётся нетронутым', () => {
    put({ text: 'Данные рождения', assistant: '14', expires: NOW + DRAFT_TTL_MS, auto: true });
    const before = localStorage.getItem(DRAFT_KEY);
    expect(savePendingDraft('Другой вопрос', 12, NOW)).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(before);
  });

  it('ошибка localStorage возвращает false', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(savePendingDraft('Вопрос', 12, NOW)).toBe(false);
  });
});

describe('forgetPendingDraftIfSent', () => {
  it('стирает черновик после точной и после дополненной отправки', () => {
    put({ text: 'Вопрос', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    pendingDraft.forgetPendingDraftIfSent(14, 'Вопрос', NOW);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    put({ text: '  Вопрос  ', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    pendingDraft.forgetPendingDraftIfSent('14', 'Сначала контекст. Вопрос Дополнение после.', NOW);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('черновик другого ассистента сохраняет', () => {
    put({ text: 'Вопрос', assistant: '14', expires: NOW + DRAFT_TTL_MS, auto: true });
    const before = localStorage.getItem(DRAFT_KEY);
    pendingDraft.forgetPendingDraftIfSent(12, 'Вопрос', NOW);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(before);
  });

  it('несовпавший текст не продлевает TTL и сохраняет auto', () => {
    const original = {
      text: 'Исходный вопрос',
      assistant: '14',
      expires: NOW + 10_000,
      auto: true,
    };
    put(original);
    const before = localStorage.getItem(DRAFT_KEY);
    pendingDraft.forgetPendingDraftIfSent(14, 'Совсем другой текст', NOW + 1_000);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(before);
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toEqual(original);
    expect(takePendingDraftEntry(14, NOW + 1_000)).toEqual({ text: original.text, auto: true });
  });

  it('просроченную запись стирает read даже без совпадения отправки', () => {
    put({ text: 'Вопрос', assistant: '14', expires: NOW, auto: true });
    pendingDraft.forgetPendingDraftIfSent(12, 'Другой текст', NOW);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe('pendingDraftMatches — read-only exact match', () => {
  it('совпадает только текст того же ассистента, без includes и без выдачи', () => {
    put({ text: 'Вопрос', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(pendingDraft.pendingDraftMatches(14, 'Вопрос', NOW)).toBe(true);
    expect(pendingDraft.pendingDraftMatches(14, 'Вопро', NOW)).toBe(false);
    expect(pendingDraft.pendingDraftMatches(14, 'Вопрос дополнение', NOW)).toBe(false);
    expect(pendingDraft.pendingDraftMatches(12, 'Вопрос', NOW)).toBe(false);
    expect(takePendingDraftFor(14, NOW)).toBe('Вопрос');
  });

  it('не продлевает TTL и не теряет auto при повторных проверках', () => {
    const original = { text: 'Вопрос', assistant: '14', expires: NOW + 10_000, auto: true };
    put(original);
    const before = localStorage.getItem(DRAFT_KEY);
    expect(pendingDraft.pendingDraftMatches(14, 'Вопрос', NOW + 1_000)).toBe(true);
    expect(pendingDraft.pendingDraftMatches(14, 'Вопрос', NOW + 2_000)).toBe(true);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(before);
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toEqual(original);
    expect(takePendingDraftEntry(14, NOW + 2_000)).toEqual({ text: 'Вопрос', auto: true });
  });
});
