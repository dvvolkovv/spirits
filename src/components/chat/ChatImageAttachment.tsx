import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MediaViewer from './files/MediaViewer';

/**
 * Картинка-вложение в ленте: сам файл (не миниатюра — ручка миниатюр режет
 * квадратом 384×384, широкая схема зала обрезалась бы, а по клику всё равно
 * нужен оригинал: файлы чата отдаются с Content-Disposition: attachment,
 * открыть «оригинал» по ссылке — значит скачать его, не увидеть) над
 * ссылкой «Скачать …».
 *
 * Рисуется внутри <p> markdown-абзаца, поэтому только строчные элементы
 * (span/img/a) — блок даёт класс `block`. Не загрузилась — картинки нет,
 * остаётся одна ссылка, как было.
 *
 * Клик по картинке открывает существующий просмотрщик (files/MediaViewer.tsx,
 * один синтезированный ChatFileItem) — у него уже готовы полноэкранный
 * режим, своя кнопка «Скачать», Esc и ловушка фокуса. Рисуется порталом в
 * document.body: компонент живёт внутри <p> ленты сообщения, а у <div>
 * там невалидная разметка, да и fixed внутри трансформированного предка
 * (у пузыря сообщения такие бывают) поехал бы мимо экрана.
 *
 * Ссылка — обычная ссылка на файл: скачивание — её прямой смысл, поэтому
 * без preventDefault/обработчика открытия (в отличие от прочих ссылок чата).
 *
 * not-prose — иначе `prose-sm img` даёт картинке лишние ~24px отступов.
 * ym-hide-content — на обёртке (медиа-компоненты в проекте несут класс сами,
 * а не ждут его от родителя), ym-disable-tracklink — на ссылке, мимо
 * «Внешних переходов» Метрики: адреса файлов переписки личные
 * (webvisorPrivacy.test.ts).
 */
const ChatImageAttachment: React.FC<{
  url: string;
  name: string;
  children: React.ReactNode;
}> = ({ url, name, children }) => {
  const [broken, setBroken] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();

  return (
    <span className="not-prose ym-hide-content block my-2" data-testid="chat-image-attachment">
      {!broken && (
        <img
          src={url}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          onClick={() => setViewerOpen(true)}
          className="block rounded-xl max-h-72 sm:max-h-96 max-w-full object-contain cursor-zoom-in bg-gray-50"
        />
      )}
      <a
        ref={linkRef}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="ym-disable-tracklink mt-1 inline-block text-forest-600 hover:text-forest-700 underline"
      >
        {children}
      </a>
      {viewerOpen &&
        createPortal(
          <MediaViewer
            items={[{ key: url, kind: 'image', url, name, ext, createdAt: '', messageId: 0, stored: true }]}
            index={0}
            onIndexChange={() => {}}
            onClose={() => {
              setViewerOpen(false);
              linkRef.current?.focus();
            }}
          />,
          document.body,
        )}
    </span>
  );
};

export default ChatImageAttachment;
