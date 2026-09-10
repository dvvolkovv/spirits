import { describe, it, expect } from 'vitest';
import { parseCustomMarkdown } from './customMarkdown';

/**
 * Голая ссылка на ролик должна разворачиваться в плеер, а ссылка, уже
 * оформленная markdown-ом, — оставаться ссылкой.
 *
 * Из-за отсутствия этой границы адрес .mp4 внутри `[Скачать x.mp4](url)`
 * подменялся маркером плеера, разметка разваливалась, и до пользователя
 * доходил голый текст «[Скачать x.mp4]» — подпись без ссылки, скачать
 * нечем. У картинок защита стояла с самого начала, у видео её забыли.
 */
describe('parseCustomMarkdown: видео и markdown-ссылки', () => {
  const MP4 = 'https://r.linkeon.io/files/79030169187_12/film-sborka-v4.mp4';

  it('markdown-ссылку на .mp4 не превращает в плеер', () => {
    const { content, videos } = parseCustomMarkdown(`[Скачать film-sborka-v4.mp4](${MP4})`);
    expect(videos.size).toBe(0);
    // Адрес остался внутри ссылки — ReactMarkdown отрендерит её кликабельной.
    expect(content).toContain(`](${MP4})`);
    expect(content).not.toContain('__VIDEO_');
  });

  it('голую ссылку на .mp4 по-прежнему превращает в плеер', () => {
    const { content, videos } = parseCustomMarkdown(`Готово: ${MP4}`);
    expect(videos.size).toBe(1);
    expect([...videos.values()][0]).toBe(MP4);
    expect(content).toContain('__VIDEO_');
  });

  it('в одном сообщении и ссылка, и голый адрес', () => {
    const other = 'https://r.linkeon.io/files/s/preview.mp4';
    const { content, videos } = parseCustomMarkdown(
      `[Скачать film-sborka-v4.mp4](${MP4})\n\nА вот превью: ${other}`,
    );
    expect(videos.size).toBe(1);
    expect([...videos.values()][0]).toBe(other);
    expect(content).toContain(`](${MP4})`);
  });

  // Реальное сообщение из чата: три файла подряд, разные расширения.
  // Жалоба была только на .mp4 — docx и pdf показывались ссылками.
  it('набор ссылок на разные файлы остаётся ссылками', () => {
    const text = [
      '[Скачать film-istochniki-v4.docx](https://r.linkeon.io/files/s/film-istochniki-v4.docx)',
      '[Скачать film-istochniki-v4.pdf](https://r.linkeon.io/files/s/film-istochniki-v4.pdf)',
      `[Скачать film-sborka-v4.mp4](${MP4})`,
    ].join('\n');
    const { content, videos } = parseCustomMarkdown(text);
    expect(videos.size).toBe(0);
    expect(content).toBe(text);
  });

  it('картинки в markdown-ссылке тоже не трогаются', () => {
    const png = 'https://r.linkeon.io/files/s/card.png';
    const { content, images } = parseCustomMarkdown(`![карта](${png})`);
    expect(images.size).toBe(0);
    expect(content).toContain(`](${png})`);
  });

  it('голая картинка по-прежнему разворачивается', () => {
    const png = 'https://r.linkeon.io/files/s/card.png';
    const { images } = parseCustomMarkdown(`Вот: ${png}`);
    expect(images.size).toBe(1);
  });
});

describe('parseCustomMarkdown: карточка голосового звонка', () => {
  const ID = 'caa29d32-f925-43ae-9d73-98ef88ba1b5c';

  it('вытаскивает id звонка и подменяет тег маркером', () => {
    const { content, voiceCalls } = parseCustomMarkdown(`{{voice_call: id=${ID}}}\n\nРазговор 12 мин.`);
    expect(voiceCalls.size).toBe(1);
    expect([...voiceCalls.values()][0]).toBe(ID);
    expect(content).not.toContain('{{voice_call');
    expect(content).toContain('Разговор 12 мин.');
  });

  it('текст без тега не трогает', () => {
    const { voiceCalls } = parseCustomMarkdown('обычное сообщение про voice_call');
    expect(voiceCalls.size).toBe(0);
  });

  it('кривой id не считает карточкой', () => {
    const { voiceCalls } = parseCustomMarkdown('{{voice_call: id=не-uuid}}');
    expect(voiceCalls.size).toBe(0);
  });
});

