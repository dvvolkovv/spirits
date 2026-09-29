// src/components/chat/askAnswer.test.ts
import { describe, it, expect } from 'vitest';
import type { AskQuestion } from '../../utils/askBlock';
import { buildAskAnswer, parseAskAnswer, isAskComplete } from './askAnswer';

const WHO: AskQuestion = { header: 'Для кого', question: 'Для кого поздравление?', multi: false, options: ['Коллеге', 'Руководителю', 'Другу'] };
const TONE: AskQuestion = { header: 'Тон', question: 'Какой тон?', multi: true, options: ['Тёплый', 'С юмором', 'Деловой'] };
const pick = (selected: string[], custom = '') => ({ selected, custom });

describe('ответ из карточки', () => {
  it('один вопрос — просто выбранное', () => {
    expect(buildAskAnswer([WHO], [pick(['Коллеге'])])).toBe('Коллеге');
  });

  it('несколько вариантов — через запятую', () => {
    expect(buildAskAnswer([TONE], [pick(['Тёплый', 'С юмором'])])).toBe('Тёплый, С юмором');
  });

  it('свой вариант в одиночном выборе заменяет чип', () => {
    expect(buildAskAnswer([WHO], [pick(['Коллеге'], ' Тёще ')])).toBe('Тёще');
  });

  it('свой вариант в множественном добавляется к чипам', () => {
    expect(buildAskAnswer([TONE], [pick(['Тёплый'], 'стихами')])).toBe('Тёплый, стихами');
  });

  it('несколько вопросов — строка на вопрос с подписью', () => {
    expect(buildAskAnswer([WHO, TONE], [pick(['Коллеге']), pick(['Тёплый'])])).toBe('Для кого: Коллеге\nТон: Тёплый');
  });

  it('без подписи строка начинается с вопроса', () => {
    const bare = { ...WHO, header: undefined };
    expect(buildAskAnswer([bare, TONE], [pick(['Другу']), pick(['Деловой'])]))
      .toBe('Для кого поздравление?: Другу\nТон: Деловой');
  });

  it('готовность: ответ нужен на каждый вопрос', () => {
    expect(isAskComplete([WHO, TONE], [pick(['Коллеге']), pick([])])).toBe(false);
    expect(isAskComplete([WHO, TONE], [pick(['Коллеге']), pick([], 'стихами')])).toBe(true);
    expect(isAskComplete([WHO], [pick([], '   ')])).toBe(false);
  });

  it('после перезагрузки выбор восстанавливается из текста ответа', () => {
    const qs = [WHO, TONE];
    const text = buildAskAnswer(qs, [pick(['Руководителю']), pick(['Тёплый', 'Деловой'])]);
    expect(parseAskAnswer(qs, text)).toEqual([['Руководителю'], ['Тёплый', 'Деловой']]);
  });

  it('ответ своими словами — ничего не подсвечено', () => {
    expect(parseAskAnswer([WHO], 'а можно маме?')).toEqual([[]]);
  });
});
