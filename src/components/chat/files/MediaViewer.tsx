import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, File as FileIcon, Trash2, X } from 'lucide-react';
import { isUploadItem, uploadViewerPath, type ChatFileItem, type ChatFileKind } from './chatFiles';
import { trapTab } from './focusTrap';
import { openChatUpload } from '../chatUploads';
import { useAuthedBlob } from './useAuthedBlobUrl';

interface Props {
  /** Только сохранённые медиа: у них есть адрес. */
  items: ChatFileItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Нажали «Скачать» — для статистики (ChatInterface шлёт событие). */
  onDownload?: (kind: ChatFileKind) => void;
  /**
   * «Удалить» у загрузки пользователя (origin === 'upload'). Подтверждение,
   * запрос и уборку списка делает вызывающий (ChatFilesPanel). Без пропа
   * кнопки нет: просмотр картинки из ленты (ChatImageAttachment) ничего не удаляет.
   */
  onDelete?: (item: ChatFileItem) => void;
  /** DELETE показанного файла в пути: «Удалить» disabled и aria-busy. */
  deleting?: boolean;
}

/** Картинка или видео на весь экран: «Скачать», «Закрыть», стрелки и клавиатура. */
const MediaViewer: React.FC<Props> = ({ items, index, onIndexChange, onClose, onDownload, onDelete, deleting = false }) => {
  const { t } = useTranslation();
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Свой корень для ловушки Tab/Shift+Tab: ChatFilesPanel рисует просмотр
  // внутри собственного dialogRef, и ловушка панели нарочно бездействует,
  // пока просмотр открыт (ChatFilesPanel.tsx) — иначе Tab утекал бы на её
  // «Назад»/«Закрыть» под опаской подложкой.
  const rootRef = useRef<HTMLDivElement>(null);
  // Загрузка пользователя лежит в приватном бакете: картинка с сырым адресом
  // без JWT получила бы 401, поэтому её берём через apiClient в blob.
  // Хук стоит до раннего return ниже: порядок хуков не должен зависеть от item.
  // isUploadItem: origin 'upload' или приватный адрес без origin (защита).
  const isUpload = !!item && isUploadItem(item);
  // Видео-загрузку (до 100 МБ) целиком в память браузера не тянем: вместо
  // плеера — название и «Скачать». Картинки идут в blob, они небольшие.
  const uploadVideo = isUpload && item?.kind === 'video';
  // Оригинал, если браузер его покажет, иначе миниатюра (TIFF). Нет ни того,
  // ни другого (HEIC без миниатюры) — значок файла с именем и «Скачать».
  const uploadPath = isUpload && item && !uploadVideo ? uploadViewerPath(item) : undefined;
  const { url: blobSrc, failed: blobFailed } = useAuthedBlob(uploadPath);
  // Картинка-загрузка, которую браузер не нарисовал (onError у <img>): битый
  // файл или формат не тот, что в расширении. По ключу — у соседнего файла,
  // открытого стрелкой, своя попытка.
  const [brokenKey, setBrokenKey] = useState<string | null>(null);
  // Загрузка не удалась (404, сеть) или картинка не нарисовалась — тоже значок
  // с именем и «Скачать»: иначе индикатор крутился бы бесконечно.
  const uploadFileOnly =
    isUpload && !uploadVideo && (!uploadPath || blobFailed || (!!item && brokenKey === item.key));
  const mediaSrc = isUpload ? blobSrc : item?.url;

  // Один раз на открытие (не на каждую навигацию ← →): иначе «Закрыть»
  // перехватывал бы фокус у пользователя при каждом нажатии стрелки.
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // preventDefault — сигнал панели «Медиа и файлы» (ChatFilesPanel), что
        // этот Esc уже обработан здесь: иначе то же нажатие при переподписке
        // её обработчика закрывает и просмотр, и панель одним Esc.
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const root = rootRef.current;
        if (root) trapTab(root, e);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Alt/Ctrl/Meta/Shift+стрелка — чужая горячая клавиша (навигация
      // браузера, расширения и т. п.), не листание просмотра.
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Стрелка с фокусом на <video> — родная перемотка плеера. <audio> сюда
      // не попадает: items — это media.stored из ChatFilesPanel.tsx, а туда
      // splitTab() с isMedia() пускает только kind 'image'|'video', просмотр
      // аудио не рисует вовсе.
      if (e.target instanceof HTMLVideoElement) return;
      if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onClose, onIndexChange]);

  if (!item?.url) return null;
  const url = item.url;

  return (
    <div
      ref={rootRef}
      // ym-hide-content: вебвизор не записывает имя и содержимое файла
      // переписки (решение владельца 09.10.2026).
      className="ym-hide-content fixed inset-0 z-[60] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      data-testid="media-viewer"
    >
      <div className="flex items-center justify-end gap-2 p-3">
        {isUpload ? (
          // Приватный адрес: ссылка с href вернула бы 401 (браузер не шлёт
          // JWT) — скачиваем через openChatUpload, как вложения в ленте.
          <button
            type="button"
            onClick={() => {
              onDownload?.(item.kind);
              void openChatUpload(url, t('chat.upload_download_error'), item.name);
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
          >
            <Download className="h-4 w-4" />
            {t('chat.files.download')}
          </button>
        ) : (
          <a
            href={item.url}
            download={item.name}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onDownload?.(item.kind)}
            // ym-disable-tracklink: адрес файла переписки личный, мимо
            // «Внешних переходов» Метрики (webvisorPrivacy.test.ts).
            className="ym-disable-tracklink flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
          >
            <Download className="h-4 w-4" />
            {t('chat.files.download')}
          </a>
        )}
        {isUpload && onDelete && item.uploadId && (
          <button
            type="button"
            onClick={() => onDelete(item)}
            disabled={deleting}
            aria-busy={deleting || undefined}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {t('chat.files.delete')}
          </button>
        )}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label={t('chat.files.close')}
          title={t('chat.files.close')}
          className="rounded-lg p-2 text-white hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {/* max(): iPhone с «чёлкой»/индикатором даёт safe-area больше 1.5rem —
          берём его; на обычном экране safe-area равен 0, остаётся 1.5rem.
          px-12 — только когда есть стрелки (несколько файлов): при одном
          файле стрелок нет, а те же поля на телефоне делали «полноэкранный»
          просмотр мельче, чем картинка в самой ленте. */}
      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center pb-[max(1.5rem,env(safe-area-inset-bottom))] ${
          items.length > 1 ? 'px-12' : 'px-2'
        }`}
      >
        {uploadVideo ? (
          // Видео-загрузка: без плеера, скачать — кнопкой «Скачать» в шапке.
          <div className="flex flex-col items-center gap-2 text-white" data-testid="media-viewer-upload-video">
            <span className="text-sm opacity-70">{t('chat.files.video')}</span>
            <span className="max-w-full break-words text-center text-base">{item.name}</span>
          </div>
        ) : uploadFileOnly ? (
          // Картинка, которую браузер не покажет (HEIC) или что не загрузилась:
          // значок файла с именем, скачать — кнопкой «Скачать» в шапке.
          <div className="flex flex-col items-center gap-2 text-white" data-testid="media-viewer-upload-file">
            <FileIcon className="h-12 w-12 opacity-70" aria-hidden="true" />
            <span className="max-w-full break-words text-center text-base">{item.name}</span>
          </div>
        ) : !mediaSrc ? (
          // Загрузка ещё едет в blob — индикатор вместо картинки без src,
          // которую браузер рисует «битой». role=status и скрытый текст —
          // чтобы диктор сказал «Загрузка», а не промолчал.
          <div role="status" data-testid="media-viewer-loading">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white"
              aria-hidden="true"
            />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : item.kind === 'video' ? (
          <video key={item.key} src={mediaSrc} controls autoPlay className="max-h-full max-w-full" />
        ) : (
          <img
            src={mediaSrc}
            alt={item.name}
            className="max-h-full max-w-full object-contain"
            onError={isUpload ? () => setBrokenKey(item.key) : undefined}
          />
        )}
        {hasPrev && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            aria-label={t('chat.files.prev')}
            title={t('chat.files.prev')}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            aria-label={t('chat.files.next')}
            title={t('chat.files.next')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      {item.note ? (
        // Полный комментарий ассистента к загрузке; в плитке панели он обрезан до двух строк.
        <div
          className="max-h-[30vh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-white/90"
          data-testid="media-viewer-note"
        >
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-white/60">{t('chat.files.note_label')}</p>
          <p className="whitespace-pre-wrap break-words">{item.note}</p>
        </div>
      ) : null}
    </div>
  );
};

export default MediaViewer;
