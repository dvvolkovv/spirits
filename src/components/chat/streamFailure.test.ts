import { describe, it, expect } from 'vitest';
import { shouldShowStreamError, needsActiveTurnProbe } from './streamFailure';

/**
 * Жалоба, из-за которой это появилось (17.09.2026, прод, мобильный веб):
 * человек пишет реплику, уходит в другое окно — и возвращается к пузырю
 * «Извините, произошла ошибка при обработке вашего сообщения», под которым
 * при этом спокойно лежит нормальный ответ ассистента.
 *
 * Механика: мобильный браузер усыпляет вкладку и рвёт живое соединение,
 * `reader.read()` падает сетевой ошибкой (не AbortError), и catch в
 * sendMessageToAI дописывал пузырь ошибки. Бэкенд при этом ход досчитывает и
 * пишет ответ в БД — поллинг истории поднимает его следом. Ошибки не было
 * никакой: оборвался транспорт, а не ход.
 */
describe('решение «показывать ли пузырь ошибки» после обрыва стрима', () => {
  it('запрос не дошёл до бэкенда — это настоящий сбой, пузырь нужен', () => {
    expect(shouldShowStreamError({
      responseStarted: false,
      receivedAnyEvent: false,
      turnActive: null,
    })).toBe(true);
  });

  it('стрим успел отдать события — ход живёт на сервере, пузыря быть не должно', () => {
    // Ровно случай из жалобы: ответ уже шёл, вкладка уснула, соединение порвалось.
    expect(shouldShowStreamError({
      responseStarted: true,
      receivedAnyEvent: true,
      turnActive: null,
    })).toBe(false);
  });

  it('событий не было, но бэкенд подтверждает живой ход — молчим', () => {
    expect(shouldShowStreamError({
      responseStarted: true,
      receivedAnyEvent: false,
      turnActive: true,
    })).toBe(false);
  });

  it('событий не было и бэкенд говорит «хода нет» — это падение, пузырь нужен', () => {
    expect(shouldShowStreamError({
      responseStarted: true,
      receivedAnyEvent: false,
      turnActive: false,
    })).toBe(true);
  });

  it('спросить бэкенд не удалось — сеть у нас, а не у него: пузыря нет', () => {
    // Запрос дошёл (responseStarted), значит ход запущен и досчитается.
    // Соврать «ошибка» тут хуже, чем промолчать: ответ придёт поллингом.
    expect(shouldShowStreamError({
      responseStarted: true,
      receivedAnyEvent: false,
      turnActive: null,
    })).toBe(false);
  });
});

describe('когда вообще платим запросом active-turn', () => {
  it('не платим, если запрос не дошёл: спрашивать не о чем', () => {
    expect(needsActiveTurnProbe({ responseStarted: false, receivedAnyEvent: false })).toBe(false);
  });

  it('не платим, если события шли: ход и так точно живой', () => {
    expect(needsActiveTurnProbe({ responseStarted: true, receivedAnyEvent: true })).toBe(false);
  });

  it('платим только в неоднозначном случае: ответ начался, событий нет', () => {
    expect(needsActiveTurnProbe({ responseStarted: true, receivedAnyEvent: false })).toBe(true);
  });
});
