// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { takePendingDraftEntry, takePendingDraftFor } from './pendingDraft';

/** Исполняется НАСТОЯЩИЙ скрипт из index.html — как в draftCapture.test.ts. */
const HTML = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const SCRIPT = HTML.match(/<script data-draft-capture>([\s\S]*?)<\/script>/)?.[1] ?? '';

function open(url: string): void {
  window.history.replaceState(null, '', url);
  new Function(SCRIPT)();
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('вопрос с поля на linkeon.io (#ask=)', () => {
  it('забирается с пометкой «отправить» и стирается из адреса', () => {
    open(`/chat?assistant=12&utm_content=hero-ask#ask=${encodeURIComponent('Как поднять цены?')}`);
    expect(window.location.hash).toBe('');
    expect(takePendingDraftEntry(12)).toEqual({ text: 'Как поднять цены?', auto: true });
  });

  it('черновик #draft= — без пометки', () => {
    open(`/chat?assistant=14#draft=${encodeURIComponent('Мои данные рождения')}`);
    expect(takePendingDraftEntry(14)).toEqual({ text: 'Мои данные рождения', auto: false });
  });

  it('для чата после входа вопрос — обычный черновик: только текст', () => {
    open(`/chat?assistant=12#ask=${encodeURIComponent('Вопрос')}`);
    expect(takePendingDraftFor(12)).toBe('Вопрос');
  });
});
