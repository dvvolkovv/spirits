import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож на связку, которую чистые функции не ловят.
 *
 * Решение «пузырь или молчание» держится на двух признаках, и оба выставляются
 * не в streamFailure.ts, а по месту в цикле чтения стрима. Любой из них легко
 * потерять при рефакторинге — например, убрать `receivedAnyEvent = true` из
 * ветки разбора JSON, сочтя строку лишней. Тесты при этом останутся зелёными,
 * а на прод вернётся ровно та жалоба, ради которой всё делалось: пузырь
 * «произошла ошибка» на каждом сворачивании окна в мобильном браузере, а под
 * ним — нормальный ответ ассистента.
 */

const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

/** Тело sendMessageToAI — от объявления до cleanup-эффекта следом за ним. */
function sendMessageToAI(): string {
  const from = SRC.indexOf('const sendMessageToAI = async');
  expect(from).toBeGreaterThan(-1);
  const to = SRC.indexOf('// Cleanup on unmount', from);
  expect(to).toBeGreaterThan(from);
  return SRC.slice(from, to);
}

describe('признаки обрыва в sendMessageToAI', () => {
  it('объявлены ДО try: в catch нужны оба', () => {
    const body = sendMessageToAI();
    const decl = body.indexOf('let responseStarted = false;');
    const tryAt = body.indexOf('await apiClient.post(\'/webhook/soulmate/chat\'');
    expect(decl).toBeGreaterThan(-1);
    expect(body).toContain('let receivedAnyEvent = false;');
    expect(decl).toBeLessThan(tryAt);
  });

  it('responseStarted поднимается после получения тела ответа', () => {
    // Раньше этой точки обрыв означает «запрос не дошёл» — там пузырь уместен.
    const body = sendMessageToAI();
    const reader = body.indexOf('No response body reader available');
    const flag = body.indexOf('responseStarted = true;');
    expect(flag).toBeGreaterThan(reader);
  });

  it('receivedAnyEvent поднимается на любом разобранном событии стрима', () => {
    // Именно «любое», а не только item: begin и ping тоже доказывают, что ход идёт.
    const body = sendMessageToAI();
    const parse = body.indexOf('const data = JSON.parse(line);');
    const flag = body.indexOf('receivedAnyEvent = true;');
    const firstBranch = body.indexOf("if (data.type === 'begin'", parse);
    expect(flag).toBeGreaterThan(parse);
    expect(flag).toBeLessThan(firstBranch);
  });
});

describe('разбор обрыва в catch', () => {
  it('решение принимает shouldShowStreamError, а не безусловный push', () => {
    const body = sendMessageToAI();
    const decide = body.indexOf('shouldShowStreamError(');
    const bubble = body.indexOf("t('chat.ai_error_fallback')");
    expect(decide).toBeGreaterThan(-1);
    expect(decide).toBeLessThan(bubble);
  });

  it('при живом ходе выходим ДО пузыря — именно return \'error\', а не no_tokens', () => {
    const body = sendMessageToAI();
    const guard = body.slice(body.indexOf('if (!shouldShowStreamError('), body.indexOf("t('chat.ai_error_fallback')"));
    // sendMessageToAI с 03.11 сообщает исход вызывающему (C1, ревью Ф1) тремя
    // состояниями: обрыв транспорта при живом на сервере ходе — 'error' (до
    // 03.11 было 'ok', но I-1 повторного ревью разделил успех и сбой: 'ok'
    // теперь только при реально завершённом ходе, иначе ветка текстового
    // файла снимала черновик при ошибке стрима), а НЕ 'no_tokens' — иначе
    // ChatInterface принял бы временный сбой сети за отказ по балансу и
    // дёрнул бы восстановление текста/черновика (повторное ревью 03.11:
    // голый /\breturn\b/ пропускал return 'no_tokens').
    expect(guard).toContain("return 'error';");
  });

  it('при живом ходе поднимаем признак «идёт удалённый ход»', () => {
    // Иначе человек остаётся в тишине и дошлёт реплику, а релей пре-эмптит
    // процесс на том же sessionId — и этим убьёт собственный ответ.
    const body = sendMessageToAI();
    const guard = body.slice(body.indexOf('if (!shouldShowStreamError('), body.indexOf("t('chat.ai_error_fallback')"));
    expect(guard).toContain('applyRemoteTurn(true)');
  });

  it('active-turn спрашиваем только через needsActiveTurnProbe', () => {
    const body = sendMessageToAI();
    const probe = body.indexOf('needsActiveTurnProbe(');
    const request = body.indexOf('/webhook/chat/active-turn', probe);
    expect(probe).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(probe);
  });

  it('AbortError (вкладка свёрнута/перезагрузка) — тоже return \'error\', а не no_tokens', () => {
    // Повторное ревью 03.11: эта ветка (сворачивание вкладки/навигация прочь
    // прерывает fetch) не была накрыта НИ ОДНИМ тестом в этом файле — только
    // «живой ход» выше. Без явной проверки правка вида `return 'no_tokens';`
    // здесь прошла бы незамеченной и заставила бы ChatInterface читать обычное
    // сворачивание вкладки как отказ по балансу. Исход третьим состоянием
    // 'error' (I-1): 'ok' теперь значит «ход завершился», и сворачивание
    // вкладки успехом не является.
    const body = sendMessageToAI();
    const at = body.indexOf("error.name === 'AbortError'");
    const to = body.indexOf("console.error('Error sending message to AI:'");
    expect(at).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(at);
    expect(body.slice(at, to)).toContain("return 'error';");
  });
});
