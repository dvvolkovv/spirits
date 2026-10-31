// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_MAX_LENGTH, savePendingDraft, takePendingDraftEntry } from './pendingDraft';

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
