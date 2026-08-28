// Экран первого выбора — единственная воронка для нового Mini-App пользователя,
// и единственное место, где ошибка порядка операций молча портит баланс
// (см. комментарий в choiceFlow.ts). Мокаем всё, что вызывает choiceFlow —
// это модульный тест решений, а не интеграционный, поэтому окружение
// остаётся 'node' (глобальное для репо), DOM не нужен: tokenManager и
// authService полностью замоканы, реальный localStorage не участвует.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('./tmaAuth', () => ({
  tmaLogin: vi.fn(),
  tmaLinkExisting: vi.fn(),
}));
vi.mock('../services/authService', () => ({
  authService: {
    verifyCode: vi.fn(),
    requestSMSCode: vi.fn(),
  },
}));
vi.mock('../utils/tokenManager', () => ({
  tokenManager: {
    clearTokens: vi.fn(),
    getAccessToken: vi.fn(),
  },
}));

import { tmaLogin, tmaLinkExisting } from './tmaAuth';
import { authService } from '../services/authService';
import { tokenManager } from '../utils/tokenManager';
import { runStart, runSendCode, runConfirmLink } from './choiceFlow';

beforeEach(() => {
  vi.clearAllMocks();
  // По умолчанию — как будто verifyCode уже сохранил токен (обычный путь).
  // Тест на «токена нет» ниже переопределяет это явно на null.
  (tokenManager.getAccessToken as any).mockReturnValue('tok_from_verify_code');
});

describe('runStart', () => {
  it('вызывает tmaLogin с intent signup', async () => {
    (tmaLogin as any).mockResolvedValue({ status: 'authenticated' });
    await runStart();
    expect(tmaLogin).toHaveBeenCalledWith({ intent: 'signup' });
  });

  it('ok=true при статусе authenticated', async () => {
    (tmaLogin as any).mockResolvedValue({ status: 'authenticated' });
    expect(await runStart()).toEqual({ ok: true });
  });

  it('ok=false при любом другом статусе', async () => {
    (tmaLogin as any).mockResolvedValue({ status: 'notInTelegram' });
    expect(await runStart()).toEqual({ ok: false });
  });
});

describe('runSendCode', () => {
  it('прокидывает телефон в authService.requestSMSCode', async () => {
    (authService.requestSMSCode as any).mockResolvedValue({ success: true });
    await runSendCode('+79991234567');
    expect(authService.requestSMSCode).toHaveBeenCalledWith('+79991234567');
  });

  it('ok=false, если SMS не отправилась', async () => {
    (authService.requestSMSCode as any).mockResolvedValue({ success: false, message: 'blocked' });
    expect(await runSendCode('123')).toEqual({ ok: false });
  });
});

describe('runConfirmLink — порядок вход-потом-привязка', () => {
  it('вызывает verifyCode ДО tmaLinkExisting', async () => {
    const order: string[] = [];
    (authService.verifyCode as any).mockImplementation(async () => {
      order.push('verifyCode');
      return { success: true };
    });
    (tmaLinkExisting as any).mockImplementation(async () => {
      order.push('tmaLinkExisting');
      return { status: 'ok' };
    });

    await runConfirmLink('79991234567', '1234');

    expect(order).toEqual(['verifyCode', 'tmaLinkExisting']);
  });

  it('передаёт phone и code в verifyCode', async () => {
    (authService.verifyCode as any).mockResolvedValue({ success: true });
    (tmaLinkExisting as any).mockResolvedValue({ status: 'ok' });
    await runConfirmLink('79991234567', '4321');
    expect(authService.verifyCode).toHaveBeenCalledWith('79991234567', '4321');
  });

  it('неверный код: tmaLinkExisting не вызывается вовсе', async () => {
    (authService.verifyCode as any).mockResolvedValue({ success: false, error: 'Wrong code' });
    const r = await runConfirmLink('79991234567', '0000');
    expect(r).toEqual({ status: 'wrongCode' });
    expect(tmaLinkExisting).not.toHaveBeenCalled();
  });

  it('verifyCode вернул success:true, но токена в tokenManager нет (легаси-ветка text/plain "Confirmed" без JWT): tmaLinkExisting НЕ вызывается, результат — failed', async () => {
    // Пин на латентный путь: authService.verifyCode может в теории вернуть
    // success:true, не сохранив токен (см. комментарий в choiceFlow.ts). Без
    // явной проверки tmaLinkExisting() ушёл бы с тем токеном, что случайно
    // лежит в сторадже (чужим или отсутствующим) — привязка чужого Telegram
    // к чужому аккаунту, ровно тот баг, который весь этот флоу предотвращает.
    (authService.verifyCode as any).mockResolvedValue({ success: true });
    (tokenManager.getAccessToken as any).mockReturnValue(null);

    const r = await runConfirmLink('79991234567', '1234');

    expect(tmaLinkExisting).not.toHaveBeenCalled();
    expect(r).toEqual({ status: 'failed' });
  });

  it('успешный вход + успешная привязка: status ok, токены НЕ гасятся', async () => {
    (authService.verifyCode as any).mockResolvedValue({ success: true });
    (tmaLinkExisting as any).mockResolvedValue({ status: 'ok' });
    const r = await runConfirmLink('79991234567', '1234');
    expect(r).toEqual({ status: 'ok' });
    expect(tokenManager.clearTokens).not.toHaveBeenCalled();
  });

  it('конфликт привязки: status conflict, токены от SMS-шага гасятся, пользователь не остаётся залогинен в чужой аккаунт', async () => {
    (authService.verifyCode as any).mockResolvedValue({ success: true });
    (tmaLinkExisting as any).mockResolvedValue({ status: 'conflict' });
    const r = await runConfirmLink('79991234567', '1234');
    expect(r).toEqual({ status: 'conflict' });
    expect(tokenManager.clearTokens).toHaveBeenCalledTimes(1);
  });

  it('прочий сбой привязки: status failed, токены тоже гасятся', async () => {
    (authService.verifyCode as any).mockResolvedValue({ success: true });
    (tmaLinkExisting as any).mockResolvedValue({ status: 'failed' });
    const r = await runConfirmLink('79991234567', '1234');
    expect(r).toEqual({ status: 'failed' });
    expect(tokenManager.clearTokens).toHaveBeenCalledTimes(1);
  });
});

describe('choiceFlow.ts не содержит ничего похожего на merge', () => {
  it('статическая проверка исходника: ни один путь не зовёт merge-функцию', () => {
    // Не юнит-тест поведения, а страховка от регрессии текстом: слияние
    // аккаунтов (mergeAccounts на бэке) уничтожает баланс, если его позвать
    // из этого файла в любом порядке. Проверяем сам код, а не рантайм-мок,
    // потому что мок можно случайно завести под именем 'merge' и не заметить,
    // что реальный источник его больше не вызывает — а можно наоборот добавить
    // вызов, для которого ни один существующий тест поведения не упадёт, если
    // он просто идёт "вдобавок" к правильной последовательности.
    const path = fileURLToPath(new URL('./choiceFlow.ts', import.meta.url));
    const src = readFileSync(path, 'utf8');
    const codeOnly = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/**'))
      .join('\n');
    expect(codeOnly.toLowerCase()).not.toMatch(/merge/);
  });
});
