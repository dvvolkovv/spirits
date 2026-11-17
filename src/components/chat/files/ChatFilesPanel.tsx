import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Download, File, FileArchive, FileAudio, FileCode, FileSpreadsheet, FileText, ImageOff, Play,
  Presentation, X,
} from 'lucide-react';
import MediaViewer from './MediaViewer';
import { UploadFileRow, UploadMediaTile } from './UploadItems';
import {
  ChatFileItem, ChatFileKind, FileIconKind, FilesTab, deleteChatUpload, fetchChatFiles, fileIconKind, groupByMonth,
  isUploadItem, splitTab, startTab, thumbUrlFor,
} from './chatFiles';
import { openChatUpload } from '../chatUploads';
import { trapTab } from './focusTrap';

interface Props {
  assistantId: string | number;
  onClose: () => void;
  /**
   * Скачали файл — для статистики: из списка «Файлы» (list), из просмотра
   * (viewer) или кнопкой под плиткой загрузки без превью в «Медиа» (grid).
   */
  onDownload?: (kind: ChatFileKind, from: 'list' | 'viewer' | 'grid') => void;
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
 * Список строит бэк (GET /webhook/chat/files). Файлы ассистента берутся из
 * текста истории, включая старую; загрузки пользователя (origin === 'upload') —
 * из реестра chat_uploads. Загрузки приватные: превью и скачивание идут с JWT
 * (UploadItems.tsx), удалить их может только сам пользователь.
 */
const ChatFilesPanel: React.FC<Props> = ({ assistantId, onClose, onDownload }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'ru';
  const [items, setItems] = useState<ChatFileItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<FilesTab | null>(null);
  const [showUnsaved, setShowUnsaved] = useState(false);
  // Ключ файла в просмотре, а не индекс: удаление соседнего файла сдвигает
  // индексы, а просмотр должен остаться на своём файле.
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  // Свежий ключ для removeUpload: ответ DELETE приходит позже, а пользователь
  // за это время мог листнуть просмотр на другой файл.
  const viewerKeyRef = useRef<string | null>(null);
  viewerKeyRef.current = viewerKey;
  // Миниатюры, у которых <img> отдал 'error' (адрес протух/404) — рисуем
  // заглушку вместо штатной «битой картинки» браузера.
  const [brokenKeys, setBrokenKeys] = useState<ReadonlySet<string>>(new Set());
  // Миниатюра не загрузилась — плитка пробует оригинал, и только потом значок.
  const [thumbFailedKeys, setThumbFailedKeys] = useState<ReadonlySet<string>>(new Set());
  // Esc при открытом просмотре закрывает просмотр (MediaViewer), а не панель.
  // Ref, а не состояние: оба обработчика срабатывают на одно и то же нажатие,
  // и к моменту проверки здесь просмотр ещё не успел закрыться.
  const viewerOpen = useRef(false);

  // Плитка, что открыла просмотр, — чтобы вернуть на неё фокус при закрытии
  // (MediaViewer.tsx). Не React-ref на элемент списка: достаточно узла из
  // currentTarget клика. Список может измениться, пока просмотр открыт
  // (удаление загрузки): удалили сам открытый файл — просмотр закрывает
  // removeUpload и фокус уходит в панель; удалили соседний — плитка-открыватель
  // на месте (ключи плиток стабильны). Узел, которого уже нет в документе,
  // фокус не получает — тогда тоже панель.
  const lastTileRef = useRef<HTMLButtonElement | null>(null);

  // Вкладка — прокручиваемый контейнер плиток: корень IntersectionObserver у
  // загрузок (UploadItems.tsx), чтобы запас «подошла к видимой области»
  // считался от неё, а не от окна. State, а не ref: плиткам нужен перерендер,
  // когда элемент появился.
  const [tabpanelEl, setTabpanelEl] = useState<HTMLDivElement | null>(null);

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

  // Удаление своей загрузки (DELETE /webhook/chat-uploads/:id через
  // deleteChatUpload). Замок по ключу: второе нажатие, пока первый запрос в
  // пути, не шлёт второй DELETE — тот ответил бы 404 и показал ложную ошибку.
  // Ref — замок (два клика в одном тике state ещё не видят), state — для
  // экрана: корзина и «Удалить» в просмотре на время запроса disabled и
  // aria-busy.
  const deletingRef = useRef<Set<string>>(new Set());
  const [deletingKeys, setDeletingKeys] = useState<ReadonlySet<string>>(new Set());
  const removeUpload = useCallback(
    async (it: ChatFileItem) => {
      if (!it.uploadId || deletingRef.current.has(it.key)) return;
      // Имя в вопросе: в длинном списке легко нажать не ту корзину. Подставляется
      // как есть (escapeValue: false), window.confirm — простой текст.
      if (!window.confirm(t('chat.files.delete_confirm', { name: it.name }))) return;
      deletingRef.current.add(it.key);
      setDeletingKeys((prev) => new Set(prev).add(it.key));
      try {
        await deleteChatUpload(it.uploadId);
        setItems((prev) => (prev ? prev.filter((x) => x.key !== it.key) : prev));
        // Просмотр показывал удалённый файл — закрываем его. Показывал другой
        // (листнули, пока DELETE был в пути) — остаётся на нём: индекс
        // пересчитается по ключу.
        const shown = viewerKeyRef.current;
        if (shown === it.key) setViewerKey(null);
        // Удалённой плитки или строки больше нет: фокус оставляем в панели,
        // иначе он падает на body и ловушка Tab его теряет.
        if (shown === it.key || shown === null) dialogRef.current?.focus();
      } catch {
        // Строка в базе осталась (сбой хранилища — 502), повтор безопасен.
        toast.error(t('chat.files.delete_failed'));
      } finally {
        deletingRef.current.delete(it.key);
        setDeletingKeys((prev) => {
          const next = new Set(prev);
          next.delete(it.key);
          return next;
        });
      }
    },
    [t],
  );

  // Скачивание загрузки: приватный адрес, ссылка с href вернула бы 401
  // (браузер не шлёт JWT), — поэтому через openChatUpload.
  const downloadUpload = (it: ChatFileItem, from: 'list' | 'grid') => {
    onDownload?.(it.kind, from);
    void openChatUpload(it.url as string, t('chat.upload_download_error'), it.name);
  };

  const load = useCallback(async () => {
    setError(false);
    setItems(null);
    setViewerKey(null);
    // Сбрасываем и заглушки «не загрузилась»: без этого «Повторить» с теми
    // же данными мог бы навечно держать миниатюру заглушкой, даже если
    // адрес уже ожил, — ключ в brokenKeys от прежней попытки переживал load().
    setBrokenKeys(new Set());
    setThumbFailedKeys(new Set());
    try {
      const list = await fetchChatFiles(assistantId);
      setItems(list);
      setTab((cur) => cur ?? startTab(list));
    } catch {
      setError(true);
    }
  }, [assistantId]);

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
      // Просмотр открыт — у него своя ловушка над своим корнем (MediaViewer.tsx).
      // Наш dialogRef физически содержит и узлы MediaViewer (он рисуется внутри
      // того же корня), поэтому без этой проверки наша ловушка решала бы, что
      // последний фокусируемый элемент — это элемент просмотра, и после Tab
      // отправляла бы фокус на «Назад»/«Закрыть» панели под опаской подложкой.
      if (viewerOpen.current) return;
      const root = dialogRef.current;
      if (!root) return;
      trapTab(root, e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current: FilesTab = tab ?? 'media';
  // ChatInterface перерисовывает панель каждые ~5 с (поллинг баланса
  // токенов) — без memo splitTab/groupByMonth пересчитывались бы на каждый
  // такой ререндер, хотя items не менялись.
  const media = useMemo(() => splitTab(items ?? [], 'media'), [items]);
  const files = useMemo(() => splitTab(items ?? [], 'files'), [items]);
  const view = current === 'media' ? media : files;
  // Нет файла с таким ключом (удалён, список перезагружается) — просмотр закрыт.
  const viewerIndex = viewerKey === null ? -1 : media.stored.findIndex((x) => x.key === viewerKey);
  viewerOpen.current = viewerIndex >= 0;
  const monthGroups = useMemo(() => groupByMonth(view.stored, lang), [view.stored, lang]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      // z-[60], а не z-50: нижняя мобильная навигация (Navigation.tsx) тоже
      // z-50 и позже в DOM, без [60] она перекрывает низ панели и просмотра.
      // ym-hide-content: вебвизор не записывает список файлов и медиа
      // переписки (решение владельца 09.10.2026).
      className="ym-hide-content fixed inset-0 z-[60] flex justify-end outline-none"
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
          ref={setTabpanelEl}
          role="tabpanel"
          id={TABPANEL_ID}
          // tab, не current: до первого ответа API ни одна вкладка не выбрана
          // (aria-selected тоже всюду false в этот момент) — tabpanel не
          // должен ссылаться на «Медиа» только из-за дефолта в current.
          aria-labelledby={tab ? `chat-files-tab-${tab}` : undefined}
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
              {monthGroups.map((g) => (
                <section key={g.key}>
                  <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</h3>
                  {current === 'media' ? (
                    <div className="grid grid-cols-3 gap-1 px-1">
                      {g.items.map((it) =>
                        isUploadItem(it) ? (
                          <UploadMediaTile
                            key={it.key}
                            item={it}
                            onOpen={(tile) => {
                              lastTileRef.current = tile;
                              setViewerKey(it.key);
                            }}
                            onDownload={() => downloadUpload(it, 'grid')}
                            scrollRoot={tabpanelEl}
                          />
                        ) : (
                        <button
                          key={it.key}
                          type="button"
                          onClick={(e) => {
                            lastTileRef.current = e.currentTarget;
                            setViewerKey(it.key);
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
                            (() => {
                              const useThumb = it.kind === 'image' && !!it.thumbPath && !thumbFailedKeys.has(it.key);
                              return (
                                <img
                                  src={it.kind === 'video' ? it.thumbUrl : useThumb ? thumbUrlFor(it.thumbPath as string) : it.url}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                  onError={() =>
                                    useThumb
                                      ? setThumbFailedKeys((prev) => new Set(prev).add(it.key))
                                      : setBrokenKeys((prev) => new Set(prev).add(it.key))
                                  }
                                />
                              );
                            })()
                          )}
                          {it.kind === 'video' && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Play className="h-8 w-8 text-white drop-shadow" />
                            </span>
                          )}
                        </button>
                        ),
                      )}
                    </div>
                  ) : (
                    <ul>
                      {g.items.map((it) => {
                        const Icon = ICONS[fileIconKind(it)];
                        if (isUploadItem(it)) {
                          return (
                            <UploadFileRow
                              key={it.key}
                              item={it}
                              icon={Icon}
                              lang={lang}
                              onDownload={() => downloadUpload(it, 'list')}
                              onDelete={() => void removeUpload(it)}
                              deleting={deletingKeys.has(it.key)}
                            />
                          );
                        }
                        return (
                          <li key={it.key}>
                            <a
                              href={it.url}
                              download={it.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => onDownload?.(it.kind, 'list')}
                              // ym-disable-tracklink: адрес файла переписки личный,
                              // мимо «Внешних переходов» Метрики (webvisorPrivacy.test.ts).
                              className="ym-disable-tracklink flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
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

      {viewerIndex >= 0 && (
        <MediaViewer
          items={media.stored}
          index={viewerIndex}
          onIndexChange={(i) => setViewerKey(media.stored[i]?.key ?? null)}
          onClose={() => {
            setViewerKey(null);
            const tile = lastTileRef.current;
            if (tile?.isConnected) tile.focus();
            else dialogRef.current?.focus();
          }}
          onDownload={(kind) => onDownload?.(kind, 'viewer')}
          onDelete={(it) => void removeUpload(it)}
          deleting={viewerKey !== null && deletingKeys.has(viewerKey)}
        />
      )}
    </div>
  );
};

export default ChatFilesPanel;
