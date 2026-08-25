// Ветвление бутстрапа (Task 9, main.tsx): четыре исхода определяют, что
// увидит пользователь при открытии Mini App — приложение, экран выбора,
// «откройте через Telegram» или «повторить» при сбое сети. decideBootState —
// чистая функция, deps в runBoot полностью инжектируемые моки, поэтому DOM
// не нужен: окружение остаётся 'node' (глобальное для репо).
import { describe, it, expect, vi } from 'vitest';
import { decideBootState, runBoot, retryLogin, BootDeps } from './boot';

describe('decideBootState', () => {
  it('вне Telegram — всегда outside, независимо от статуса tmaLogin', () => {
    expect(decideBootState(false, 'authenticated')).toBe('outside');
    expect(decideBootState(false, 'needsChoice')).toBe('outside');
    expect(decideBootState(false, undefined)).toBe('outside');
    // Даже если бы tmaLogin сообщил notInTelegram — снаружи это всё равно
    // просто outside, а не retry (retry имеет смысл только когда человек
    // реально внутри Telegram).
    expect(decideBootState(false, 'notInTelegram')).toBe('outside');
  });

  it('authenticated → authenticated', () => {
    expect(decideBootState(true, 'authenticated')).toBe('authenticated');
  });

  it('needsChoice → needsChoice (не authenticated!)', () => {
    expect(decideBootState(true, 'needsChoice')).toBe('needsChoice');
  });

  it('внутри Telegram + сбой входа (notInTelegram статус от tmaLogin — сеть/таймаут) → retry, НЕ outside', () => {
    // Это и есть исправление дизайн-ошибки: человека внутри Telegram с
    // упавшим/протухшим по таймауту запросом больше не отправляют читать
    // совет «откройте через Telegram», в котором он и так сидит.
    expect(decideBootState(true, 'notInTelegram')).toBe('retry');
  });

  it('outside и retry — разные состояния, не синонимы', () => {
    // Явная проверка на «схлопывание». Если кто-то в будущем сведёт их
    // обратно к одному значению, этот тест — первый, что упадёт.
    expect(decideBootState(true, 'notInTelegram')).not.toBe(decideBootState(false, 'notInTelegram'));
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

  it('внутри Telegram + tmaLogin упал по сети/таймауту (notInTelegram) → runBoot возвращает retry, а не outside', async () => {
    const deps = makeDeps({ tmaLogin: vi.fn().mockResolvedValue({ status: 'notInTelegram' }) });
    expect(await runBoot(deps)).toBe('retry');
  });
});

describe('retryLogin', () => {
  it('успех: повторный tmaLogin() возвращает authenticated → retryLogin переводит в authenticated', async () => {
    const tmaLoginFn = vi.fn().mockResolvedValue({ status: 'authenticated' });
    expect(await retryLogin(tmaLoginFn)).toBe('authenticated');
    expect(tmaLoginFn).toHaveBeenCalledTimes(1);
    // Без аргументов — как обычный вызов из ChoiceScreen/reauthHandler.
    expect(tmaLoginFn).toHaveBeenCalledWith();
  });

  it('снова сбой сети: остаёмся в retry, а не откатываемся в outside', async () => {
    const tmaLoginFn = vi.fn().mockResolvedValue({ status: 'notInTelegram' });
    expect(await retryLogin(tmaLoginFn)).toBe('retry');
  });

  it('needsChoice тоже долетает как есть (человек оказался незнакомым Telegram)', async () => {
    const tmaLoginFn = vi.fn().mockResolvedValue({ status: 'needsChoice' });
    expect(await retryLogin(tmaLoginFn)).toBe('needsChoice');
  });
});
