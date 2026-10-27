// src/components/chat/cabinetLinksRender.test.tsx
//
// Путь ссылки на раздел от текста ответа до перехода — так, как его проходит
// чат: текст → react-markdown + remark-gfm (те же плагины, что в
// ChatInterface) → href ссылки → chatLinkPath. Здесь же закреплено поведение
// GFM-автоссылки, на которое опирается chatLinkPath: ASCII-знаки за адресом
// она срезает сама, а полноширинную и китайскую пунктуацию, ёлочки и
// многоточие забирает в адрес. Обновление remark-gfm, которое это поменяет,
// покраснеет здесь, а не у людей. Окружение node: разметка рисуется строкой.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createImageComponent, createLinkComponent, parseCustomMarkdown } from '../../utils/customMarkdown';
import {
  SECTION_LINKS,
  chatLinkPath,
  deepSectionLink,
  isWebLink,
  profileCardAnchor,
  profileTarget,
} from '../../utils/cabinetSections';

const HOST = 'my.linkeon.io';
const B = `https://${HOST}`;

/** href всех ссылок, которые чат нарисует из этого текста. */
function hrefs(markdown: string): string[] {
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>);
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

/** Какой раздел откроет кабинет по пути: канонический адрес (как его видит вход). */
function section(path: string | null): string | null {
  if (path === null) return null;
  const [pathname, query = ''] = path.split('?');
  return query ? deepSectionLink(pathname, `?${query}`) : pathname;
}

// Как адрес стоит в тексте — на разных языках ответа.
const AROUND: [string, (url: string) => string][] = [
  ['точка в конце предложения', (u) => `Откройте ${u}.`],
  ['запятая и продолжение', (u) => `Откройте ${u}, там карточка.`],
  ['точка с запятой', (u) => `Ссылка: ${u}; дальше сами.`],
  ['скобки', (u) => `Карточка (${u}) в настройках.`],
  ['жирный', (u) => `**${u}**`],
  ['ёлочки', (u) => `«${u}»`],
  ['многоточие', (u) => `Вот ${u}…`],
  ['китайская точка', (u) => `打开 ${u}。`],
  ['полноширинные скобки', (u) => `（${u}）`],
  ['японские кавычки', (u) => `「${u}」`],
  ['markdown-ссылка', (u) => `[Открыть](${u})`],
];

describe('адрес раздела в ответе ассистента ведёт в тот же раздел', () => {
  it.each([...SECTION_LINKS])('%s — в любом окружении текста', (link) => {
    for (const [name, wrap] of AROUND) {
      const found = hrefs(wrap(`${B}${link}`));
      expect(found, name).toHaveLength(1);
      expect(section(chatLinkPath(found[0], HOST)), name).toBe(link);
    }
  });
});

describe('поведение GFM-автоссылки, на которое опирается chatLinkPath', () => {
  it('ASCII-знаки за адресом GFM срезает сама', () => {
    for (const tail of ['.', ',', ';', ':', '!', '?', ')', '*', '_', '~', "'", '"']) {
      expect(hrefs(`${B}/chat${tail} дальше`), tail).toEqual([`${B}/chat`]);
    }
  });

  it('полноширинную и китайскую пунктуацию, ёлочки, многоточие — забирает в адрес', () => {
    expect(hrefs(`${B}/profile?open=zoom）`)).toEqual([`${B}/profile?open=zoom%EF%BC%89`]);
    expect(hrefs(`${B}/profile?open=zoom。`)).toEqual([`${B}/profile?open=zoom%E3%80%82`]);
    expect(hrefs(`«${B}/chat»`)).toEqual([`${B}/chat%C2%BB`]);
    expect(hrefs(`${B}/chat…`)).toEqual([`${B}/chat%E2%80%A6`]);
  });

  it('китайский текст без пробела за адресом уходит в адрес целиком — карточку это не ломает', () => {
    const [href] = hrefs(`打开${B}/profile?open=zoom。然后点击连接`);
    expect(decodeURI(href)).toBe(`${B}/profile?open=zoom。然后点击连接`);
    const path = chatLinkPath(href, HOST) ?? '';
    expect(profileTarget(path.slice(path.indexOf('?'))).anchor).toBe(profileCardAnchor('zoom'));
  });
});

