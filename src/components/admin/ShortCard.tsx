import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight, Loader } from 'lucide-react';
import ShortActions from './ShortActions';
import {
  ANGLE_TITLES, ActionExtra, FORMAT_TITLES, PLATFORM_TITLES, RUBRIC_TITLES, STATUS_TITLES,
  ShortAction, ShortDetail, ShortItem, publicationLabel, shortTitle, statusLine, statusTone,
} from './shortStatus';

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
  if (!detail.videoUrl) return <div className="text-xs text-gray-500">Видео ещё нет — ролик не собран.</div>;
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
  const angle = item.status === 'idea' && !item.angleLocked ? 'подача по ритму недели' : ANGLE_TITLES[item.angle];
  const meta = [RUBRIC_TITLES[item.rubric], angle, assistantName, FORMAT_TITLES[item.format]].filter(Boolean).join(' · ');
  const stats = detail
    ? [
        detail.durationMs ? `${Math.round(detail.durationMs / 1000)} с` : null,
        detail.animation?.omniSeconds ? `Omni: ${detail.animation.omniSeconds} с` : null,
        detail.attempts ? `попыток: ${detail.attempts}` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div
      data-testid={`short-${item.id}`}
      data-status={item.status}
      className={clsx('border rounded-lg p-3', broken ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white')}
    >
      <div className="flex items-start gap-2">
        <button type="button" data-testid={`short-toggle-${item.id}`} onClick={onToggle} aria-expanded={open}
          className="flex-1 min-w-0 flex items-start gap-2 text-left">
          {open ? (
            <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className={clsx('px-2 py-0.5 text-xs rounded', statusTone(item.status))}>{STATUS_TITLES[item.status]}</span>
              <span className="text-sm font-medium text-gray-900 break-words">{shortTitle(item)}</span>
            </span>
            <span className="block mt-0.5 text-xs text-gray-500">{meta}</span>
            <span data-testid={`short-line-${item.id}`}
              className={clsx('block mt-0.5 text-xs', broken ? 'text-red-700 font-medium' : 'text-gray-600')}>
              {statusLine(item, now)}
            </span>
            {broken && item.lastError && (
              <span className="block mt-0.5 text-xs text-red-700 break-words line-clamp-2">{item.lastError}</span>
            )}
          </span>
        </button>
        {item.status === 'idea' && (
          <button type="button" data-testid={`short-start-${item.id}`} onClick={() => onAction('start_now')} disabled={busy}
            className="flex-shrink-0 px-3 py-1 text-xs bg-forest-600 text-white rounded hover:bg-forest-700 disabled:opacity-50">
            Запустить сейчас
          </button>
        )}
      </div>

      {item.publications.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.publications.map((p) => {
            const label = `${PLATFORM_TITLES[p.platform]}: ${publicationLabel(p)}`;
            return p.url ? (
              <a key={p.platform} data-testid={`short-pub-${item.id}-${p.platform}`} href={p.url} target="_blank" rel="noreferrer"
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
        <div data-testid={`short-details-${item.id}`} className="mt-3 pt-3 border-t border-gray-100">
          {detailLoading && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader className="w-3.5 h-3.5 animate-spin" />
              Загружаю ролик…
            </div>
          )}
          {detailError && <div className="text-xs text-rose-700">Не загрузил ролик: {detailError}</div>}
          {detail && (
            <>
              <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                <ShortVideo detail={detail} />
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
