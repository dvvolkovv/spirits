import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, File as FileIcon, Image as ImageIcon, Play, Trash2 } from 'lucide-react';
import { uploadTilePath, type ChatFileItem } from './chatFiles';
import { useAuthedBlobUrl } from './useAuthedBlobUrl';

/*
 * Плитки загрузок пользователя (origin === 'upload') для панели «Медиа и файлы»
 * (ChatFilesPanel.tsx).
 *
 * Загрузки лежат в приватном бакете. Превью идёт через useAuthedBlobUrl,
 * скачивание — через openChatUpload (его зовёт панель), оба с JWT. Поэтому
 * здесь нет ни картинок с сырым адресом, ни ссылок с href. Каждая плитка —
 * свой компонент: хук нельзя звать внутри map.
 *
 * Имена и комментарии личные: от Вебвизора их прячет ym-hide-content на корне
 * панели, внутри которого плитки только и рисуются (webvisorPrivacy.test.ts).
 *
 * Что показывать превью, решают uploadTilePath/uploadViewerPath (chatFiles.ts):
 * в этом файле — только компоненты (правило react-refresh).
 */

/**
 * Плитка у видимой области (с запасом 200px): до этого превью не качаем.
 * root — прокручиваемый контейнер (вкладка панели): с корнем по умолчанию
 * (окно) запас не работал бы, ведь прокручивается не окно. Пока контейнера
 * нет, корень — окно.
 */
function useNearViewport<T extends Element>(root: Element | null): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  // Без IntersectionObserver (jsdom, старые WebView) качаем сразу.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root, rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, root]);
  return [ref, near];
}

interface MediaTileProps {
  item: ChatFileItem;
  /** Открыть просмотр. Плитка передаёт себя, чтобы панель потом вернула на неё фокус. */
  onOpen: (tile: HTMLButtonElement) => void;
  /** «Скачать» у картинки без превью (HEIC; большой оригинал без миниатюры). */
  onDownload: () => void;
  /** Прокручиваемый контейнер плиток — корень IntersectionObserver. */
  scrollRoot?: Element | null;
}

/** Плитка «Медиа»: превью из blob, пометка источника, комментарий в две строки. */
export const UploadMediaTile: React.FC<MediaTileProps> = ({ item, onOpen, onDownload, scrollRoot = null }) => {
  const { t } = useTranslation();
  const [ref, near] = useNearViewport<HTMLDivElement>(scrollRoot);
  const previewPath = uploadTilePath(item);
  // Картинка без превью — значок файла с именем, как у документа, и «Скачать».
  const fileOnly = item.kind === 'image' && !previewPath;
  const src = useAuthedBlobUrl(previewPath, near);
  // Файл повреждён или формат не тот, что в расширении, — значок вместо «битой картинки».
  const [broken, setBroken] = useState(false);
  const badge = item.source === 'telegram' ? t('chat.files.from_telegram') : t('chat.files.uploaded_by_you');
  return (
    <div ref={ref} className="flex min-w-0 flex-col" data-testid="chat-files-upload-tile">
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        aria-label={`${t(item.kind === 'video' ? 'chat.files.video' : 'chat.files.image')}: ${item.name}`}
        className="relative aspect-square w-full overflow-hidden bg-gray-100"
      >
        {src && !broken ? (
          <img src={src} alt="" decoding="async" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : item.kind === 'video' ? (
          <div className="h-full w-full bg-gray-800" />
        ) : fileOnly ? (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1 px-2"
            data-testid="chat-files-upload-file"
          >
            <FileIcon className="h-8 w-8 flex-shrink-0 text-forest-600" aria-hidden="true" />
            <span className="line-clamp-2 w-full break-words text-center text-[11px] leading-tight text-gray-700">
              {item.name}
            </span>
          </div>
        ) : (
          // Файл ещё едет или не загрузился — хук эти случаи не различает,
          // нейтральный значок годится для обоих.
          <div className="flex h-full w-full items-center justify-center" data-testid="chat-files-upload-placeholder">
            <ImageIcon className="h-6 w-6 text-gray-300" aria-hidden="true" />
          </div>
        )}
        {item.kind === 'video' && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Play className="h-8 w-8 text-white drop-shadow" />
          </span>
        )}
        <span className="pointer-events-none absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white">
          {badge}
        </span>
      </button>
      {fileOnly ? (
        <button
          type="button"
          onClick={onDownload}
          aria-label={`${t('chat.files.download')}: ${item.name}`}
          className="flex items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-medium text-forest-700 hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {t('chat.files.download')}
        </button>
      ) : null}
      {item.note ? (
        <p
          className="line-clamp-2 break-words px-1 pb-1 pt-0.5 text-[11px] leading-snug text-gray-600"
          data-testid="chat-files-note"
        >
          {item.note}
        </p>
      ) : null}
    </div>
  );
};

interface FileRowProps {
  item: ChatFileItem;
  icon: React.ComponentType<{ className?: string }>;
  lang: string;
  onDownload: () => void;
  onDelete: () => void;
}

/** Строка «Файлы»: скачать (вся строка) и корзина; дата, пометка, комментарий в две строки. */
export const UploadFileRow: React.FC<FileRowProps> = ({ item, icon: Icon, lang, onDownload, onDelete }) => {
  const { t } = useTranslation();
  const badge = item.source === 'telegram' ? t('chat.files.from_telegram') : t('chat.files.uploaded_by_you');
  return (
    <li className="flex items-start" data-testid="chat-files-upload-row">
      <button
        type="button"
        onClick={onDownload}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
      >
        <Icon className="h-8 w-8 flex-shrink-0 text-forest-600" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-gray-900">{item.name}</span>
          <span className="block truncate text-xs text-gray-500">
            {new Date(item.createdAt).toLocaleDateString(lang)} · {badge}
          </span>
          {item.note ? (
            // Без block: вместе с line-clamp-2 он ломает обрезку (block в CSS идёт позже).
            <span className="mt-0.5 line-clamp-2 break-words text-xs text-gray-600" data-testid="chat-files-note">
              {item.note}
            </span>
          ) : null}
        </span>
        <Download className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${t('chat.files.delete')}: ${item.name}`}
        title={t('chat.files.delete')}
        className="mr-2 mt-2.5 flex-shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
};
