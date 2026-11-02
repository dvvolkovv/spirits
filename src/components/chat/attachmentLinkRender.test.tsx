// src/components/chat/attachmentLinkRender.test.tsx
//
// Контрактный тест по образцу cabinetLinksRender.test.tsx: строка, которую
// реально пишет бэк (spirits_back/src/chat/chat-files/relay-links.ts:
// outputFileLines → `[Скачать ${name}](${url})`; имя в адресе кодируется
// encodeStrict из file-meta.ts — encodeURIComponent плюс ' ( ) * ! —
// сырыми они ломают markdown-ссылку на первой же «)»), должна пройти
// react-markdown + remark-gfm и узнаться imageAttachmentPreview по href,
// который РЕАЛЬНО отдаёт парсер — а не по тому, что мы предполагаем, что он
// отдаёт. Окружение node: разметка рисуется строкой, как в
// cabinetLinksRender.test.tsx.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { imageAttachmentPreview } from './attachmentPreview';

/** href всех ссылок, которые react-markdown нарисует из этого текста. */
function hrefs(markdown: string): string[] {
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>);
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

describe('ссылка на картинку в формате бэка (relay-links.ts) узнаётся после react-markdown', () => {
  it('имя с пробелом, парной и непарной скобкой — распознаётся, name раскодирован как есть у бэка', () => {
    // Тот самый пример: исходное имя файла — «1) План (v2).png». encodeStrict
    // кодирует и пробел (как encodeURIComponent), и ' ( ) * ! (которых он сам
    // не трогает) — в адресе ни одной «живой» скобки, markdown не спутает её
    // с концом цели ссылки.
    const url =
      'https://my.linkeon.io/smm-media/linkeon-chat-files/8b75c10c-0ddf-41b0-b780-7e54bc1175f9/' +
      '1%29%20%D0%9F%D0%BB%D0%B0%D0%BD%20%28v2%29.png';
    const line = `[Скачать 1) План (v2).png](${url})`;

    const found = hrefs(line);
    expect(found).toEqual([url]);

    const a = imageAttachmentPreview(found[0]);
    expect(a).not.toBeNull();
    expect(a!.name).toBe('1) План (v2).png');
    expect(a!.fullUrl).toBe(url);
  });

  it('то же самое, но тестовый стенд (/minio/) — тоже распознаётся', () => {
    const url = 'https://test.linkeon.io/minio/linkeon-chat-files/k/%D1%81%D1%85%D0%B5%D0%BC%D0%B0.webp';
    const line = `[Скачать схема.webp](${url})`;

    const found = hrefs(line);
    expect(found).toEqual([url]);

    const a = imageAttachmentPreview(found[0]);
    expect(a).not.toBeNull();
    expect(a!.name).toBe('схема.webp');
  });
});
