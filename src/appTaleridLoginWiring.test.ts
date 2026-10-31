// src/appTaleridLoginWiring.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * m5 (ревью качества B9-fix, spec 2026-10-30-guest-trial): вход по Taler ID
 * (обмен кода + login(), теперь ещё до 5 с переноса пробы) идёт, пока на
 * экране проба или экран входа без всякого признака жизни. taleridLoginPending
 * держит true на время эффекта — AppContent рисует спиннер вместо
 * UnauthenticatedEntry, пока идёт обмен.
 *
 * Текстовый сторож по образцу guestTrialWiring.test.ts: App не тестируется
 * целиком (нужны Router/AuthProvider/виджеты и т.п.) — проверяем структуру
 * исходника. Маркеры среза проверены на уникальность в файле (grep) перед
 * написанием теста; каждый индекс явно проверен на -1, чтобы сломанный
 * маркер падал заметно, а не давал пустой/обрезанный срез, который по
 * случайности проходит .toContain().
 */
const SRC = readFileSync(join(__dirname, 'App.tsx'), 'utf8');

describe('App: Taler ID — индикатор во время входа', () => {
  it('флаг заводится и используется', () => {
    expect(SRC).toContain('taleridLoginPending');
    expect(SRC).toContain('setTaleridLoginPending');
  });

  it('true — до начала асинхронного обмена кода, false — в finally эффекта', () => {
    const startMarker = SRC.indexOf("const handoff = params.get('talerid_login');");
    const endMarker = SRC.indexOf('}, [login, t]);');
    expect(startMarker).toBeGreaterThan(-1);
    expect(endMarker).toBeGreaterThan(-1);
    expect(startMarker).toBeLessThan(endMarker);
    const effect = SRC.slice(startMarker, endMarker);

    const pendingTrueAt = effect.indexOf('setTaleridLoginPending(true)');
    const asyncIifeAt = effect.indexOf('(async () => {');
    expect(pendingTrueAt).toBeGreaterThan(-1);
    expect(asyncIifeAt).toBeGreaterThan(-1);
    // true — ДО старта асинхронной работы (обмен кода, login() с переносом
    // пробы): иначе спиннер не успеет появиться до первого await.
    expect(pendingTrueAt).toBeLessThan(asyncIifeAt);

    const finallyAt = effect.indexOf('finally {');
    const pendingFalseAt = effect.indexOf('setTaleridLoginPending(false)');
    expect(finallyAt).toBeGreaterThan(-1);
    expect(pendingFalseAt).toBeGreaterThan(-1);
    // false — ПОСЛЕ finally {: гасится на любом исходе (успех/отказ/сбой),
    // а не только на одной из веток return внутри try.
    expect(pendingFalseAt).toBeGreaterThan(finallyAt);
  });

  it('!isAuthenticated: taleridLoginPending проверяется раньше возврата UnauthenticatedEntry', () => {
    const branchAt = SRC.indexOf('if (!isAuthenticated) {');
    const uaAt = SRC.indexOf('<UnauthenticatedEntry />', branchAt);
    expect(branchAt).toBeGreaterThan(-1);
    expect(uaAt).toBeGreaterThan(-1);
    const branch = SRC.slice(branchAt, uaAt);
    expect(branch).toContain('taleridLoginPending');
  });
});
