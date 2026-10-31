import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight, Loader } from 'lucide-react';
import ShortActions from './ShortActions';
import {
  ANGLE_TITLES, ActionExtra, FORMAT_TITLES, PLATFORM_TITLES, ROW_ACTIONS, RUBRIC_TITLES, STATUS_TITLES,
  ShortAction, ShortDetail, ShortItem, publicationLabel, shortTitle, statusLine, statusTone,
} from './shortStatus';
import { DANGER, PRIMARY } from './shortButtons';
import { safeExternalUrl } from '../../utils/safeUrl';

interface Props {
  item: ShortItem;
  assistantName: string | null;
  open: boolean;
  detail: ShortDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  busy: boolean;
  now: Date;
  onToggle: () => void;
  onAction: (kind: ShortAction, extra?: ActionExtra) => void;
}

/** Видео ролика: файл грузится только по нажатию (preload="none"); не загрузилось — ссылка на файл. */
const ShortVideo: React.FC<{ detail: ShortDetail }> = ({ detail }) => {
  const [broken, setBroken] = useState(false);
  if (!detail.videoUrl) {
    // У идеи видео не будет никогда, у отклонённой без сборки — тоже: вместо
    // пустой фразы — полный текст заказа (тема или история кейса), иначе
    // владелец не видит его нигде.
    if ((detail.status === 'idea' || detail.status === 'rejected') && detail.topicHint) {
      return (
        <div data-testid={`short-idea-order-${detail.id}`} className="text-xs text-gray-700 whitespace-pre-wrap break-words">
          {detail.topicHint}
        </div>
      );
    }
    // Отклонённый без темы (её нет и показать нечего) больше не соберётся
    // никогда — «ещё нет» звучит как обещание, которого не будет.
    if (detail.status === 'rejected') return <div className="text-xs text-gray-500">Видео нет.</div>;
    return <div className="text-xs text-gray-500">Видео ещё нет — ролик не собран.</div>;
  }
  if (broken) {
    return (
      <div data-testid={`short-video-broken-${detail.id}`} className="text-xs text-gray-600">
        Видео недоступно.{' '}
        <a href={detail.videoUrl} target="_blank" rel="noreferrer" className="underline text-forest-700">
          Открыть файл
        </a>
      </div>
    );
  }
  return (
    <video
      data-testid={`short-video-${detail.id}`}
      src={detail.videoUrl}
      poster={detail.coverUrl ?? undefined}
      controls
      playsInline
      preload="none"
      onError={() => setBroken(true)}
      className="w-full max-w-[220px] aspect-[9/16] rounded bg-black"
    />
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-xs text-gray-500">{label}</div>
    <div className="whitespace-pre-wrap break-words">{children}</div>
  </div>
);

/**
 * Ролик в списке: свёрнутая строка — статус, что за ролик и когда; по клику —
 * видео, подпись в канал, сценарий и кнопки. Подробности — только по клику:
 * в разделах админки владелец ждёт итогов, а не ленты подробностей.
 */
const ShortCard: React.FC<Props> = ({
  item, assistantName, open, detail, detailLoading, detailError, busy, now, onToggle, onAction,
}) => {
  const broken = item.status === 'failed';
  /**
   * Идеи заводятся с плейсхолдером `angle: 'calm'` — настоящую подачу ставит
   * только `start` (он же выставляет `slotAt`). У идеи плейсхолдер ещё
   * СТАНЕТ решением — отсюда «подача по ритму недели» (ролик и впрямь
   * пойдёт в работу по ритму). Отклонённый ролик без `slotAt` (и без явно
   * заданной `angleLocked`) не прошёл `start` — его «подача» решением уже
   * не станет никогда, и «по ритму недели» тут читалось бы так, будто ролик
   * всё ещё выйдет по расписанию; вместо лжи — не показываем подачу вовсе
   * (`meta` сама отбрасывает пустые части). Запущенный и потом отклонённый
   * ролик (`slotAt` есть) или идея/отказ с `angleLocked` — показывают
   * настоящую подачу (`ANGLE_TITLES`).
   */
  const angle = item.status === 'idea' && !item.angleLocked
    ? 'подача по ритму недели'
    : item.status === 'rejected' && !item.slotAt && !item.angleLocked
      ? null
      : ANGLE_TITLES[item.angle];
  const meta = [RUBRIC_TITLES[item.rubric], angle, assistantName, FORMAT_TITLES[item.format]].filter(Boolean).join(' · ');
  const stats = detail
    ? [
        detail.durationMs ? `${Math.round(detail.durationMs / 1000)} с` : null,
        detail.animation?.omniSeconds ? `Omni: ${detail.animation.omniSeconds} с` : null,
        detail.attempts ? `попыток: ${detail.attempts}` : null,
      ].filter(Boolean).join(' · ')
    : '';
  /**
   * Плашка «изменился, пока было открыто» — только если СТРОКА (список)
   * новее самой карточки. Сравнение одних версий (`item.version !==
   * detail.version`) ловило и обратный случай: список устарел ДО раскрытия
   * (фоновая задача уже изменила ролик), а `get` при раскрытии принёс уже
   * свежие данные — плашка лгала, будто ролик изменился ПОСЛЕ открытия.
   * Карточка новее строки или они совпадают — плашки нет.
   */
  const rowNewer = detail ? Date.parse(item.updatedAt ?? '') > Date.parse(detail.updatedAt ?? '') : false;
  /**
   * Кнопки строки — из ROW_ACTIONS по статусу СТРОКИ, не хардкодом (сейчас
   * это «Запустить сейчас» и «Отклонить» у идеи). Раскрытая карточка могла
   * обогнать строку — например, фоновый автозапуск сменил статус идеи, пока
   * карточка была открыта на старом ответе `list`; тогда ShortActions уже
   * рисует свои кнопки по detail.status, и кнопки строки, подписанные чужим
   * (устаревшим) статусом, — не показываем, чтобы не дублировать и не слать
   * действие идеи на то, что идеей уже не является.
   */
  const rowActions = ROW_ACTIONS[item.status] ?? [];
  const rowActionsStale = open && detail != null && detail.status !== item.status;
  /**
   * Кнопки строки пропали (rowActionsStale) — владельцу нужно знать, почему,
   * а не молчать: короткая строка с актуальным статусом карточки вместо
   * исчезнувших кнопок. Но не тогда, когда виновата СТРОКА (rowNewer,
   * список обновился позже раскрытия) — про это уже говорит своя плашка
   * внутри открытой карточки (`short-stale-...`), вторая здесь не нужна.
   */
  const rowActionsVanished = rowActions.length > 0 && rowActionsStale && !rowNewer;
  const titleId = `short-title-${item.id}`;

  return (
    <div
      data-testid={`short-${item.id}`}
      data-status={item.status}
      className={clsx('border rounded-lg p-3', broken ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white')}
    >
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" data-testid={`short-toggle-${item.id}`} onClick={onToggle} aria-expanded={open}
          aria-controls={`short-details-${item.id}`} className="flex-1 min-w-[12rem] flex items-start gap-2 text-left">
          {open ? (
            <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className={clsx('px-2 py-0.5 text-xs rounded', statusTone(item.status))}>{STATUS_TITLES[item.status]}</span>
              <span id={titleId} className="text-sm font-medium text-gray-900 break-words min-w-0">{shortTitle(item)}</span>
            </span>
            <span className="block mt-0.5 text-xs text-gray-500">{meta}</span>
            <span data-testid={`short-line-${item.id}`}
              className={clsx('block mt-0.5 text-xs', broken ? 'text-red-700 font-medium' : 'text-gray-600')}>
              {statusLine(item, now)}
            </span>
            {broken && item.lastError && !open && (
              <span className="mt-0.5 text-xs text-red-700 break-words line-clamp-1">{item.lastError}</span>
            )}
          </span>
        </button>
        {rowActions.length > 0 && !rowActionsStale && (
          <div className="flex gap-2 flex-shrink-0 ml-auto">
            {rowActions.includes('start_now') && (
              <button type="button" data-testid={`short-start-${item.id}`} onClick={() => onAction('start_now')} disabled={busy}
                aria-describedby={titleId} className={PRIMARY}>
                Запустить сейчас
              </button>
            )}
            {rowActions.includes('reject') && (
              <button type="button" data-testid={`short-idea-reject-${item.id}`} onClick={() => onAction('reject')} disabled={busy}
                aria-describedby={titleId} className={DANGER}>
                Отклонить
              </button>
            )}
          </div>
        )}
        {rowActionsVanished && detail && (
          <span data-testid={`short-row-stale-${item.id}`} className="text-xs text-amber-700">
            Сейчас — «{STATUS_TITLES[detail.status]}»: список устарел, нажмите «Обновить».
          </span>
        )}
      </div>

      {item.publications.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.publications.map((p) => {
            const label = `${PLATFORM_TITLES[p.platform]}: ${publicationLabel(p)}`;
            const safeHref = p.url ? safeExternalUrl(p.url) : null;
            return safeHref ? (
              <a key={p.platform} data-testid={`short-pub-${item.id}-${p.platform}`} href={safeHref} target="_blank" rel="noreferrer"
                className="px-2 py-0.5 text-xs rounded bg-green-50 text-green-800 underline">
                {label} ↗
              </a>
            ) : (
              <span key={p.platform} data-testid={`short-pub-${item.id}-${p.platform}`} title={p.lastError ?? undefined}
                className={clsx('px-2 py-0.5 text-xs rounded', p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600')}>
                {label}
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div data-testid={`short-details-${item.id}`} id={`short-details-${item.id}`} className="mt-3 pt-3 border-t border-gray-100">
          {detailLoading && (
            <div role="status" className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader className="w-3.5 h-3.5 animate-spin" />
              Загружаю ролик…
            </div>
          )}
          {detailError && <div role="status" className="text-xs text-rose-700">Не загрузил ролик: {detailError}</div>}
          {detail && (
            <>
              {rowNewer && (
                <div data-testid={`short-stale-${item.id}`}
                  className="mb-2 px-2 py-1 text-xs rounded bg-amber-50 text-amber-800 border border-amber-200">
                  Ролик изменился, пока карточка была открыта — сверните и раскройте её заново.
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                <ShortVideo key={detail.videoUrl ?? 'none'} detail={detail} />
                <div className="min-w-0 space-y-2 text-sm text-gray-700">
                  {detail.captions?.telegram && <Field label="Подпись в канал">{detail.captions.telegram}</Field>}
                  {detail.captions?.youtube?.title && <Field label="Заголовок YouTube">{detail.captions.youtube.title}</Field>}
                  {detail.scene?.question && <Field label="Вопрос ассистенту">{detail.scene.question}</Field>}
                  {Boolean(detail.script?.hook || detail.script?.lines?.length) && (
                    <div>
                      <div className="text-xs text-gray-500">Сценарий</div>
                      {detail.script?.hook && <div className="font-medium break-words">{detail.script.hook}</div>}
                      <ol className="list-decimal pl-5 space-y-0.5">
                        {(detail.script?.lines ?? []).map((l) => (
                          <li key={l.id} className="break-words">{l.text}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {detail.ownerNote && <Field label="Замечания">{detail.ownerNote}</Field>}
                  {detail.lastError && <div className="text-xs text-red-700 break-words">Последняя ошибка: {detail.lastError}</div>}
                  {detail.publications.filter((p) => p.status === 'failed' && p.lastError).map((p) => (
                    <div key={p.platform} data-testid={`short-pub-error-${item.id}-${p.platform}`} className="text-xs text-red-700 break-words">
                      {PLATFORM_TITLES[p.platform]}: {p.lastError}
                    </div>
                  ))}
                  <div data-testid={`short-stats-${item.id}`} className="text-xs text-gray-500">{stats}</div>
                </div>
              </div>
              <ShortActions detail={detail} busy={busy} onAction={onAction} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ShortCard;
