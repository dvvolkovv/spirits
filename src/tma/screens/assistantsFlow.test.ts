import { describe, it, expect, vi } from 'vitest';
import { parseAgents, extractPreferredAgent, chooseAssistant, describeAgent } from './assistantsFlow';

describe('parseAgents', () => {
  it('принимает голый массив — реальную форму /webhook/agents', () => {
    const raw = [{ id: 1, name: 'psy', displayName: 'Психолог' }];
    expect(parseAgents(raw)).toEqual(raw);
  });

  it('терпит {agents:[...]}, если форма вдруг сменится', () => {
    expect(parseAgents({ agents: [{ id: 1, name: 'a' }] })).toEqual([{ id: 1, name: 'a' }]);
  });

  it('на неожиданной форме отдаёт пустой список, а не бросает', () => {
    expect(parseAgents(null)).toEqual([]);
    expect(parseAgents({ error: 'x' })).toEqual([]);
  });
});

describe('extractPreferredAgent', () => {
  it('читает profileJson.preferred_agent из массива — реальную форму /webhook/profile', () => {
    const raw = [{ profileJson: { preferred_agent: 'psy_marina' } }];
    expect(extractPreferredAgent(raw)).toBe('psy_marina');
  });

  it('терпит старый формат profile_data', () => {
    const raw = [{ profile_data: { preferred_agent: 'coach' } }];
    expect(extractPreferredAgent(raw)).toBe('coach');
  });

  it('null, если поля нет', () => {
    expect(extractPreferredAgent([{ profileJson: {} }])).toBeNull();
    expect(extractPreferredAgent(null)).toBeNull();
  });
});

describe('describeAgent — label', () => {
  it('берёт displayName, если он есть и не пустой', () => {
    const a = { id: 1, name: 'psy', displayName: 'Психолог' };
    expect(describeAgent(a, null).label).toBe('Психолог');
  });

  it('падает на name, если displayName отсутствует — COALESCE в getAgents на это не рассчитан, но поле помечено опциональным в типе', () => {
    const a = { id: 1, name: 'psy_marina' };
    expect(describeAgent(a, null).label).toBe('psy_marina');
  });

  it("падает на name, если displayName — пустая строка: COALESCE(t.display_name, a.display_name, a.name) не спасает от '', только от NULL", () => {
    const a = { id: 1, name: 'psy_marina', displayName: '' };
    expect(describeAgent(a, null).label).toBe('psy_marina');
  });

  it('падает на name, если displayName — только пробелы (незаполненный перевод, сохранённый как пробел)', () => {
    const a = { id: 1, name: 'psy_marina', displayName: '   ' };
    expect(describeAgent(a, null).label).toBe('psy_marina');
  });

  it('обрезает пробелы по краям настоящего displayName', () => {
    const a = { id: 1, name: 'psy', displayName: '  Психолог  ' };
    expect(describeAgent(a, null).label).toBe('Психолог');
  });
});

describe('describeAgent — isCurrent', () => {
  it('true, если name совпадает с current', () => {
    const a = { id: 7, name: 'coach' };
    expect(describeAgent(a, 'coach').isCurrent).toBe(true);
  });

  it('false, если current === null (профиль ещё не загрузился/упал)', () => {
    const a = { id: 7, name: 'coach' };
    expect(describeAgent(a, null).isCurrent).toBe(false);
  });

  it('false, если name не совпадает с current', () => {
    const a = { id: 7, name: 'coach' };
    expect(describeAgent(a, 'psy_marina').isCurrent).toBe(false);
  });

  it('мутация ревьюера (a.id === current вместо a.name === current): id совпадает с current, name — нет → НЕ текущий', () => {
    // id специально выбран равным строке current, чтобы словить именно
    // сравнение по id, а не по name.
    const a = { id: 'coach', name: 'coach_v2' };
    expect(describeAgent(a, 'coach').isCurrent).toBe(false);
  });

  it('и наоборот: name совпадает с current, id — нет → текущий', () => {
    const a = { id: 99, name: 'coach' };
    expect(describeAgent(a, 'coach').isCurrent).toBe(true);
  });
});

describe('chooseAssistant', () => {
  it('переключает и НЕ закрывает приложение', async () => {
    // Раньше окно захлопывалось сразу после смены, и снаружи это выглядело
    // как «ничего не произошло»: владелец тапнул дважды (логи прода 28.08).
    const deps = {
      changeAgent: vi.fn(async () => {}),
      closeApp: vi.fn(),
    };
    await chooseAssistant('psy_marina', deps);
    expect(deps.changeAgent).toHaveBeenCalledWith('psy_marina');
    expect(deps.closeApp).not.toHaveBeenCalled();
  });

  it('ошибка переключения пробрасывается — экран покажет её сам', async () => {
    const deps = {
      changeAgent: vi.fn(async () => { throw new Error('network'); }),
      closeApp: vi.fn(),
    };
    await expect(chooseAssistant('psy_marina', deps)).rejects.toThrow('network');
    expect(deps.closeApp).not.toHaveBeenCalled();
  });
});
