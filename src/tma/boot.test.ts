// Ветвление бутстрапа (Task 9, main.tsx): три исхода определяют, что вообще
// увидит пользователь при открытии Mini App — приложение, экран выбора или
// «откройте через Telegram». decideBootState — чистая функция, deps в
// runBoot полностью инжектируемые моки, поэтому DOM не нужен: окружение
// остаётся 'node' (глобальное для репо).
import { describe, it, expect, vi } from 'vitest';
import { decideBootState, runBoot, BootDeps } from './boot';

describe('decideBootState', () => {
  it('вне Telegram — всегда outside, независимо от статуса tmaLogin', () => {
    expect(decideBootState(false, 'authenticated')).toBe('outside');
    expect(decideBootState(false, 'needsChoice')).toBe('outside');
    expect(decideBootState(false, undefined)).toBe('outside');
  });

  it('authenticated → authenticated', () => {
    expect(decideBootState(true, 'authenticated')).toBe('authenticated');
  });

  it('needsChoice → needsChoice (не authenticated!)', () => {
    expect(decideBootState(true, 'needsChoice')).toBe('needsChoice');
  });

  it('notInTelegram статус внутри Telegram трактуется как outside', () => {
    expect(decideBootState(true, 'notInTelegram')).toBe('outside');
  });
});

function makeDeps(overrides: Partial<BootDeps> = {}): BootDeps {
  return {
    applyTelegramTheme: vi.fn(),
    readyAndExpand: vi.fn(),
    isInsideTelegram: vi.fn().mockReturnValue(true),
    tmaLogin: vi.fn().mockResolvedValue({ status: 'authenticated' }),
    setReauthHandler: vi.fn(),
    ...overrides,
  };
}

describe('runBoot', () => {
  it('вне Telegram: тема и ready всё равно применяются, но вход не вызывается', async () => {
    const deps = makeDeps({ isInsideTelegram: vi.fn().mockReturnValue(false) });
    const state = await runBoot(deps);
    expect(state).toBe('outside');
    expect(deps.applyTelegramTheme).toHaveBeenCalledTimes(1);
    expect(deps.readyAndExpand).toHaveBeenCalledTimes(1);
    expect(deps.tmaLogin).not.toHaveBeenCalled();
    expect(deps.setReauthHandler).not.toHaveBeenCalled();
  });

  it('внутри Telegram: reauthHandler установлен ДО вызова tmaLogin', async () => {
    const order: string[] = [];
    const deps = makeDeps({
      setReauthHandler: vi.fn(() => { order.push('setReauthHandler'); }),
      tmaLogin: vi.fn().mockImplementation(async () => {
        order.push('tmaLogin');
        return { status: 'authenticated' };
      }),
    });
    await runBoot(deps);
    expect(order).toEqual(['setReauthHandler', 'tmaLogin']);
  });

  it('needsChoice приходит от tmaLogin как needsChoice, а не authenticated', async () => {
    const deps = makeDeps({ tmaLogin: vi.fn().mockResolvedValue({ status: 'needsChoice' }) });
    expect(await runBoot(deps)).toBe('needsChoice');
  });

  it('reauthHandler, переданный в setReauthHandler, сам зовёт tmaLogin() без аргументов и возвращает boolean', async () => {
    let captured: (() => Promise<boolean>) | null = null;
    const deps = makeDeps({
      setReauthHandler: vi.fn((h) => { captured = h; }),
    });
    await runBoot(deps);
    expect(captured).not.toBeNull();
    const result = await captured!();
    expect(result).toBe(true);
    // Второй вызов tmaLogin — из runBoot() самого входа, третий — из
    // reauthHandler, вызванного нами вручную выше.
    expect(deps.tmaLogin).toHaveBeenCalledTimes(2);
  });
});
