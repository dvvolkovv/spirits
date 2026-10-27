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
});
