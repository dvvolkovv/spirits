// src/utils/askBlock.test.ts
import { describe, it, expect } from 'vitest';
import { extractAskBlocks, parseAskJson, askBlocksToPlainText } from './askBlock';

const Q = { header: 'Для кого', question: 'Для кого поздравление?', multi: false, options: ['Коллеге', 'Руководителю', 'Другу'] };
const J = JSON.stringify({ questions: [Q] });
const block = (json: string) => '```ask\n' + json + '\n```';

describe('блок ask в тексте ответа', () => {
  it('целый блок → карточка, текст вокруг остаётся', () => {
    const { content, asks } = extractAskBlocks(`Сначала пара слов.\n\n${block(J)}\n`);
    expect(content).toBe('Сначала пара слов.\n\n__ASK_0__\n');
    expect(asks.get('0')).toEqual({ kind: 'card', questions: [Q] });
  });

  it('недописанный блок во время стрима — заглушка, JSON не виден', () => {
    const { content, asks } = extractAskBlocks('Текст\n```ask\n{"questions":[{"quest', { streaming: true });
    expect(content).toBe('Текст\n__ASK_0__');
    expect(asks.get('0')).toEqual({ kind: 'pending' });
  });

  it('незакрытый блок в готовом сообщении разбирается до конца текста', () => {
    const { asks } = extractAskBlocks('```ask\n' + J);
    expect(asks.get('0')).toEqual({ kind: 'card', questions: [Q] });
  });

  it('битый JSON — вопрос и варианты обычным текстом', () => {
    const broken = '{"questions":[{"question":"Какой тон?","options":["Тёплый","Деловой"],}';
    const { asks } = extractAskBlocks(block(broken));
    expect(asks.get('0')).toEqual({ kind: 'fallback', text: '**Какой тон?**\n- Тёплый\n- Деловой' });
  });

  it('мягкие пределы: первые 3 годных вопроса, до 4 вариантов, повторы схлопнуты', () => {
    const qs = parseAskJson(JSON.stringify({ questions: [
      { question: 'A?', options: ['1', '2', '2', '3', '4', '5'] },
      { question: 'B?', options: ['только один'] },
      { question: '', options: ['1', '2'] },
      { question: 'C?', options: ['1', '2'] },
      { question: 'D?', options: ['1', '2'], multi: true },
      { question: 'E?', options: ['1', '2'] },
    ] }))!;
    expect(qs.map((q) => q.question)).toEqual(['A?', 'C?', 'D?']);
    expect(qs[0].options).toEqual(['1', '2', '3', '4']);
    expect(qs[2].multi).toBe(true);
  });

  it('ни одного годного вопроса — null', () => {
    expect(parseAskJson('{"questions":[]}')).toBeNull();
    expect(parseAskJson('{"foo":1}')).toBeNull();
  });

  it('несколько блоков — у каждого свой маркер', () => {
    const { content, asks } = extractAskBlocks(`${block(J)}\nи ещё\n${block(J)}`);
    expect(content).toBe('__ASK_0__\nи ещё\n__ASK_1__');
    expect(asks.size).toBe(2);
  });

  it('открывающая строка: регистр и пробелы не важны', () => {
    expect(extractAskBlocks('``` ASK \n' + J + '\n```').asks.get('0')?.kind).toBe('card');
  });

  it('обычный блок кода не трогается', () => {
    const src = '```js\nconst a = 1;\n```';
    const { content, asks } = extractAskBlocks(src);
    expect(content).toBe(src);
    expect(asks.size).toBe(0);
  });

  it('копирование: вместо блока — вопрос и варианты текстом', () => {
    expect(askBlocksToPlainText(`Итак.\n${block(J)}`))
      .toBe('Итак.\nДля кого поздравление?\n- Коллеге\n- Руководителю\n- Другу');
  });
});

describe('стрим: недописанное открытие ```ask не мигает сырыми бэктиками', () => {
  it('частичное слово "ask" в хвосте потока — бэктики не видны', () => {
    const { content } = extractAskBlocks('Секунду...\n```as', { streaming: true });
    expect(content).not.toContain('`');
  });

  it('голые бэктики без слова в хвосте — тоже прячем во время стрима', () => {
    const { content } = extractAskBlocks('Секунду...\n```', { streaming: true });
    expect(content).not.toContain('`');
  });

  it('полное слово "ask" без переноса строки в хвосте — тоже прячем', () => {
    const { content } = extractAskBlocks('Секунду...\n```ask', { streaming: true });
    expect(content).not.toContain('`');
  });

  it('вне стрима хвостовые бэктики не трогаем — сообщение уже дописано целиком', () => {
    const { content } = extractAskBlocks('Секунду...\n```');
    expect(content).toBe('Секунду...\n```');
  });

  it('чужой язык в хвосте — не недописанный ask, прятать нельзя', () => {
    const { content } = extractAskBlocks('Секунду...\n```js', { streaming: true });
    expect(content).toBe('Секунду...\n```js');
  });
});

describe('известное ограничение: ask внутри внешнего ```markdown блока', () => {
  // Намеренно фиксируем ТЕКУЩЕЕ поведение, а не желаемое: вложенные тройные
  // бэктики markdown не поддерживаются никак специально. extractAskBlocks
  // находит первую строку `ask`-открытия независимо от внешней обёртки,
  // разбирает JSON и закрывается на ближайшей строке из одних бэктиков —
  // ей оказывается закрытие ВНУТРЕННЕГО ask-блока. Бэктики внешнего
  // ```markdown при этом остаются в тексте как есть (их никто не убирает) —
  // а хвостовые закрывающие бэктики самого markdown-блока не трогаются,
  // ложась после маркера карточки. Если ассистент когда-нибудь начнёт
  // оборачивать ответ во внешний ```markdown, вокруг карточки в ленте будет
  // видна лишняя пара бэктиков — это и есть ограничение, а не баг здесь.
  it('внешний ```markdown вокруг ask остаётся как текст, карточка всё равно строится', () => {
    const outer = '```markdown\nВыбери:\n```ask\n' + J + '\n```\n```';
    const { content, asks } = extractAskBlocks(outer);
    expect(content).toBe('```markdown\nВыбери:\n__ASK_0__\n```');
    expect(asks.get('0')).toEqual({ kind: 'card', questions: [Q] });
  });
});

describe('закрывающие бэктики на одной строке с JSON', () => {
  it('«}```» — всё равно карточка, а не текст вместо неё', () => {
    const src = '```ask\n{"questions":[{"question":"Тон?","options":["Тёплый","Деловой"]}]}```\nпосле';
    const { content, asks } = extractAskBlocks(src);
    expect(asks.get('0')?.kind).toBe('card');
    expect(content).toBe('__ASK_0__\nпосле');
  });
});
