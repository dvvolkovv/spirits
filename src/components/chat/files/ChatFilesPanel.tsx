import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  ArrowLeft, Download, File, FileArchive, FileAudio, FileCode, FileSpreadsheet, FileText, ImageOff, Play,
  Presentation, X,
} from 'lucide-react';
import MediaViewer from './MediaViewer';
import {
  ChatFileItem, FileIconKind, FilesTab, fetchChatFiles, fileIconKind, groupByMonth, splitTab, startTab,
} from './chatFiles';

interface Props {
  assistantId: string | number;
  /** Метка «Чистого листа»: панель показывает ту переписку, что на экране. */
  freshTs?: string | null;
  onClose: () => void;
}

/** Один общий tabpanel на обе вкладки — контент каждой вкладки не живёт отдельным DOM-узлом. */
const TABPANEL_ID = 'chat-files-tabpanel';

const ICONS: Record<FileIconKind, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  archive: FileArchive,
  code: FileCode,
  audio: FileAudio,
  other: File,
};

/**
 * «Медиа и файлы» переписки с ассистентом — как раздел медиа в Telegram.
 * Список строит бэк из текста истории (GET /webhook/chat/files), поэтому в
 * панели ровно то, что есть в ленте, включая старую историю.
 */
const ChatFilesPanel: React.FC<Props> = ({ assistantId, freshTs, onClose }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'ru';
  const [items, setItems] = useState<ChatFileItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<FilesTab | null>(null);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Миниатюры, у которых <img> отдал 'error' (адрес протух/404) — рисуем
  // заглушку вместо штатной «битой картинки» браузера.
  const [brokenKeys, setBrokenKeys] = useState<ReadonlySet<string>>(new Set());
  // Esc при открытом просмотре закрывает просмотр (MediaViewer), а не панель.
  // Ref, а не состояние: оба обработчика срабатывают на одно и то же нажатие,
  // и к моменту проверки здесь просмотр ещё не успел закрыться.
  const viewerOpen = useRef(false);
  viewerOpen.current = viewerIndex !== null;

  // Плитка, что открыла просмотр, — чтобы вернуть на неё фокус при закрытии
  // (MediaViewer.tsx). Не React-ref на элемент списка: достаточно узла из
  // currentTarget клика, список плиток между открытием и закрытием не меняется.
  const lastTileRef = useRef<HTMLButtonElement | null>(null);

  // Фокус-ловушка: без неё Tab после открытия панели уходит на кнопки под
  // подложкой («Перегенерировать» и т. п.), а Enter там — например, сбрасывает
  // последний ответ и шлёт запрос заново, тратя токены.
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      const el = previouslyFocused.current;
      if (el instanceof HTMLElement && document.contains(el)) el.focus();
    };
  }, []);

  // onClose меняет identity на каждый ререндер родителя (ChatInterface передаёт
  // инлайн-функцию, а баланс токенов перерисовывает его каждые 5 с). Если
  // подписка ниже зависит от onClose, такой ререндер снимает и ставит
  // слушателя keydown заново — тот уезжает в конец списка слушателей window,
  // после слушателя MediaViewer, и один Esc закрывает и просмотр, и панель.
  // Держим актуальный onClose в ref и подписываемся один раз.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const load = useCallback(async () => {
    setError(false);
    setItems(null);
    try {
      const list = await fetchChatFiles(assistantId, freshTs);
      setItems(list);
      setTab((cur) => cur ?? startTab(list));
    } catch {
      setError(true);
    }
  }, [assistantId, freshTs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented — MediaViewer уже обработал этот Esc (закрыл просмотр).
      if (e.key === 'Escape' && !e.defaultPrevented && !viewerOpen.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      // Живой querySelectorAll, а не запомненный список: содержимое меняется
      // (вкладки, открытие просмотра), список должен быть всегда актуальным.
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], video, [tabindex]:not([tabindex="-1"])'),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current: FilesTab = tab ?? 'media';
  const media = splitTab(items ?? [], 'media');
  const files = splitTab(items ?? [], 'files');
  const view = current === 'media' ? media : files;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      // z-[60], а не z-50: нижняя мобильная навигация (Navigation.tsx) тоже
      // z-50 и позже в DOM, без [60] она перекрывает низ панели и просмотра.
      className="fixed inset-0 z-[60] flex justify-end outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.files.title')}
      data-testid="chat-files-panel"
    >
      <div className="absolute inset-0 hidden bg-black/30 sm:block" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white sm:w-[420px] sm:shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.files.back')}
            title={t('chat.files.back')}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 sm:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="flex-1 text-base font-semibold text-gray-900">{t('chat.files.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.files.close')}
            title={t('chat.files.close')}
            className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 sm:block"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-200" role="tablist">
          {(['media', 'files'] as FilesTab[]).map((name) => {
            const count = (name === 'media' ? media : files).stored.length;
            return (
              <button
                key={name}
                id={`chat-files-tab-${name}`}
                type="button"
                role="tab"
                // tab (а не current — у него уже дефолт 'media'): до первого
                // ответа API ни одна вкладка не выбрана, а не «Медиа» поверх
                // скелетона, которая следом может дёрнуться на «Файлы».
                aria-selected={tab === name}
                aria-controls={TABPANEL_ID}
                onClick={() => {
                  setTab(name);
                  setShowUnsaved(false);
                }}
                className={clsx(
                  'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                  tab === name ? 'border-b-2 border-forest-600 text-forest-700' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t(name === 'media' ? 'chat.files.tab_media' : 'chat.files.tab_files')}
                {items && count > 0 ? ` · ${count}` : ''}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={TABPANEL_ID}
          aria-labelledby={`chat-files-tab-${current}`}
          className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        >
          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-sm text-gray-500">{t('chat.files.load_error')}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('chat.files.retry')}
              </button>
            </div>
          ) : items === null ? (
            <div className="grid grid-cols-3 gap-1 p-1" aria-hidden="true" data-testid="chat-files-skeleton">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="aspect-square animate-pulse bg-gray-100" />
              ))}
            </div>
          ) : view.stored.length === 0 && view.unsaved.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-gray-400">
              {t(current === 'media' ? 'chat.files.empty_media' : 'chat.files.empty_files')}
            </p>
          ) : (
            <>
              {groupByMonth(view.stored, lang).map((g) => (
                <section key={g.key}>
                  <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</h3>
                  {current === 'media' ? (
                    <div className="grid grid-cols-3 gap-1 px-1">
                      {g.items.map((it) => (
                        <button
                          key={it.key}
                          type="button"
                          onClick={(e) => {
                            lastTileRef.current = e.currentTarget;
                            setViewerIndex(media.stored.indexOf(it));
                          }}
                          aria-label={`${t(it.kind === 'video' ? 'chat.files.video' : 'chat.files.image')}: ${it.name}`}
                          className="relative aspect-square overflow-hidden bg-gray-100"
                        >
                          {it.kind === 'video' && !it.thumbUrl ? (
                            <div className="h-full w-full bg-gray-800" />
                          ) : brokenKeys.has(it.key) ? (
                            <div
                              className="flex h-full w-full items-center justify-center bg-gray-200"
                              data-testid="chat-files-broken-thumb"
                            >
                              <ImageOff className="h-6 w-6 text-gray-400" aria-hidden="true" />
                            </div>
                          ) : (
                            <img
                              src={it.kind === 'video' ? it.thumbUrl : it.url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                              onError={() => setBrokenKeys((prev) => new Set(prev).add(it.key))}
                            />
                          )}
                          {it.kind === 'video' && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Play className="h-8 w-8 text-white drop-shadow" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <ul>
                      {g.items.map((it) => {
                        const Icon = ICONS[fileIconKind(it)];
                        return (
                          <li key={it.key}>
                            <a
                              href={it.url}
                              download={it.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
                            >
                              <Icon className="h-8 w-8 flex-shrink-0 text-forest-600" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-gray-900">{it.name}</span>
                                <span className="block text-xs text-gray-500">
                                  {new Date(it.createdAt).toLocaleDateString(lang)}
                                </span>
                              </span>
                              <Download className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}

              {view.unsaved.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowUnsaved((v) => !v)}
                    aria-expanded={showUnsaved}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    {t('chat.files.unsaved', { n: view.unsaved.length })}
                  </button>
                  {showUnsaved && (
                    <div className="mt-2">
                      <p className="mb-2 text-xs text-gray-400">{t('chat.files.unsaved_hint')}</p>
                      <ul className="space-y-1">
                        {view.unsaved.map((it) => (
                          <li key={it.key} className="truncate text-sm text-gray-400">
                            {it.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {viewerIndex !== null && (
        <MediaViewer
          items={media.stored}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => {
            setViewerIndex(null);
            lastTileRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};

export default ChatFilesPanel;
