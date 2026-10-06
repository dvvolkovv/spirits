// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { rememberLoginIntent } from './loginIntent';
import { peekPendingAssistant } from './pendingAssistant';
import { takePendingDestination } from './pendingDestination';

const NOW = 1_700_000_000_000;

describe('намерение до входа: побеждает последнее', () => {
  beforeEach(() => localStorage.clear());

  it('кнопка «Сделать сайт или бота» запоминает вкладку продуктов', () => {
    rememberLoginIntent('/studio', '?tab=products&utm_content=sites', NOW);
    expect(takePendingDestination(NOW)).toBe('/studio?tab=products');
  });

  it('страница ассистента — как раньше: запоминается ассистент', () => {
    rememberLoginIntent('/chat', '?assistant=14', NOW);
    expect(peekPendingAssistant(NOW)).toBe('14');
  });

  it('сначала сайт, потом ассистент — после входа к ассистенту', () => {
    rememberLoginIntent('/studio', '?tab=products', NOW);
    rememberLoginIntent('/chat', '?assistant=14', NOW + 1000);
    expect(peekPendingAssistant(NOW + 2000)).toBe('14');
    expect(takePendingDestination(NOW + 2000)).toBeNull();
  });

  it('сначала ассистент, потом сайт — после входа в Студию', () => {
    rememberLoginIntent('/chat', '?assistant=14', NOW);
    rememberLoginIntent('/studio', '?tab=products', NOW + 1000);
    expect(takePendingDestination(NOW + 2000)).toBe('/studio?tab=products');
    expect(peekPendingAssistant(NOW + 2000)).toBeNull();
  });

  it('обычная страница ничего не трогает', () => {
    rememberLoginIntent('/chat', '?assistant=14', NOW);
    rememberLoginIntent('/chat', '', NOW + 1000);
    rememberLoginIntent('/profile', '', NOW + 1000);
    expect(peekPendingAssistant(NOW + 2000)).toBe('14');
  });
});
