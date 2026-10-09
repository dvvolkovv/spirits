// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFT_KEY, DRAFT_MAX_LENGTH, DRAFT_TTL_MS, takePendingDraftFor } from './pendingDraft';

/**
 * Скрипт в index.html, который забирает #draft=… до Метрики. Тест исполняет
 * НАСТОЯЩИЙ скрипт из index.html: копия логики здесь зеленела бы при любой
 * правке файла.
 */
const HTML = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const SCRIPT = HTML.match(/<script data-draft-capture>([\s\S]*?)<\/script>/)?.[1] ?? '';

function open(url: string): void {
  window.history.replaceState(null, '', url);
  new Function(SCRIPT)();
}

const DRAFT = 'Райя, привет! Мои данные рождения: 12.03.1990, 14:25, Казань (UTC+3).';

describe('черновик из адреса', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('скрипт есть и стоит раньше Метрики', () => {
    expect(SCRIPT).not.toBe('');
    expect(HTML.indexOf('data-draft-capture')).toBeLessThan(HTML.indexOf('mc.yandex.ru/metrika/tag.js'));
  });

  it('забирает текст и стирает фрагмент из адреса', () => {
    open(`/chat?assistant=14&utm_content=hd-calc#draft=${encodeURIComponent(DRAFT)}`);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('draft');
    expect(window.location.pathname + window.location.search).toBe('/chat?assistant=14&utm_content=hd-calc');
    expect(takePendingDraftFor(14)).toBe(DRAFT);
  });

  it('битый, длинный и без ассистента — не сохраняется, но из адреса стирается', () => {
    open('/chat?assistant=14#draft=%E0%A4%A');
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    open(`/chat?assistant=14#draft=${encodeURIComponent('я'.repeat(DRAFT_MAX_LENGTH + 1))}`);
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    open(`/chat#draft=${encodeURIComponent(DRAFT)}`);
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('другие фрагменты не трогает', () => {
    open('/chat#settings');
    expect(window.location.hash).toBe('#settings');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  // Без #draft= в адресе скрипт раньше выходил сразу и не трогал то, что уже
  // лежит в localStorage: просроченная запись, если гость больше не открывал
  // чат (единственное другое место чистки — takePendingDraftFor) и не
  // выходил из аккаунта, оставалась навсегда. Час из pendingDraft.ts обязан
  // быть сроком удаления, а не просто сроком «кто ещё читает».
  it('просроченная запись стирается при обычном заходе без #draft=', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: DRAFT, assistant: '14', expires: Date.now() - 1000 }));
    open('/chat');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('свежая запись остаётся на месте при обычном заходе без #draft=', () => {
    const fresh = JSON.stringify({ text: DRAFT, assistant: '14', expires: Date.now() + DRAFT_TTL_MS });
    localStorage.setItem(DRAFT_KEY, fresh);
    open('/chat');
    expect(localStorage.getItem(DRAFT_KEY)).toBe(fresh);
  });

  it('битая запись стирается при обычном заходе без #draft=', () => {
    localStorage.setItem(DRAFT_KEY, '{oops');
    open('/chat');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('новый #draft= поверх просроченной старой записи сохраняет новую', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: 'старый черновик', assistant: '14', expires: Date.now() - 1000 }));
    open(`/chat?assistant=14#draft=${encodeURIComponent(DRAFT)}`);
    expect(takePendingDraftFor(14)).toBe(DRAFT);
  });

  // Скрипт в index.html вне tsc и eslint: числа в нём обязаны совпадать с
  // pendingDraft.ts, иначе рассинхрон молча пропустит или отбросит черновик.
  it('ключ, длина и срок в скрипте — те же, что в pendingDraft.ts', () => {
    expect(SCRIPT).toContain(`'${DRAFT_KEY}'`);
    expect(SCRIPT).toContain(`> ${DRAFT_MAX_LENGTH}`);
    expect(SCRIPT).toContain(`+ ${DRAFT_TTL_MS}`);
  });
});
