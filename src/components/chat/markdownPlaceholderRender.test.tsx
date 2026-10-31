// src/components/chat/markdownPlaceholderRender.test.tsx
//
// E2b (находка ревью пробы 31.10, с коммита 40198ee): {{button}}, {{link}} и
// голая ссылка на ролик молча пропадали из ответа ассистента — ChatInterface.tsx
// искал их в картах customMarkdown.tsx с задвоенным префиксом (разбор и сторож
// проводки — markdownPlaceholderWiring.test.ts). Здесь — поведенческое
// доказательство по образцу cabinetLinksRender.test.tsx: то, что уходит в
// разметку, действительно находится по id КАК ЕСТЬ (без повторного префикса —
// так работает весь контракт между customMarkdown.tsx и любым потребителем
// метки) и рисуется настоящими <button>/<a href>/<video>.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createButtonComponent, createLinkComponent, createVideoComponent, parseCustomMarkdown } from '../../utils/customMarkdown';

/** Тот же захват id из метки, что в ChatInterface.tsx: id уже включает префикс целиком. */
function idFrom(placeholder: RegExp, text: string): string {
  const m = text.match(placeholder);
  if (!m) throw new Error(`метка не найдена: ${placeholder} в ${JSON.stringify(text)}`);
  return m[1];
}

describe('{{button}}, {{link}} и голая ссылка на ролик доходят до разметки чата', () => {
  it('{{button}} — buttons.get(id как есть) находит конфиг и рисуется <button> с подписью', () => {
    const { content, buttons } = parseCustomMarkdown('Жми {{button: Купить токены | action: buy-tokens | variant: primary}}');
    const id = idFrom(/__BUTTON_(\w+)__/, content);
    const config = buttons.get(id);
    expect(config).toEqual({ text: 'Купить токены', action: 'buy-tokens', variant: 'primary', icon: undefined });
    const html = renderToStaticMarkup(<>{createButtonComponent(config!, () => {})}</>);
    expect(html).toContain('<button');
    expect(html).toContain('Купить токены');
  });

  it('{{link}} — links.get(id как есть) находит конфиг и рисуется <a href>', () => {
    const { content, links } = parseCustomMarkdown('Смотри {{link: Открыть профиль | url: https://example.org/a}}');
    const id = idFrom(/__LINK_(\w+)__/, content);
    const config = links.get(id);
    expect(config?.url).toBe('https://example.org/a');
    const html = renderToStaticMarkup(<>{createLinkComponent(config!, () => {})}</>);
    expect(html).toContain('href="https://example.org/a"');
    expect(html).toContain('Открыть профиль');
  });

  it('голая ссылка на .mp4 — videos.get(id как есть) находит адрес и рисуется <video>', () => {
    const { content, videos } = parseCustomMarkdown('Ролик готов: https://cdn.example.org/clip.mp4 — посмотри');
    const id = idFrom(/__VIDEO_(\w+)__/, content);
    const src = videos.get(id);
    expect(src).toBe('https://cdn.example.org/clip.mp4');
    const html = renderToStaticMarkup(<>{createVideoComponent(src!)}</>);
    expect(html).toContain('<video');
    expect(html).toContain('src="https://cdn.example.org/clip.mp4"');
  });

  it('контроль старого бага: двойной префикс (как раньше искал ChatInterface.tsx) не находит ничего', () => {
    const { content, buttons, links, videos } = parseCustomMarkdown(
      'Жми {{button: Купить | action: buy-tokens}} и смотри {{link: Открыть | url: https://example.org/a}} — https://cdn.example.org/clip.mp4',
    );
    const buttonId = idFrom(/__BUTTON_(\w+)__/, content);
    const linkId = idFrom(/__LINK_(\w+)__/, content);
    const videoId = idFrom(/__VIDEO_(\w+)__/, content);
    expect(buttons.get(`btn_${buttonId}`)).toBeUndefined();
    expect(links.get(`link_${linkId}`)).toBeUndefined();
    expect(videos.get(`video_${videoId}`)).toBeUndefined();
    // А по id как есть — находится (это и есть верный контракт).
    expect(buttons.get(buttonId)).toBeDefined();
    expect(links.get(linkId)).toBeDefined();
    expect(videos.get(videoId)).toBeDefined();
  });
});

// T2 (ревью E2 31.10, тот же корень, что уже исправлен в components/guest/
// GuestChat.tsx): две соседние метки одного вида без текста между ними —
// обычный случай, когда ассистент даёт две ссылки подряд без разделителя.
// Разбор и сторож самого ChatInterface.tsx — markdownPlaceholderWiring.test.ts
// («регулярки меток — ленивый квантификатор»); здесь — контракт на стороне
// customMarkdown.tsx: что именно нужно извлекать ленивым (\w+?), чтобы обе
// подписи нашлись, и что жадный (\w+) их склеивает.
describe('T2: две соседние метки одного вида без текста между ними', () => {
  const TWO_LINKS = '{{link: Первая | url: https://a.example}}{{link: Вторая | url: https://b.example}}';

  it('ленивый (\\w+?) — обе ссылки находят свой конфиг', () => {
    const { content, links } = parseCustomMarkdown(TWO_LINKS);
    const ids = [...content.matchAll(/__LINK_(\w+?)__/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(links.get(ids[0])?.url).toBe('https://a.example');
    expect(links.get(ids[1])?.url).toBe('https://b.example');
  });

  it('контроль старого бага: жадный (\\w+) склеивает обе метки в один несуществующий id', () => {
    const { content, links } = parseCustomMarkdown(TWO_LINKS);
    const greedyIds = [...content.matchAll(/__LINK_(\w+)__/g)].map((m) => m[1]);
    expect(greedyIds).toHaveLength(1);
    expect(links.get(greedyIds[0])).toBeUndefined();
  });
});

// Встроенный плеер (createVideoComponent): 73 голых ссылки на .mp4/.webm уже
// в истории чата (ревью E2 31.10, прочитано на проде) — часть старше 90 дней,
// часть адресов протухла. preload="none" — не тянуть их только из-за того,
// что плеер теперь рисуется; playsInline — не разворачивать на весь экран на
// iOS Safari при первом воспроизведении.
describe('createVideoComponent: не грузить старые ролики заранее', () => {
  it('preload="none" и playsInline — на каждом видео в ленте', () => {
    const html = renderToStaticMarkup(<>{createVideoComponent('https://cdn.example.org/clip.mp4')}</>);
    expect(html).toContain('preload="none"');
    expect(html).toContain('playsinline'); // React рендерит playsInline как playsinline
  });
});

// Неизвестный variant (опечатка в ответе ассистента, или значение, которого
// нет в списке: primary/secondary/success/danger) — раньше уходил в карту как
// есть, и getButtonStyles собирал класс с буквальным словом "undefined".
describe('{{button}} с неизвестным variant — откат на primary', () => {
  it('variant: weird — в конфиге primary, класс не содержит undefined', () => {
    const { content, buttons } = parseCustomMarkdown('{{button: X | action: y | variant: weird}}');
    const id = idFrom(/__BUTTON_(\w+?)__/, content);
    const config = buttons.get(id);
    expect(config?.variant).toBe('primary');
    const html = renderToStaticMarkup(<>{createButtonComponent(config!, () => {})}</>);
    expect(html).not.toContain('undefined');
  });
});
