import { describe, it, expect, vi } from 'vitest';
import { parseAgents, extractPreferredAgent, chooseAssistant } from './assistantsFlow';

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

describe('chooseAssistant', () => {
  it('сначала меняет ассистента на сервере, потом закрывает — порядок важен', async () => {
    const order: string[] = [];
    const deps = {
      changeAgent: vi.fn(async () => { order.push('changeAgent'); }),
      closeApp: vi.fn(() => { order.push('closeApp'); }),
    };
    await chooseAssistant('psy_marina', deps);
    expect(order).toEqual(['changeAgent', 'closeApp']);
    expect(deps.changeAgent).toHaveBeenCalledWith('psy_marina');
  });

  it('не закрывает приложение, если change-agent упал', async () => {
    const deps = {
      changeAgent: vi.fn(async () => { throw new Error('network'); }),
      closeApp: vi.fn(),
    };
    await expect(chooseAssistant('psy_marina', deps)).rejects.toThrow('network');
    expect(deps.closeApp).not.toHaveBeenCalled();
  });
});
