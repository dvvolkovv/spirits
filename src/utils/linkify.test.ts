import { describe, expect, it } from 'vitest';
import { linkifyText } from './linkify';

describe('linkifyText', () => {
  it('текст без адресов — один кусок текста', () => {
    expect(linkifyText('Просто текст.')).toEqual([{ kind: 'text', text: 'Просто текст.' }]);
  });

  it('адрес посреди текста — ссылка; точка в конце предложения — текст', () => {
    expect(linkifyText('Откройте https://my.linkeon.io/profile?open=zoom. Готово')).toEqual([
      { kind: 'text', text: 'Откройте ' },
      { kind: 'link', text: 'https://my.linkeon.io/profile?open=zoom', href: 'https://my.linkeon.io/profile?open=zoom' },
      { kind: 'text', text: '. Готово' },
    ]);
  });

  it('скобки вокруг адреса — не часть адреса; парная скобка внутри — часть', () => {
    expect(linkifyText('(см. https://example.org/a)')[1]).toEqual({
      kind: 'link',
      text: 'https://example.org/a',
      href: 'https://example.org/a',
    });
    expect(linkifyText('https://en.wikipedia.org/wiki/Foo_(bar)')[0]).toEqual({
      kind: 'link',
      text: 'https://en.wikipedia.org/wiki/Foo_(bar)',
      href: 'https://en.wikipedia.org/wiki/Foo_(bar)',
    });
  });

  it('ёлочки вокруг адреса — тоже не часть адреса', () => {
    expect(linkifyText('«https://example.org/x»')).toEqual([
      { kind: 'text', text: '«' },
      { kind: 'link', text: 'https://example.org/x', href: 'https://example.org/x' },
      { kind: 'text', text: '»' },
    ]);
  });

  it('только http и https: javascript:, data: и ftp: остаются текстом', () => {
    for (const s of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://example.org/f']) {
      expect(linkifyText(s).every((p) => p.kind === 'text'), s).toBe(true);
    }
  });

  it('голое «https://» — не адрес', () => {
    expect(linkifyText('https:// и всё')).toEqual([{ kind: 'text', text: 'https:// и всё' }]);
  });

  it('несколько адресов подряд', () => {
    const links = linkifyText('https://a.example/1 и https://b.example/2').filter((p) => p.kind === 'link');
    expect(links.map((p) => p.text)).toEqual(['https://a.example/1', 'https://b.example/2']);
  });

  // Находка ревью (I3): ответ на китайском или японском ставит за адресом свою
  // пунктуацию, и часто без пробела. Адрес должен на ней кончаться.
  const linkText = (s: string) => linkifyText(s).find((p) => p.kind === 'link')?.text;

  it.each([
    ['打开 https://my.linkeon.io/profile?open=zoom。', 'https://my.linkeon.io/profile?open=zoom'],
    ['打开https://my.linkeon.io/profile?open=zoom。然后点击连接', 'https://my.linkeon.io/profile?open=zoom'],
    ['（https://my.linkeon.io/profile?open=zoom）', 'https://my.linkeon.io/profile?open=zoom'],
    ['「https://my.linkeon.io/support」で', 'https://my.linkeon.io/support'],
    ['https://my.linkeon.io/chat，然后', 'https://my.linkeon.io/chat'],
    ['https://my.linkeon.io/chat、https://my.linkeon.io/help', 'https://my.linkeon.io/chat'],
    ['https://my.linkeon.io/studio?tab=bots！', 'https://my.linkeon.io/studio?tab=bots'],
    [`https://my.linkeon.io/chat${String.fromCharCode(0x3000)}дальше`, 'https://my.linkeon.io/chat'],
  ])('%s — адрес кончается перед пунктуацией CJK', (text, link) => {
    expect(linkText(text)).toBe(link);
  });

  it('текст вокруг адреса на экране остаётся целиком', () => {
    const text = '打开https://my.linkeon.io/profile?open=zoom。然后点击连接';
    const parts = linkifyText(text);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts[parts.length - 1]).toEqual({ kind: 'text', text: '。然后点击连接' });
  });

  it('иероглифы и полуширинная катакана — часть адреса', () => {
    expect(linkifyText('https://zh.wikipedia.org/wiki/北京 — столица')[0]).toEqual({
      kind: 'link',
      text: 'https://zh.wikipedia.org/wiki/北京',
      href: 'https://zh.wikipedia.org/wiki/%E5%8C%97%E4%BA%AC',
    });
    expect(linkText('https://example.org/ｶﾀｶﾅ')).toBe('https://example.org/ｶﾀｶﾅ');
  });

  // Находка ревью (I3): ответ поддержки бывает с markdown-разметкой, а за
  // адресом в ней — «**», «_», «~» или «]». GFM-автоссылка в чате их срезает.
  it.each([
    ['**https://my.linkeon.io/profile?open=zoom**', 'https://my.linkeon.io/profile?open=zoom'],
    ['_https://example.org/a_', 'https://example.org/a'],
    ['~~https://example.org/a~~', 'https://example.org/a'],
    ['[https://example.org/a]', 'https://example.org/a'],
  ])('%s — разметка вокруг адреса не часть адреса', (text, link) => {
    expect(linkText(text)).toBe(link);
  });

  it('парная квадратная скобка внутри адреса — часть адреса', () => {
    expect(linkText('https://example.org/?a[0]=1 и https://example.org/b[1]')).toBe('https://example.org/?a[0]=1');
    expect(linkifyText('https://example.org/b[1]')[0]).toMatchObject({ text: 'https://example.org/b[1]' });
  });
});
