// src/components/guest/guestConfigPrefetch.test.ts
// @vitest-environment jsdom
//
// I1 (ревью качества B9-fix): встроенный скрипт index.html, который уходит за
// /webhook/guest/config ДО того, как загрузится бандл. Спека «Выкат», шаг 1,
// обещает «для людей ничего не меняется» — а без этого каждый новый
// посетитель /chat в режиме «вкл» ждал бы сетевой круг (до 4 с при сбое)
// перед экраном входа. Тест исполняет НАСТОЯЩИЙ скрипт из index.html — как
// draftCapture.test.ts для data-draft-capture: копия логики здесь зеленела
// бы при любой правке файла.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HTML = readFileSync(join(__dirname, '..', '..', '..', 'index.html'), 'utf8');
const SCRIPT = HTML.match(/<script data-guest-config-prefetch>([\s\S]*?)<\/script>/)?.[1] ?? '';

function open(url: string): void {
  window.history.replaceState(null, '', url);
  new Function(SCRIPT)();
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  // «Висит» нарочно: тест смотрит только на то, что запрос УШЁЛ, а не на его
  // разрешение — скрипт не ждёт ответа, только отправляет.
  fetchMock = vi.fn(() => new Promise(() => {}));
  (window as any).fetch = fetchMock;
  delete (window as any).__guestConfigPrefetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ранний запрос конфигурации пробы (data-guest-config-prefetch)', () => {
  it('скрипт есть и стоит рядом с data-draft-capture', () => {
    expect(SCRIPT).not.toBe('');
    expect(HTML.indexOf('data-draft-capture')).toBeLessThan(HTML.indexOf('data-guest-config-prefetch'));
  });

  it('без токена и отметки «входили», на /chat — запрос уходит, промис в window.__guestConfigPrefetch', () => {
    open('/chat');
    expect(fetchMock).toHaveBeenCalledWith('/webhook/guest/config', expect.objectContaining({ credentials: 'same-origin' }));
    expect((window as any).__guestConfigPrefetch).toBeInstanceOf(Promise);
  });

  it('без токена, путь / — тоже уходит', () => {
    open('/');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('хвостовой слэш у /chat/ — всё равно уходит', () => {
    open('/chat/');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('с jwt_access_token — не уходит', () => {
    localStorage.setItem('jwt_access_token', 'x');
    open('/chat');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((window as any).__guestConfigPrefetch).toBeUndefined();
  });

  it('с отметкой «входили» (linkeon_has_account) — не уходит', () => {
    localStorage.setItem('linkeon_has_account', '1');
    open('/chat');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('другой раздел кабинета (/studio) — не уходит', () => {
    open('/studio');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Сценарий из задания буквально: токен + отметка «входили» + чужой раздел
  // — все три причины отказаться сразу, запрос не уходит ни при одной.
  it('с токеном, с отметкой «входили», на /studio — запрос не уходит', () => {
    localStorage.setItem('jwt_access_token', 'x');
    localStorage.setItem('linkeon_has_account', '1');
    open('/studio');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
