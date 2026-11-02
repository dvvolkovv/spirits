import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import MediaViewer from './files/MediaViewer';
import type { ChatFileItem } from './files/chatFiles';

/**
 * MediaViewer требует onIndexChange, но здесь всегда один элемент — общая
 * стабильная ссылка на no-op (вместо инлайновой стрелочной функции,
 * создающейся заново на каждый рендер). Без неё MediaViewer переподписывал
 * бы свой keydown-слушатель на window при каждом перерендере родителя (а
 * стрим дописывает текст в тот же пузырь message-за-message, то есть на
 * каждый чанк) — слушатель уезжал бы в конец списка слушателей window,
 * после слушателей соседних панелей (та же ловушка с порядком и
 * defaultPrevented, что разобрана в ChatFilesPanel.tsx).
 */
const noop = () => {};

/**
 * Картинка-вложение в ленте: сам файл (не миниатюра — ручка миниатюр режет
 * квадратом 384×384, широкая схема зала обрезалась бы, а по клику всё равно
 * нужен оригинал: файлы чата отдаются с Content-Disposition: attachment,
 * открыть «оригинал» по ссылке — значит скачать его, не увидеть) над
 * ссылкой «Скачать …».
 *
 * Рисуется внутри <p> markdown-абзаца, поэтому только строчные элементы
 * (span/img/a/button) — блок даёт класс `block`. Не загрузилась — картинки
 * нет, остаётся одна ссылка, как было.
 *
 * Картинка — за кнопкой (не просто <img onClick>): без неё открыть просмотр
 * можно было только мышью, с клавиатуры — никак. Кнопка открывает
 * существующий просмотрщик (files/MediaViewer.tsx, один синтезированный
 * ChatFileItem) — у него уже готовы полноэкранный режим, своя кнопка
 * «Скачать», Esc и ловушка фокуса. Рисуется порталом в document.body:
 * компонент живёт внутри <p> ленты сообщения, а у <div> там невалидная
 * разметка, да и fixed внутри трансформированного предка (у пузыря сообщения
 * такие бывают) поехал бы мимо экрана.
 *
 * При закрытии (Esc или «Закрыть») фокус возвращается на кнопку-картинку, а
 * не на ссылку «Скачать»: открывали просмотр с кнопки, туда и должен
 * вернуться фокус.
 *
 * Ссылка — обычная ссылка на файл: скачивание — её прямой смысл, поэтому
 * без preventDefault/обработчика ОТКРЫТИЯ (в отличие от прочих ссылок чата,
 * которые решают, что открыть, сами). onClick на ней — только статистика
 * (onDownload), навигацию он не трогает.
 *
 * not-prose — иначе `prose-sm img` даёт картинке лишние ~24px отступов.
 * ym-hide-content — на обёртке (медиа-компоненты в проекте несут класс сами,
 * а не ждут его от родителя), ym-disable-tracklink — на ссылке, мимо
 * «Внешних переходов» Метрики: адреса файлов переписки личные
 * (webvisorPrivacy.test.ts).
 *
 * Примечание: при перемонтировании пузыря сообщения (стрим → история —
 * ChatInterface заменяет временное сообщение историей с бэка после конца
 * хода) открытый просмотр закроется вместе со старым экземпляром компонента
 * (размонтирование снимает портал). Это приемлемо: ссылки на файлы
 * дописываются в самом конце хода, открыть картинку и успеть попасть на
 * именно этот стык — исключительный случай, не стоящий сохранения состояния
 * просмотра через remount.
 */
const ChatImageAttachment: React.FC<{
  url: string;
  name: string;
  children: React.ReactNode;
  /**
   * Нажали «Скачать» — ссылку прямо в ленте (без клика по картинке — основной
   * путь на телефоне) или кнопку внутри просмотрщика — оба места шлют
   * одно и то же, для статистики (ChatInterface шлёт chat_files_download).
   */
  onDownload?: () => void;
}> = ({ url, name, children, onDownload }) => {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const imgButtonRef = useRef<HTMLButtonElement>(null);

  // items — стабильная ссылка на url/name: иначе новый массив на каждый
  // рендер (стрим дописывает текст в тот же пузырь) заставлял бы MediaViewer
  // пересчитывать hasPrev/hasNext от нового items, хотя сам файл тот же.
  const items = useMemo<ChatFileItem[]>(() => {
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    return [{ key: url, kind: 'image', url, name, ext, createdAt: '', messageId: 0, stored: true }];
  }, [url, name]);

  const handleClose = useCallback(() => {
    setViewerOpen(false);
    imgButtonRef.current?.focus();
  }, []);

  return (
    <span className="not-prose ym-hide-content block my-2" data-testid="chat-image-attachment">
      {!broken && (
        <button
          ref={imgButtonRef}
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={`${t('chat.files.image')}: ${name}`}
          className="block cursor-zoom-in"
        >
          <img
            src={url}
            alt={name}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="block rounded-xl max-h-72 sm:max-h-96 max-w-full object-contain bg-gray-50"
          />
        </button>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        // onDownload — без preventDefault: ссылка открывает файл как обычно
        // (её прямой смысл), колбэк только отправляет статистику рядом.
        onClick={() => onDownload?.()}
        // [overflow-wrap:anywhere] — длинное имя файла без пробелов (хэш,
        // slug) на узком экране иначе распирает пузырь и ленту горизонтальной
        // прокруткой; break-words не ловит непрерывную строку без пробелов.
        className="ym-disable-tracklink mt-1 inline-block [overflow-wrap:anywhere] text-forest-600 hover:text-forest-700 underline"
      >
        {children}
      </a>
      {viewerOpen &&
        createPortal(
          <MediaViewer
            items={items}
            index={0}
            onIndexChange={noop}
            onClose={handleClose}
            onDownload={onDownload}
          />,
          document.body,
        )}
    </span>
  );
};

export default ChatImageAttachment;
