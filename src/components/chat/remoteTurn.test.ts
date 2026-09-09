import { describe, it, expect } from 'vitest';
import {
  localTurnBusy,
  turnRunningAnywhere,
  needsFreshRemoteCheck,
  shouldOfferOverride,
  REMOTE_STUCK_MS,
} from './remoteTurn';

const T0 = 1_757_000_000_000;

describe('localTurnBusy — гейт поллинга истории', () => {
  it('истина, пока стрим идёт в этой вкладке', () => {
    expect(localTurnBusy({ isTyping: true, queuedCount: 0 })).toBe(true);
  });

  it('истина, пока есть что дослать: в окне между стримом и досылкой поллинг задваивал ход', () => {
    expect(localTurnBusy({ isTyping: false, queuedCount: 2 })).toBe(true);
  });

  it('ложь, когда эта вкладка свободна', () => {
    expect(localTurnBusy({ isTyping: false, queuedCount: 0 })).toBe(false);
  });
});

describe('turnRunningAnywhere — решение «слать или копить»', () => {
  it('удалённый ход блокирует отправку: иначе релей убьёт чужой ответ', () => {
    expect(turnRunningAnywhere({ isTyping: false, queuedCount: 0, remoteTurnActive: true })).toBe(true);
  });

  it('РЕГРЕССИЯ: удалённый ход НЕ протекает в гейт поллинга истории', () => {
    // Иначе поллинг выключится ровно тогда, когда он и нужен — чтобы подобрать
    // чужой ответ из БД, — и человек не увидит ответа до перезагрузки.
    const s = { isTyping: false, queuedCount: 0, remoteTurnActive: true };
    expect(turnRunningAnywhere(s)).toBe(true);
    expect(localTurnBusy(s)).toBe(false);
  });

  it('тишина везде — отправляем сразу', () => {
    expect(turnRunningAnywhere({ isTyping: false, queuedCount: 0, remoteTurnActive: false })).toBe(false);
  });
});

describe('needsFreshRemoteCheck — стоит ли спрашивать бэкенд перед отправкой', () => {
  it('после F5 знания нет вообще — спрашиваем', () => {
    expect(needsFreshRemoteCheck(null, T0)).toBe(true);
  });

  it('только что опросили — верим и не платим лишним запросом', () => {
    expect(needsFreshRemoteCheck(T0 - 1000, T0)).toBe(false);
  });

  it('знание протухло — спрашиваем заново', () => {
    expect(needsFreshRemoteCheck(T0 - 9000, T0)).toBe(true);
  });

  it('граница интервала опроса: ровно 6с уже считается протухшим', () => {
    expect(needsFreshRemoteCheck(T0 - 6000, T0)).toBe(true);
    expect(needsFreshRemoteCheck(T0 - 5999, T0)).toBe(false);
  });
});

describe('shouldOfferOverride — предохранитель от залипшего флага', () => {
  it('обычное ожидание кнопку не показывает', () => {
    expect(shouldOfferOverride(true, T0 - 30_000, T0)).toBe(false);
  });

  it('флаг держится дольше порога — предлагаем обойти', () => {
    expect(shouldOfferOverride(true, T0 - REMOTE_STUCK_MS - 1, T0)).toBe(true);
  });

  it('флага нет — предлагать нечего', () => {
    expect(shouldOfferOverride(false, T0 - 10 * 60_000, T0)).toBe(false);
  });

  it('момент начала неизвестен — не предлагаем, чтобы не подтолкнуть рвать живой ход', () => {
    expect(shouldOfferOverride(true, null, T0)).toBe(false);
  });

  it('ВАЖНО: двадцатиминутный ход юриста сам собой не разблокируется — только рукой человека', () => {
    // Автоснятие по таймеру убивало бы самые дорогие ходы. Функция лишь
    // ПОКАЗЫВАЕТ кнопку; решение остаётся за человеком.
    const черезДвадцатьМинут = T0 + 20 * 60_000;
    expect(shouldOfferOverride(true, T0, черезДвадцатьМинут)).toBe(true);
    expect(turnRunningAnywhere({ isTyping: false, queuedCount: 1, remoteTurnActive: true })).toBe(true);
  });
});
