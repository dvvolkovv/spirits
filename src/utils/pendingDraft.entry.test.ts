// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_MAX_LENGTH, DRAFT_TTL_MS, savePendingDraft, takePendingDraftEntry } from './pendingDraft';

beforeEach(() => localStorage.clear());

describe('черновик пробы', () => {
  it('сохранённый пробой — подставляется после входа один раз и без пометки', () => {
    savePendingDraft('  Вопрос  ', 12);
    expect(takePendingDraftEntry(13)).toBeNull();
    expect(takePendingDraftEntry(12)).toEqual({ text: 'Вопрос', auto: false });
    expect(takePendingDraftEntry(12)).toBeNull();
  });

  it('пустой и длиннее предела — не сохраняется', () => {
    savePendingDraft('   ', 12);
    savePendingDraft('я'.repeat(DRAFT_MAX_LENGTH + 1), 12);
    expect(localStorage.getItem('pending_draft')).toBeNull();
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
