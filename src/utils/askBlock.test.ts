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
