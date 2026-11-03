// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAFT_KEY,
  DRAFT_MAX_LENGTH,
  DRAFT_TTL_MS,
  PENDING_DRAFT_STORE_MAX,
  forgetPendingDraftIfSent,
  hasPendingDraftFor,
  takePendingDraftEntry,
  takePendingDraftFor,
} from './pendingDraft';

const NOW = 1_700_000_000_000;
const put = (value: unknown) => localStorage.setItem(DRAFT_KEY, JSON.stringify(value));

describe('черновик сообщения со страницы linkeon.io', () => {
  beforeEach(() => localStorage.clear());

  it('отдаётся своему ассистенту один раз', () => {
    put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBe('Райя, привет!');
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('чужому ассистенту — не отдаётся и не стирается', () => {
    put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(12, NOW)).toBeNull();
    expect(takePendingDraftFor('14', NOW)).toBe('Райя, привет!');
  });

  it('через час забывается', () => {
    put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW + DRAFT_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('битое, пустое и длиннее PENDING_DRAFT_STORE_MAX отбрасывается', () => {
    localStorage.setItem(DRAFT_KEY, '{oops');
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    put({ text: '   ', assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    // Предел хранилища — PENDING_DRAFT_STORE_MAX (2000, I7), а не
    // DRAFT_MAX_LENGTH (600 — он только у захвата из #draft=/#ask=).
    put({ text: 'я'.repeat(PENDING_DRAFT_STORE_MAX + 1), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ровно PENDING_DRAFT_STORE_MAX символов принимается (I7)', () => {
    put({ text: 'я'.repeat(PENDING_DRAFT_STORE_MAX), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBe('я'.repeat(PENDING_DRAFT_STORE_MAX));
  });

  it('длиннее DRAFT_MAX_LENGTH (600), но в пределах PENDING_DRAFT_STORE_MAX — принимается (I7)', () => {
    // До I7 read() отбрасывал любую запись длиннее 600 — проба с полем на
    // 2000 символов не смогла бы дождаться входа черновиком длиннее этого.
    put({ text: 'я'.repeat(DRAFT_MAX_LENGTH + 1), assistant: '14', expires: NOW + DRAFT_TTL_MS });
    expect(takePendingDraftFor(14, NOW)).toBe('я'.repeat(DRAFT_MAX_LENGTH + 1));
  });

  describe('hasPendingDraftFor — проверка без выдачи', () => {
    it('своему ассистенту: true, и запись остаётся на месте', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      expect(hasPendingDraftFor(14, NOW)).toBe(true);
      // Не выдана и не стёрта — takePendingDraftFor потом всё ещё отдаёт её.
      expect(takePendingDraftFor(14, NOW)).toBe('Райя, привет!');
    });

    it('чужому ассистенту: false', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      expect(hasPendingDraftFor(12, NOW)).toBe(false);
    });

    it('просроченной записи: false, и запись стёрта', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      expect(hasPendingDraftFor(14, NOW + DRAFT_TTL_MS + 1)).toBe(false);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
  });

  describe('forgetPendingDraftIfSent — снять черновик после успешной отправки (I1, ревью 03.11)', () => {
    // READ-ONLY сверка: в отличие от «забрать и положить обратно»
    // (takePendingDraftFor + savePendingDraft), эта функция НИКОГДА не
    // пересохраняет запись — только либо стирает её целиком, либо не трогает
    // вовсе. Пересохранение продлевало бы TTL черновика ещё на час при каждой
    // успешной отправке (черновик жил бы бесконечно) и теряло бы пометку auto
    // у чужого, не совпавшего черновика.
    it('текст совпал в точности — черновик снят', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      forgetPendingDraftIfSent('14', 'Райя, привет!', NOW);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('отправленный текст ДОПОЛНЯЕТ черновик (дописанное поле, склейка очереди) — тоже снят', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      forgetPendingDraftIfSent('14', 'Райя, привет!\n\nи ещё кое-что дописал', NOW);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('лишние пробелы с обеих сторон не мешают сверке', () => {
      put({ text: '  Райя, привет!  ', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      forgetPendingDraftIfSent('14', '   Райя, привет!   ', NOW);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('чужому ассистенту — черновик не трогается', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      forgetPendingDraftIfSent('12', 'Райя, привет!', NOW);
      expect(takePendingDraftFor('14', NOW)).toBe('Райя, привет!');
    });

    it('отправленный текст не покрывает черновик (другой, не прочитанный черновик) — не трогается, auto цел', () => {
      put({ text: 'Данные рождения для другого вопроса', assistant: '14', expires: NOW + DRAFT_TTL_MS, auto: true });
      forgetPendingDraftIfSent('14', 'Привет, это вообще не про то', NOW);
      // Не просто takePendingDraftFor (она бы стёрла запись чтением) —
      // takePendingDraftEntry тоже стирает, но ДО него localStorage цел.
      expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
      expect(takePendingDraftEntry('14', NOW)).toEqual({ text: 'Данные рождения для другого вопроса', auto: true });
    });

    it('просроченная запись — не трогается (и так уже никакая, read() сам стёр бы при чтении)', () => {
      put({ text: 'Райя, привет!', assistant: '14', expires: NOW + DRAFT_TTL_MS });
      forgetPendingDraftIfSent('14', 'Райя, привет!', NOW + DRAFT_TTL_MS + 1);
      // Запись просрочена — сверка не находит живой черновик и ничего не
      // стирает ПОВТОРНО, но read() внутри уже увидел её просроченной.
      expect(takePendingDraftFor('14', NOW + DRAFT_TTL_MS + 1)).toBeNull();
    });
  });
});
