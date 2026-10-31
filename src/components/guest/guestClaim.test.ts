// src/components/guest/guestClaim.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./guestApi', () => ({ claimGuestTrial: vi.fn() }));
import { claimGuestTrial } from './guestApi';
import { claimPendingGuestTrial } from './guestClaim';
import { readTrial, saveTrial } from './guestStorage';

const claim = claimGuestTrial as unknown as ReturnType<typeof vi.fn>;
const TOKEN = 'T'.repeat(43);

beforeEach(() => {
  localStorage.clear();
  claim.mockReset();
  saveTrial({ token: TOKEN, assistantId: '14' });
});

describe('перенос пробы при входе', () => {
  it('перенесено — ключ забыт, кабинет откроет ассистента', async () => {
    claim.mockResolvedValue({ status: 'claimed', assistantId: '14' });
    await claimPendingGuestTrial();
    expect(claim).toHaveBeenCalledWith(TOKEN);
    expect(readTrial()).toBeNull();
    expect(JSON.parse(localStorage.getItem('pending_assistant') ?? 'null')?.value).toBe('14');
  });

  it('пробы нет — ключ забыт', async () => {
    claim.mockResolvedValue({ status: 'gone' });
    await claimPendingGuestTrial();
    expect(readTrial()).toBeNull();
  });

  it('сбой и таймаут — ключ остаётся для следующей попытки', async () => {
    claim.mockResolvedValue({ status: 'retry' });
    await claimPendingGuestTrial();
    expect(readTrial()).not.toBeNull();
    claim.mockImplementation(() => new Promise(() => {}));
    await claimPendingGuestTrial(20);
    expect(readTrial()).not.toBeNull();
  });

  it('без пробы — ни одного запроса', async () => {
    localStorage.clear();
    await claimPendingGuestTrial();
    expect(claim).not.toHaveBeenCalled();
  });
});
