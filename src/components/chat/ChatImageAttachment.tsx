import React, { useState } from 'react';

/**
 * Картинка-вложение в ленте: миниатюра над ссылкой «Скачать …».
 *
 * Рисуется внутри <p> markdown-абзаца, поэтому только строчные элементы
 * (span/img/a) — блок даёт класс `block`. Миниатюра с ручки бэка; не
 * загрузилась — оригинал; не загрузился и он — остаётся одна ссылка, как было.
 * Лента целиком под ym-hide-content (webvisorPrivacy.test.ts), ссылка — с
 * ym-disable-tracklink: адреса файлов переписки личные.
 */
const ChatImageAttachment: React.FC<{
  thumbUrl: string;
  fullUrl: string;
  alt: string;
  onOpen: () => void;
  children: React.ReactNode;
}> = ({ thumbUrl, fullUrl, alt, onOpen, children }) => {
  const [src, setSrc] = useState<string | null>(thumbUrl);

  return (
    <span className="block my-2" data-testid="chat-image-attachment">
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setSrc((cur) => (cur === thumbUrl && thumbUrl !== fullUrl ? fullUrl : null))}
          onClick={onOpen}
          className="block rounded-xl max-w-full w-56 sm:w-72 object-contain cursor-pointer bg-gray-50"
        />
      )}
      <a
        href={fullUrl}
        onClick={(e) => {
          e.preventDefault();
          onOpen();
        }}
        className="ym-disable-tracklink mt-1 inline-block text-forest-600 hover:text-forest-700 underline cursor-pointer"
      >
        {children}
      </a>
    </span>
  );
};

export default ChatImageAttachment;