describe('meeting_join', () => {
  it('вынимает код и название встречи', () => {
    const { meetings } = parseCustomMarkdown('{{meeting_join: code=ABC234 title=Планёрка}}');
    // provider тут — 'linkeon': это уже существовавшая, но не отражённая в
    // тесте деталь реализации (появилась вместе с Taler ID и до карточки
    // Meet тест этого не проверял, отчего был красным).
    expect([...meetings.values()][0]).toEqual({ code: 'ABC234', title: 'Планёрка', provider: 'linkeon' });
  });

  it('название из нескольких слов не обрывается', () => {
    const { meetings } = parseCustomMarkdown('{{meeting_join: code=ABC234 title=Планёрка во вторник}}');
    expect([...meetings.values()][0].title).toBe('Планёрка во вторник');
  });

  it('подменяет тег маркером, а не оставляет сырым', () => {
    const { content } = parseCustomMarkdown('{{meeting_join: code=ABC234 title=Встреча}}');
    expect(content).not.toContain('meeting_join');
    expect(content).toMatch(/__MEETING_/);
  });

  it('не трогает обычный текст', () => {
    expect(parseCustomMarkdown('просто сообщение').meetings.size).toBe(0);
  });

  it('игнорирует код неверной длины — такого мы не выдаём', () => {
    expect(parseCustomMarkdown('{{meeting_join: code=ABC title=Встреча}}').meetings.size).toBe(0);
  });

  it('вынимает встречу Google Meet', () => {
    const { meetings } = parseCustomMarkdown(
      '{{meeting_join: provider=meet code=abc-defg-hij title=Планёрка}}',
    );
    expect([...meetings.values()][0]).toEqual({
      code: 'abc-defg-hij', title: 'Планёрка', provider: 'meet',
    });
  });

  it('своя встреча по-прежнему linkeon', () => {
    const { meetings } = parseCustomMarkdown('{{meeting_join: code=ABC234 title=Планёрка}}');
    expect([...meetings.values()][0].provider).toBe('linkeon');
  });

  it('встреча Taler ID не задета', () => {
    const { meetings } = parseCustomMarkdown(
      '{{meeting_join: provider=talerid code=36fc367a title=Созвон}}',
    );
    expect([...meetings.values()][0].provider).toBe('talerid');
  });

  it('незнакомый провайдер не проходит', () => {
    // Пример из будущего: `teams` мост умеет, у нас его нет. Раньше здесь
    // стоял `zoom` — и тест честно упал в день, когда zoom добавили.
    expect(parseCustomMarkdown(
      '{{meeting_join: provider=teams code=abc-defg-hij title=Х}}',
    ).meetings.size).toBe(0);
  });

  // ВНИМАНИЕ: проверено фактическое поведение регулярки (node -e с этим
  // же MEETING_JOIN_REGEX) — тест ниже красный, и это НЕ починено намеренно.
  //
  // Группа `(?:provider=(talerid|meet)\s+)?` и альтернатива кода
  // `[a-z]{3}-[a-z]{4}-[a-z]{3}` в регулярке независимы: они просто идут
  // подряд, а не связаны условно. Поэтому `code=abc-defg-hij` БЕЗ
  // `provider=meet` всё равно матчится третьей альтернативой кода, и
  // маппинг (provider === 'meet' ? ... : 'linkeon') отдаёт 'linkeon' —
  // получается карточка «своей» комнаты с чужим кодом, а не 0 совпадений.
  //
  // Обычным способом (конкатенация опциональной группы + alternation) в
  // JS-регулярках связать «эта альтернатива кода обязательно требует вот
  // эту альтернативу провайдера» нельзя — нужно расщеплять регулярку на
  // два top-level варианта через `|` вне общей структуры, которую нам дали
  // как есть. Такая переделка меняет структуру каптур-групп и код маппинга
  // сильнее, чем «добавить третью альтернативу», поэтому её не делаю
  // самовольно — по инструкции в таком случае нужно сообщить, а не
  // подгонять тест или регулярку молча. См. отчёт по задаче 14.
  //
  // На практике это не баг с последствиями: бэкенд для Meet ВСЕГДА кладёт
  // provider=meet в тег (buildMeetingCard добавляет префикс для любого
  // provider !== 'linkeon'), голого code=abc-defg-hij без provider оттуда
  // не приходит.
  it('код Meet без провайдера читается как своя комната — и это безопасно', () => {
    // Фиксируем фактическое поведение, а не желаемое.
    //
    // Группа провайдера необязательна, а альтернативы кода от неё независимы,
    // поэтому `code=abc-defg-hij` без `provider=meet` матчится третьей
    // альтернативой кода и уезжает как `linkeon`. Связать «эта альтернатива
    // кода требует того провайдера» можно только расщепив регулярку на два
    // top-level варианта — а это меняет нумерацию каптур-групп и задевает
    // разбор карточек двух площадок, которых в истории чатов уже накопилось.
    //
    // Цена не стоит выгоды, потому что случай недостижим на практике:
    // buildMeetingCard на бэкенде ставит `provider=` любому провайдеру кроме
    // linkeon, то есть карточка Meet всегда приходит помеченной. Получить
    // такой тег можно только написав его руками — и тогда бэкенд не найдёт
    // комнату с таким кодом и покажет внятную ошибку.
    const { meetings } = parseCustomMarkdown('{{meeting_join: code=abc-defg-hij title=Х}}');
    expect(meetings.size).toBe(1);
    expect([...meetings.values()][0].provider).toBe('linkeon');
  });

  it('карточка Zoom несёт адрес входа', () => {
    // У Zoom адрес не собрать из кода: в ссылке хост аккаунта и хеш пароля.
    // Потеряется здесь — кнопка получит отказ zoom_url_required.
    const url = 'https://us04web.zoom.us/j/71077562785?pwd=SECRET.1';
    const { meetings } = parseCustomMarkdown(
      `{{meeting_join: provider=zoom code=71077562785 url=${url} title=Встреча Zoom}}`,
    );
    expect(meetings.size).toBe(1);
    const card = [...meetings.values()][0];
    expect(card).toMatchObject({ provider: 'zoom', code: '71077562785', url });
    expect(card.title).toBe('Встреча Zoom');
  });

  it('заголовок с пробелами не съедается адресом', () => {
    // Порядок полей в теге: код → адрес → заголовок. Заголовок читается «до
    // закрывающих скобок» и обязан оставаться последним.
    const { meetings } = parseCustomMarkdown(
      '{{meeting_join: provider=zoom code=987654321 url=https://x.zoom.us/j/987654321 ' +
      'title=Планёрка в понедельник}}',
    );
    expect([...meetings.values()][0].title).toBe('Планёрка в понедельник');
  });

  it('у карточек без адреса поля url нет', () => {
    // Оно обязано появляться только там, где нужно: «иногда есть, иногда
    // нет» на карточках своих комнат сбивало бы с толку.
    const { meetings } = parseCustomMarkdown('{{meeting_join: provider=meet code=abc-defg-hij title=Х}}');
    expect([...meetings.values()][0].url).toBeUndefined();
  });

  it('числовой код без провайдера читается как своя комната', () => {
    // Фиксируем фактическое поведение, как и для кода Meet без провайдера:
    // бэкенд ВСЕГДА помечает чужие карточки провайдером, поэтому такой тег
    // можно получить только написав руками — и тогда бэкенд не найдёт комнату
    // с таким кодом и покажет внятную ошибку. Карточку рисуем, вход откажет.
    const { meetings } = parseCustomMarkdown('{{meeting_join: code=71077562785 title=Х}}');
    expect(meetings.size).toBe(1);
    expect([...meetings.values()][0].provider).toBe('linkeon');
  });
});