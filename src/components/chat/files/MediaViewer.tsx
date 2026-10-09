import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import type { ChatFileItem } from './chatFiles';
import { trapTab } from './focusTrap';

interface Props {
  /** Только сохранённые медиа: у них есть адрес. */
  items: ChatFileItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Картинка или видео на весь экран: «Скачать», «Закрыть», стрелки и клавиатура. */
const MediaViewer: React.FC<Props> = ({ items, index, onIndexChange, onClose }) => {
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
        <a
          href={item.url}
          download={item.name}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
        >
          <Download className="h-4 w-4" />
          {t('chat.files.download')}
        </a>
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
          берём его; на обычном экране safe-area равен 0, остаётся 1.5rem. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {item.kind === 'video' ? (
          <video key={item.key} src={item.url} controls autoPlay className="max-h-full max-w-full" />
        ) : (
          <img src={item.url} alt={item.name} className="max-h-full max-w-full object-contain" />
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
    </div>
  );
};

export default MediaViewer;
