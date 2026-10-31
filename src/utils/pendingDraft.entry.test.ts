// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAFT_TTL_MS,
  PENDING_DRAFT_STORE_MAX,
  savePendingDraft,
  takePendingDraftEntry,
  takePendingDraftFor,
} from './pendingDraft';

beforeEach(() => localStorage.clear());

describe('черновик пробы', () => {
  it('сохранённый пробой — подставляется после входа один раз и без пометки', () => {
    savePendingDraft('  Вопрос  ', 12);
    expect(takePendingDraftEntry(13)).toBeNull();
    expect(takePendingDraftEntry(12)).toEqual({ text: 'Вопрос', auto: false });
    expect(takePendingDraftEntry(12)).toBeNull();
  });

  it('пустой и длиннее PENDING_DRAFT_STORE_MAX — не сохраняется', () => {
    savePendingDraft('   ', 12);
    savePendingDraft('я'.repeat(PENDING_DRAFT_STORE_MAX + 1), 12);
    expect(localStorage.getItem('pending_draft')).toBeNull();
  });

  // I7 (ревью качества B8): поле пробы принимает до config.maxChars (в кабинете
  // это может быть больше 600) — черновик длиннее DRAFT_MAX_LENGTH (600, предел
  // ТОЛЬКО у захвата из #draft=/#ask=) должен сохраняться и доходить до входа.
  it('черновик пробы длиннее 600 символов — сохраняется и отдаётся (I7)', () => {
    const long = 'Вопрос про цены. '.repeat(100).slice(0, 1500);
    savePendingDraft(long, 12);
    expect(takePendingDraftFor(12)).toBe(long);
  });
});

describe('savePendingDraft не трогает чужой живой черновик', () => {
  it('живой черновик другого ассистента остаётся', () => {
    savePendingDraft('Данные рождения', 14);
    savePendingDraft('Привет', 12);
    expect(takePendingDraftEntry(12)).toBeNull();
    expect(takePendingDraftEntry(14)).toEqual({ text: 'Данные рождения', auto: false });
  });

  it('свой черновик (тот же ассистент) — заменяется', () => {
    savePendingDraft('Первый вопрос', 12);
    savePendingDraft('Второй вопрос', 12);
    expect(takePendingDraftEntry(12)).toEqual({ text: 'Второй вопрос', auto: false });
  });

  it('просроченный черновик другого ассистента — заменяется', () => {
    const now = Date.now();
    savePendingDraft('Старое', 14, now - DRAFT_TTL_MS - 1000);
    savePendingDraft('Новое', 12, now);
    expect(takePendingDraftEntry(12, now)).toEqual({ text: 'Новое', auto: false });
  });
});
