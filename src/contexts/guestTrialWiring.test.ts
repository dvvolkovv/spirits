import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Проводка пробы без входа в AuthContext (spec 2026-10-30-guest-trial):
 * перенос — ДО setUser, иначе чат откроется и загрузит историю без пробы.
 */
const SRC = readFileSync(join(__dirname, 'AuthContext.tsx'), 'utf8');

describe('AuthContext: проба без входа', () => {
  it('вход: отметка устройства и перенос пробы — до setUser(newUser)', () => {
    const login = SRC.slice(SRC.indexOf('const login = useCallback'), SRC.indexOf('const logout'));
    const claimAt = login.indexOf('await claimPendingGuestTrial()');
    expect(login).toContain('markHasAccount()');
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(login.indexOf('setUser(newUser)'));
  });

  it('восстановление сессии тоже отмечает устройство и добирает перенос', () => {
    const init = SRC.slice(SRC.indexOf('const initAuth = async'), SRC.indexOf('initAuth();'));
    expect(init).toContain('markHasAccount()');
    expect(init).toContain('claimPendingGuestTrial()');
  });
});
