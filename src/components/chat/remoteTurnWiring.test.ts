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
  it('удалённый ход его НЕ выключает — иначе чужой ответ не подберётся из БД', () => {
    const poll = SRC.slice(SRC.indexOf('Background polling'));
    const gate = poll.slice(0, poll.indexOf('let cancelled'));
    expect(gate).toContain('if (turnBusy) return;');
    expect(gate).not.toContain('remoteTurnActive');
  });
});
