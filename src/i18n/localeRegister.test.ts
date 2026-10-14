import { describe, it, expect } from 'vitest';
import pt from './locales/pt.json';
import de from './locales/de.json';

/**
 * Регистр и вариант языка (14.10.2026):
 *   - pt.json — европейский португальский («ficheiro», «está a responder»), но
 *     восемь строк были бразильскими: «está respondendo», «em uma», «em outra»;
 *   - в немецком разделе встреч одна строка обращалась на «Sie», хотя весь
 *     кабинет на «du», и одна говорила «Meeting» вместо «Besprechung».
 */

const flat = (o: any, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)] as [string, string]]);

// «está respondendo» — бразильское; в Португалии «está a responder».
const BR_GERUND = /\b(está|estão|estou|estamos|estava|estavam) \w+ndo\b/;
// «em uma/em outra» — бразильское; в Португалии «numa/noutra».
const BR_EM = /\bem (um|uma|outro|outra|uns|umas)\b/;
// Вежливое «Sie/Ihnen/Ihr» с заглавной посреди фразы.
const SIE = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;

describe('pt — европейский португальский', () => {
  it('нет бразильского герундия «está …ndo»', () => {
    expect(flat(pt).filter(([, v]) => BR_GERUND.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('нет бразильского «em uma / em outra»', () => {
    expect(flat(pt).filter(([, v]) => BR_EM.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('проверки видят бразильские формы, если они есть (сторож сторожа)', () => {
    expect(BR_GERUND.test('O assistente ainda está respondendo')).toBe(true);
    expect(BR_GERUND.test('O assistente ainda está a responder')).toBe(false);
    expect(BR_EM.test('O assistente está em uma reunião')).toBe(true);
    expect(BR_EM.test('O assistente está numa reunião')).toBe(false);
  });
});

describe('de — встречи на «du» и «Besprechung», как весь кабинет', () => {
  const meeting = flat((de as any).chat.meeting);

  it('раздел встреч не обращается на «Sie»', () => {
    expect(meeting.filter(([, v]) => SIE.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('раздел встреч не говорит «Meeting»', () => {
    expect(meeting.filter(([, v]) => /Meeting/.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('проверка видит «Sie», но не «sie» — «sobald sie beendet ist» про встречу (сторож сторожа)', () => {
    expect(SIE.test('Bitte versuchen Sie es erneut')).toBe(true);
    expect(SIE.test('Versuch es bitte noch einmal, sobald sie beendet ist')).toBe(false);
  });
});
