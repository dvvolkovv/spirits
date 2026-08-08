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
