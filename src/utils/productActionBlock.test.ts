import { describe, it, expect } from 'vitest';
import { extractProductActions, stripProductActionBlocks } from './productActionBlock';
import { parseCustomMarkdown } from './customMarkdown';

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const block = (id = ID) => '```product-action\n{"id":"' + id + '"}\n```';

describe('блок карточки продукта', () => {
  it('блок → маркер, id — в карту', () => {
    const r = extractProductActions(`Готово.\n\n${block()}`);
    expect(r.content).toBe('Готово.\n\n__PACTION_0__');
    expect(r.actions.get('0')).toBe(ID);
  });

  it('не uuid или мусор внутри — блок исчезает без карточки', () => {
    const r = extractProductActions('Текст\n\n```product-action\n{"id":"drop"}\n```');
    expect(r.content).toBe('Текст\n\n');
    expect(r.actions.size).toBe(0);
  });

  it('копирование — без блоков', () => {
    expect(stripProductActionBlocks(`А\n\n${block()}`)).toBe('А\n\n');
  });

  it('parseCustomMarkdown отдаёт карточки и не трогает блок вопросов', () => {
    const r = parseCustomMarkdown(`Ниже карточка.\n\n${block()}`);
    expect(r.content).toContain('__PACTION_0__');
    expect(r.productActions.get('0')).toBe(ID);
    expect(r.asks.size).toBe(0);
  });

  // Доп. защита сверх плана задачи: повтор одного и того же id в тексте
  // (сервер по ошибке/гонке дважды дописал блок) не должен давать две
  // отдельные карточки — только первое вхождение становится маркером, а
  // повторный блок с тем же id исчезает без следа (как мусор).
  it('повтор одного id — одна карточка, второй блок исчезает без маркера', () => {
    const id2 = 'bbbbbbbb-cccc-4ddd-9eee-ffffffffffff';
    const r = extractProductActions(`${block()}\n\n${block()}\n\n${block(id2)}`);
    expect(r.content).toBe('__PACTION_0__\n\n\n\n__PACTION_1__');
    expect(r.actions.size).toBe(2);
    expect(r.actions.get('0')).toBe(ID);
    expect(r.actions.get('1')).toBe(id2);
  });

  // Распознавание на фронте строгое — ровно та форма, в которой блок
  // пишет сервер (product-action-tail.ts): "```product-action" без пробела
  // между бэктиками и именем. Разбор сервера, наоборот, либеральный и чистит
  // любую неряшливую форму ДО того, как блок доедет до браузера — так что
  // этот текст в реальности никогда не долетит до фронта. Здесь же он не
  // распознаётся карточкой и остаётся как обычный текст.
  it('открывающая строка с пробелом перед именем ("``` product-action") — не карточка, текст не трогается', () => {
    const text = `Текст\n\n\`\`\` product-action\n{"id":"${ID}"}\n\`\`\`\n\nПосле.`;
    const r = extractProductActions(text);
    expect(r.content).toBe(text);
    expect(r.actions.size).toBe(0);
  });

  it('блок с CRLF (\\r\\n внутри) распознаётся как обычный', () => {
    const text = `Готово.\r\n\r\n\`\`\`product-action\r\n{"id":"${ID}"}\r\n\`\`\`\r\nПосле.`;
    const r = extractProductActions(text);
    expect(r.content).toContain('__PACTION_0__');
    expect(r.actions.get('0')).toBe(ID);
  });

  it('соседний ```js-блок не трогается', () => {
    const text = `Код:\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\nКарточка:\n\n${block()}\n\nКонец.`;
    const r = extractProductActions(text);
    expect(r.content).toContain('```js\nconst x = 1;\n```');
    expect(r.content).toContain('__PACTION_0__');
    expect(r.actions.get('0')).toBe(ID);
  });

  it('текст после блока не теряется', () => {
    const r = extractProductActions(`${block()}\n\nПосле.`);
    expect(r.content).toBe('__PACTION_0__\n\nПосле.');
    expect(r.actions.get('0')).toBe(ID);
  });

  it('битый JSON внутри блока — блок исчезает без карточки', () => {
    const r = extractProductActions('Текст\n\n```product-action\nnot json at all\n```');
    expect(r.content).toBe('Текст\n\n');
    expect(r.actions.size).toBe(0);
  });

  it('stripProductActionBlocks убирает блок и с невалидным id — копирование не проверяет id', () => {
    const text = 'А\n\n```product-action\n{"id":"not-a-uuid"}\n```';
    expect(stripProductActionBlocks(text)).toBe('А\n\n');
  });

  // Смешанный вход: блок ask (вопрос ассистента) и блок карточки продукта в
  // одном сообщении — у каждого свой разбор (customMarkdown.tsx сначала
  // вынимает product-action, потом ask), и они не должны мешать друг другу.
  it('смешанный вход: ask-блок и блок карточки продукта — обе карты по одной записи, ask-карточка цела', () => {
    const askJson = JSON.stringify({ questions: [{ question: 'Кому поздравление?', multi: false, options: ['Коллеге', 'Другу'] }] });
    const askBlockText = '```ask\n' + askJson + '\n```';
    const text = `Вопрос.\n\n${askBlockText}\n\nДалее.\n\n${block()}`;
    const r = parseCustomMarkdown(text);
    expect(r.productActions.size).toBe(1);
    expect(r.asks.size).toBe(1);
    expect(r.productActions.get('0')).toBe(ID);
    expect(r.asks.get('0')?.kind).toBe('card');
  });
});
