import { describe, it, expect } from 'vitest';
import pt from './locales/pt.json';
import de from './locales/de.json';

/**
 * Вариант языка и обращение (14.10.2026):
 *   - pt.json — европейский португальский («ficheiro», «está a responder»), но
 *     в нём жили бразильские формы: «está respondendo», метки «Gerando áudio…»,
 *     «— exibindo a anterior», «em uma», «em outra». Проверки ниже держат весь
 *     файл. Не ловятся: герундий посреди фразы без вспомогательного глагола,
 *     бразильская лексика («salvar», «Meus») и «você»;
 *   - «заведение» продукта в pt — одним словом «preparação», как Einrichtung в
 *     de и setup в en: статус «A preparar…» сменялся ошибкой «Falha ao
 *     provisionar»;
 *   - в немецком разделы встреч и продуктов обращались к человеку то на «du»,
 *     то на «Sie», а встречи говорили «Meeting» рядом с «Besprechung».
 */

const flat = (o: any, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)] as [string, string]]);

// Буквы — через \p{L}: в \w нет «ç» и «á», и «está avançando» проскакивало.
// «está respondendo», «fica carregando» — бразильское; в Португалии «está a responder».
const BR_GERUND =
  /(?<!\p{L})(?:est(?:á|ão|ou|amos|ava|avam|eja|ejam|ar|iver|ará|arão|aria)|fica|ficam|continua|continuam|segue|seguem)\s+\p{L}+ndo(?!\p{L})/iu;
// «em uma/em outros» — бразильское; в Португалии «numa/noutros».
const BR_EM = /(?<!\p{L})em\s+(?:um|uma|uns|umas|outro|outra|outros|outras)(?!\p{L})/iu;
// Герундий в начале строки или после тире: «Gerando áudio…», «Conectando-se…»,
// «— exibindo a anterior». Европейский вариант — «A gerar…», «a mostrar».
// Слова на -ndo, которые не герундий, — в исключениях; португальский
// «Sendo assim…» тоже попадётся — тогда дописать сюда.
const LEAD_GERUND = /(?:^|[—–]\s*)(\p{L}+ndo)(?!\p{L})/gu;
const NOT_GERUND = /^(?:quando|segundo|fundo|mundo|comando)$/iu;
const leadGerunds = (v: string) => [...v.matchAll(LEAD_GERUND)].map((m) => m[1]).filter((w) => !NOT_GERUND.test(w));
// Вежливое «Sie/Ihnen/Ihr» — с заглавной; «sie» со строчной — «она/они».
const SIE = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;

const NBSP = String.fromCharCode(0xa0);

describe('pt — европейский португальский', () => {
  const all = flat(pt);

  it('нет бразильского герундия «está …ndo» / «fica …ndo»', () => {
    expect(all.filter(([, v]) => BR_GERUND.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('нет бразильского «em uma / em outra»', () => {
    expect(all.filter(([, v]) => BR_EM.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('нет герундия в начале строки или после тире («Gerando…», «— exibindo…»)', () => {
    expect(all.filter(([, v]) => leadGerunds(v).length > 0).map(([k]) => k)).toEqual([]);
  });

  it('«заведение» продукта — «preparação», без «provisionar»', () => {
    expect(flat((pt as any).products, 'products.').filter(([, v]) => /provision/i.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('проверки видят бразильские формы, если они есть (сторож сторожа)', () => {
    expect(BR_GERUND.test('O assistente ainda está respondendo')).toBe(true);
    expect(BR_GERUND.test('O processo está avançando')).toBe(true);
    expect(BR_GERUND.test('Está respondendo…')).toBe(true);
    expect(BR_GERUND.test('A página fica carregando')).toBe(true);
    expect(BR_GERUND.test('Os ficheiros continuam carregando')).toBe(true);
    expect(BR_GERUND.test('O assistente ainda está a responder')).toBe(false);

    expect(BR_EM.test('Em uma reunião')).toBe(true);
    expect(BR_EM.test('em outros dispositivos')).toBe(true);
    expect(BR_EM.test(`está em${NBSP}uma reunião`)).toBe(true);
    expect(BR_EM.test('O assistente está numa reunião')).toBe(false);
    // «tem um» — «em um» внутри слова: без (?<!\p{L}) это сработало бы.
    expect(BR_EM.test('O produto já tem um domínio')).toBe(false);

    expect(leadGerunds('Gerando áudio…')).toEqual(['Gerando']);
    expect(leadGerunds('Não foi possível atualizar a lista — exibindo a anterior')).toEqual(['exibindo']);
    expect(leadGerunds('Conectando-se…')).toEqual(['Conectando']);
    expect(leadGerunds('Enviando {{count}} ficheiros…')).toEqual(['Enviando']);
    expect(leadGerunds('Carregando')).toEqual(['Carregando']);
    expect(leadGerunds('Quando terminar, tente novamente')).toEqual([]);
    expect(leadGerunds('A gerar o áudio…')).toEqual([]);
  });
});

describe('de — встречи и продукты на «du», встречи — «Besprechung»', () => {
  const meeting = flat((de as any).chat.meeting, 'chat.meeting.');
  const products = flat((de as any).products, 'products.');

  it('встречи и продукты не обращаются на «Sie»', () => {
    expect([...meeting, ...products].filter(([, v]) => SIE.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('встречи не говорят «Meeting»', () => {
    expect(meeting.filter(([, v]) => /Meeting/.test(v)).map(([k]) => k)).toEqual([]);
  });

  it('проверка видит «Sie», но не «sie» — «sobald sie beendet ist» про встречу (сторож сторожа)', () => {
    expect(SIE.test('Bitte versuchen Sie es erneut')).toBe(true);
    expect(SIE.test('Versuch es bitte noch einmal, sobald sie beendet ist')).toBe(false);
  });
});
