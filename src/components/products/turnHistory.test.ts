import { describe, it, expect } from 'vitest';
import { canRevert } from './TurnHistory';
import type { Turn } from '../../services/productsApi';

const turn = (over: Partial<Turn>): Turn =>
  ({
    id: 't-1', channel: 'web', prompt: 'поправь футер', result: null, status: 'done',
    sha_before: 'aaa111', sha_after: 'bbb222', revert_to_sha: null, tokens_spent: 100,
    error: null, created_at: '', finished_at: null, ...over,
  }) as Turn;

describe('canRevert', () => {
  it('успешный ход с точкой возврата откатывается', () => {
    expect(canRevert(turn({}))).toBe(true);
  });

  it('упавший ход откатывать нечего', () => {
    // Агент не закоммитил, дерево не менялось.
    expect(canRevert(turn({ status: 'failed' }))).toBe(false);
  });

  it('уже откаченный ход не откатывается повторно', () => {
    expect(canRevert(turn({ status: 'reverted' }))).toBe(false);
  });

  it('идущий ход не откатывается', () => {
    expect(canRevert(turn({ status: 'running' }))).toBe(false);
  });

  it('ход без точки возврата не откатывается', () => {
    // sha_before заполняется только при финализации; у не дошедших до неё
    // ходов возвращаться некуда.
    expect(canRevert(turn({ sha_before: null }))).toBe(false);
  });

  it('служебный ход отката сам не откатывается', () => {
    // Опознаётся по полю, а не по тексту промпта: строковый контракт между
    // бэкендом и фронтом разъезжается молча.
    expect(canRevert(turn({ revert_to_sha: 'aaa111' }))).toBe(false);
  });
});
