// src/components/chat/listen/speechText.test.ts
import { describe, it, expect } from 'vitest';
import { LISTEN_MAX_CHARS, listenPrice, toSpeechText } from './speechText';

const UUID = '0b3c2a9e-1111-4222-8333-944455556666';

describe('toSpeechText — что синтезатор прочтёт вслух', () => {
  it('простой текст остаётся как есть', () => {
    expect(toSpeechText('Привет! Как дела?')).toBe('Привет! Как дела?');
  });

  it('снимает выделение и решётки заголовков; строка без знака конца получает точку', () => {
    expect(toSpeechText('## Итоги\n\n**Главное** — это *сон* и __отдых__.')).toBe('Итоги.\nГлавное — это сон и отдых.');
  });

  it('маркеры списка уходят, нумерация остаётся', () => {
    expect(toSpeechText('Вот план:\n- купить хлеб\n* позвонить маме\n1. Первый шаг')).toBe(
      'Вот план:\nкупить хлеб.\nпозвонить маме.\n1. Первый шаг.',
    );
  });

  it('ссылка читается текстом; голый адрес и картинка — нет', () => {
    expect(toSpeechText('Подробнее на [нашем сайте](https://linkeon.io). Пример: https://example.com/x\n![схема](https://a.b/c.png)')).toBe(
      'Подробнее на нашем сайте. Пример:',
    );
  });

  it('блок кода не читается, инлайн-код читается содержимым', () => {
    expect(toSpeechText('Выполните `npm test`:\n```bash\nrm -rf /\n```\nГотово')).toBe('Выполните npm test:\nГотово.');
  });

  it('служебные теги: ссылка-тег читается текстом, кнопки и плееры — нет', () => {
    const src = [
      'Пополните баланс.',
      '{{button: Купить токены | action: buy-tokens | variant: primary}}',
      '{{link: Тарифы | url: /tokens}}',
      `{{audio:id=${UUID}}}`,
    ].join('\n');
    expect(toSpeechText(src)).toBe('Пополните баланс.\nТарифы.');
  });

  it('маркеры видео и календаря вырезаются', () => {
    expect(toSpeechText(`Ролик готов [VIDEO_JOB:${UUID}] и встреча [CALENDAR_PROPOSAL:${UUID}] тоже`)).toBe(
      'Ролик готов и встреча тоже.',
    );
  });

  it('эмодзи не читаются, пробел перед знаком не остаётся', () => {
    expect(toSpeechText('Отлично 👍🏽 получилось 🎉! Флаг 🇷🇺 и 1️⃣')).toBe('Отлично получилось! Флаг и 1.');
  });

  it('таблица читается строками через запятую', () => {
    expect(toSpeechText('| Тариф | Цена |\n|---|:---:|\n| Базовый | 490 ₽ |')).toBe('Тариф, Цена.\nБазовый, 490 ₽.');
  });

  it('цитата и горизонтальная линия', () => {
    expect(toSpeechText('> Цитата мудреца\n\n---\n\nКонец')).toBe('Цитата мудреца.\nКонец.');
  });

  it('HTML-теги снимаются', () => {
    expect(toSpeechText('Строка<br>вторая <b>жирная</b>')).toBe('Строка вторая жирная.');
  });

  it('snake_case не трогается, а _курсив_ снимается', () => {
    expect(toSpeechText('Поле user_id и _важное_ слово')).toBe('Поле user_id и важное слово.');
  });

  it('карточка вопроса читается вопросом и вариантами', () => {
    const src = 'Уточню:\n```ask\n{"questions":[{"question":"Какой формат?","multi":false,"options":["Текст","Видео"]}]}\n```';
    expect(toSpeechText(src)).toBe('Уточню:\nКакой формат?\nТекст.\nВидео.');
  });

  it('ответ из одних картинок и плееров — читать нечего', () => {
    expect(toSpeechText(`![](https://a.b/c.png)\n{{audio:id=${UUID}}}`)).toBe('');
  });
});

describe('listenPrice — зеркало tokenCostFor на бэке', () => {
  it('1000 токенов за каждую начатую 1000 знаков', () => {
    expect(listenPrice(1)).toBe(1000);
    expect(listenPrice(1000)).toBe(1000);
    expect(listenPrice(1001)).toBe(2000);
    expect(listenPrice(LISTEN_MAX_CHARS)).toBe(10000);
  });
});
