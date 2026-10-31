// src/contexts/guestTrialWiring.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Проводка пробы без входа в AuthContext (spec 2026-10-30-guest-trial):
 * перенос — ДО setUser, иначе чат откроется и загрузит историю без пробы.
 *
 * Маркеры (ревью качества B9-fix, m13):
 * - Каждый indexOf, использованный для СРЕЗА или для сравнения позиций,
 *   проверен на -1 явно: сломанный маркер иначе даёт пустой/обрезанный срез
 *   или сравнение с -1, которое может пройти по случайности, а не честную
 *   проверку порядка вызовов.
 * - Искомые строки — КОД (вызов с его синтаксисом: скобки, точка с
 *   запятой), а не голое имя функции: комментарий, где вызов упомянут
 *   словами, не должен давать ложное совпадение.
 * - Конец среза initAuth — устойчивый маркер окончания ИМЕННО этого
 *   useEffect (закрытие с его уникальными deps), а не literal-вызов
 *   initAuth(): тот текст — не единственное гарантированно уникальное место
 *   в файле для этой цели и легко случайно повторяется в прозе рядом.
 */
const SRC = readFileSync(join(__dirname, 'AuthContext.tsx'), 'utf8');

describe('AuthContext: проба без входа', () => {
  it('вход (login): отметка устройства и перенос пробы — до setUser(newUser)', () => {
    const loginStart = SRC.indexOf('const login = useCallback');
    const loginEnd = SRC.indexOf('const logout');
    expect(loginStart).toBeGreaterThan(-1);
    expect(loginEnd).toBeGreaterThan(-1);
    expect(loginStart).toBeLessThan(loginEnd);
    const login = SRC.slice(loginStart, loginEnd);

    const markAt = login.indexOf('markHasAccount();');
    // m7: перенос — параллельно с балансом, одним Promise.all. Маркер —
    // КОД этой пары вместе, не голое имя claimPendingGuestTrial: комментарий,
    // где «перенос» и «токены» просто упомянуты рядом, не даёт совпадения.
    const claimAt = login.indexOf('Promise.all([claimPendingGuestTrial(), fetchUserTokens()])');
    const setUserAt = login.indexOf('setUser(newUser)');
    expect(markAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(-1);
    expect(setUserAt).toBeGreaterThan(-1);

    // m6/m7: отметка устройства — до запуска переноса; перенос (ожидание
    // его результата через Promise.all) — до setUser.
    expect(markAt).toBeLessThan(claimAt);
    expect(claimAt).toBeLessThan(setUserAt);
  });

  it('восстановление сессии (initAuth): отмечает устройство сразу и добирает перенос до setUser(parsedUser)', () => {
    const initStart = SRC.indexOf('const initAuth = async');
    const initEnd = SRC.indexOf('}, [fetchUserTokens]);');
    expect(initStart).toBeGreaterThan(-1);
    expect(initEnd).toBeGreaterThan(-1);
    expect(initStart).toBeLessThan(initEnd);
    const init = SRC.slice(initStart, initEnd);

    const markAt = init.indexOf('markHasAccount();');
    const claimAssignAt = init.indexOf('const claim = claimPendingGuestTrial();');
    const claimAwaitAt = init.indexOf('await claim;');
    const setUserAt = init.indexOf('setUser(parsedUser);');
    expect(markAt).toBeGreaterThan(-1);
    expect(claimAssignAt).toBeGreaterThan(-1);
    expect(claimAwaitAt).toBeGreaterThan(-1);
    expect(setUserAt).toBeGreaterThan(-1);

    // m6: отметка — сразу, как прочитаны authToken/userData (т.е. раньше
    // запуска переноса, который и так не раньше этого места).
    expect(markAt).toBeLessThan(claimAssignAt);
    // I2: перенос ЗАПУЩЕН параллельно с балансом токенов (claimAssignAt),
    // но его результат дождались (claimAwaitAt) ДО setUser — иначе чат
    // откроет историю без только что перенесённой пробы.
    expect(claimAssignAt).toBeLessThan(claimAwaitAt);
    expect(claimAwaitAt).toBeLessThan(setUserAt);
  });
});