// Находка ревью (I4): «//host» и «/\host» — адрес чужого сайта, и переход
// роутера туда увёл бы вкладку кабинета.
describe('ссылка в ответе с адресом чужого сайта под видом пути', () => {
  const FOREIGN = ['//evil.example', '/\\evil.example'];

  it.each(FOREIGN)('{{link}} с url: %s — новая вкладка, а не переход роутера', (url) => {
    const [config] = [...parseCustomMarkdown(`Смотри {{link: Тут | url: ${url}}}`).links.values()];
    expect(config.url).toBe(url);
    expect(chatLinkPath(config.url, HOST)).toBeNull();
  });

  it.each(FOREIGN)('markdown-ссылка на %s не даёт пути, который браузер прочтёт как чужой хост', (url) => {
    const found = hrefs(`[Тут](${url})`);
    expect(found).toHaveLength(1);
    const path = chatLinkPath(found[0], HOST);
    if (path !== null) expect(path).toMatch(/^\/(?![/\\])/);
  });
});

// {{link}} кладёт адрес в обработчик и в href как есть — react-markdown его не
// чистит. Чат открывает только веб-адреса (isWebLink): остальное не
// открывается ни кликом, ни средней кнопкой, ни «Открыть в новой вкладке».
describe('{{link}} с не веб-схемой', () => {
  const tag = (html: string) => html.match(/<a\b[^>]*>/)?.[0] ?? '';

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(document.cookie)',
    'data:text/html,<b>x</b>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://my.linkeon.io/x',
  ])('{{link: x | url: %s}} — не открывается и не попадает в href', (url) => {
    const [config] = [...parseCustomMarkdown(`Смотри {{link: x | url: ${url}}}`).links.values()];
    expect(config.url).toBe(url);
    expect(chatLinkPath(config.url, HOST)).toBeNull();
    expect(isWebLink(config.url)).toBe(false);
    expect(tag(renderToStaticMarkup(<>{createLinkComponent(config, () => {})}</>))).not.toContain('href=');
  });

  it('веб-адрес в {{link}} — с href, как был', () => {
    const html = renderToStaticMarkup(<>{createLinkComponent({ text: 'x', url: 'https://example.org/a' }, () => {})}</>);
    expect(tag(html)).toContain('href="https://example.org/a"');
  });

  it('markdown-ссылку с javascript: react-markdown гасит сам — обработчик её не получит', () => {
    expect(hrefs('[x](javascript:alert(1))')).toEqual(['']);
  });
});

// Метрика (trackLinks в index.html) пишет внешние переходы полным адресом, а
// адреса из переписки личные. Сторож исходника ChatInterface — в
// webvisorPrivacy.test.ts; здесь — ссылки, которые рисуют помощники разметки.
describe('ссылки разметки чата мимо «Внешних переходов» Метрики', () => {
  const classes = (html: string) => (html.match(/<a\b[^>]*class="([^"]*)"/)?.[1] ?? '').split(/\s+/);

  it('{{link}} — с ym-disable-tracklink', () => {
    const html = renderToStaticMarkup(<>{createLinkComponent({ text: 'x', url: 'https://example.org/a' }, () => {})}</>);
    expect(classes(html)).toContain('ym-disable-tracklink');
  });

  it('картинка по голой ссылке — с ym-disable-tracklink', () => {
    const html = renderToStaticMarkup(<>{createImageComponent('https://example.org/a.png')}</>);
    expect(classes(html)).toContain('ym-disable-tracklink');
  });
});
