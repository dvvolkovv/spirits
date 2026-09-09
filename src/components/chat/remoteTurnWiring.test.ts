import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож на связку, которую чистые функции не ловят.
 *
 * Признак «идёт удалённый ход» выставляет опрос active-turn, и он же участвует
 * в решении «слать или копить». Если гейтить этот опрос тем же составным
 * признаком, получаются качели: флаг встал → опрос выключился и обнулил флаг →
 * включился и снова поднял. Ошибка не падает и не видна в юнит-тестах —
 * она проявляется мигающим индикатором и отправкой, проскакивающей в чужой ход.
 *
 * Правка выглядит безобидным упрощением («везде turnBusy, а тут почему-то
 * isTyping — приведу к единому виду»), поэтому и нужен явный сторож с
 * объяснением, а не только комментарий в коде.
 */

const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

/** Тело эффекта опроса active-turn — от гейта до массива зависимостей. */
function activeTurnEffect(): string {
  const start = SRC.indexOf('/webhook/chat/active-turn');
  expect(start).toBeGreaterThan(-1);
  // Эффект начинается выше вызова: отступаем к ближайшему useEffect перед ним.
  const from = SRC.lastIndexOf('useEffect(', start);
  const to = SRC.indexOf('}, [', start);
  return SRC.slice(from, SRC.indexOf(']);', to));
}

describe('связка опроса active-turn', () => {
  it('гейт опроса — isTyping, а НЕ составной turnBusy (иначе качели)', () => {
    const effect = activeTurnEffect();
    expect(effect).toMatch(/if \(isTyping\) \{ setRemoteTurnActive\(false\); return; \}/);
    expect(effect).not.toMatch(/if \(turnBusy\)/);
  });

  it('в зависимостях эффекта тоже isTyping, а не turnBusy', () => {
    const effect = activeTurnEffect();
    const deps = effect.slice(effect.lastIndexOf('}, ['));
    expect(deps).toContain('isTyping');
    expect(deps).not.toContain('turnBusy');
  });

  it('признак пишется через applyRemoteTurn: он держит метки времени', () => {
    // Прямой setRemoteTurnActive(true) в обход хелпера потерял бы момент начала,
    // и предохранитель «отправить всё равно» никогда бы не показался.
    expect(activeTurnEffect()).toContain('applyRemoteTurn(Boolean(data?.active))');
  });
});

describe('досылка очереди', () => {
  it('не уходит в идущий удалённый ход', () => {
    expect(SRC).toMatch(/if \(remoteTurnActive && !remoteOverride\) return;/);
  });

  it('просыпается, когда признак снимут: он есть в зависимостях эффекта', () => {
    const flush = SRC.slice(SRC.indexOf('Досылка очереди'));
    const deps = flush.slice(flush.indexOf('}, ['), flush.indexOf(']);') + 3);
    expect(deps).toContain('remoteTurnActive');
    expect(deps).toContain('remoteOverride');
  });
});

describe('поллинг истории', () => {
  it('очередь НЕ гасит поллинг, пока она ждёт удалённый ход', () => {
    // Иначе: поллинг молчит весь чужой ход (до 20 минут), а когда досылка
    // наконец отправит своё сообщение с текущим временем, selectNewPolledMessages
    // отбросит удалённый ответ как более старый (historyMerge.ts) — и человек
    // не увидит его вообще, до перезагрузки страницы.
    expect(SRC).toMatch(
      /const historyPollBlocked = isTyping \|\| \(queued\.length > 0 && !remoteTurnActive\);/,
    );
    const poll = SRC.slice(SRC.indexOf('Background polling'));
    const gate = poll.slice(0, poll.indexOf('let cancelled'));
    expect(gate).toContain('if (historyPollBlocked) return;');
  });

  it('окно между стримом и досылкой всё ещё закрыто — иначе ход задвоится', () => {
    // В этом окне remoteTurnActive false, значит выражение выше даёт true.
    expect(SRC).toContain('queued.length > 0 && !remoteTurnActive');
  });
});

describe('предохранитель «Отправить всё равно»', () => {
  it('карточка гейтится isTyping, а не turnBusy: иначе кнопка недостижима', () => {
    // turnBusy включает очередь, а очередь непуста ровно тогда, когда кнопка и
    // нужна — человек написал, отправка заблокирована. С гейтом по turnBusy
    // карточка исчезала вместе с единственным выходом из блокировки.
    expect(SRC).toMatch(
      /\{remoteTurnActive && !streamingMessageId && !isTyping && !historyLoading && \(/,
    );
  });

  it('разрешение и метка проверки сбрасываются при смене ассистента', () => {
    // Иначе обход, выданный для залипшего признака ассистента A, переезжает на
    // B — и первая же отправка убивает живой ход B.
    const effect = activeTurnEffect();
    expect(effect).toContain('setRemoteOverride(false)');
    expect(effect).toContain('remoteCheckedAtRef.current = null');
  });
});

describe('прочие пути отправки', () => {
  it('загрузка файла тоже не уходит в идущий удалённый ход', () => {
    // Загрузка — такой же ход к релею и так же пре-эмптит чужой ответ.
    const upload = SRC.slice(SRC.indexOf('const handleFileTaskSubmit'));
    expect(upload.slice(0, 900)).toContain('if (sendBlocked)');
  });

  it('двойное нажатие в окне синхронной проверки не даёт две отправки', () => {
    const send = SRC.slice(SRC.indexOf('const handleSend = async'));
    expect(send.slice(0, 600)).toContain('if (sendingRef.current) return;');
  });

  it('синхронная проверка ограничена таймаутом: у apiClient своего нет', () => {
    expect(SRC).toContain('AbortSignal.timeout(2000)');
  });
});
