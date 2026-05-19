// src/components/chat/smm/PublishModal.tsx
import React, { useEffect, useState } from 'react';
import { Loader2, Send, X, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../services/apiClient';
import { socialAccountApi } from '../../../services/socialAccountApi';
import { SmmPlatform, SocialAccount, PLATFORM_LABELS } from '../../../types/smm';

interface Props {
  videoId: string;
  onClose: () => void;
  onPublished?: (result: PublishResult) => void;
}

interface PublishResult {
  scheduled: Array<{ publicationId: string; platform: SmmPlatform; jobId: string; scheduledAt: string | null }>;
  failed: Array<{ platform: SmmPlatform; reason: string; detail?: string }>;
}

type TimeChoice = 'now' | '1h' | 'tomorrow18' | 'custom';

export const PublishModal: React.FC<Props> = ({ videoId, onClose, onPublished }) => {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SmmPlatform>>(new Set());
  const [timeChoice, setTimeChoice] = useState<TimeChoice>('now');
  const [customTime, setCustomTime] = useState('');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    socialAccountApi.list()
      .then((list) => {
        setAccounts(list);
        const active = list.filter((a) => a.status === 'active');
        // Pre-select the user's only connected platform (common case)
        if (active.length === 1) {
          setSelectedPlatforms(new Set([active[0].platform]));
        }
      })
      .catch((e) => toast.error(`Не удалось загрузить аккаунты: ${e?.message ?? 'ошибка'}`))
      .finally(() => setLoading(false));
  }, []);

  const togglePlatform = (p: SmmPlatform) => {
    const next = new Set(selectedPlatforms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setSelectedPlatforms(next);
  };

  const buildScheduledTime = (): string | null => {
    if (timeChoice === 'now') return null;
    if (timeChoice === '1h') return 'через час';
    if (timeChoice === 'tomorrow18') return 'завтра в 18';
    if (timeChoice === 'custom' && customTime) {
      // Datetime-local input gives "2026-05-19T18:30" — convert to ISO
      const d = new Date(customTime);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    }
    return null;
  };

  const submit = async () => {
    if (selectedPlatforms.size === 0) {
      toast.error('Выбери хотя бы одну платформу');
      return;
    }
    setSubmitting(true);
    try {
      const r = await apiClient.post(`/webhook/smm/videos/${videoId}/publish`, {
        platforms: Array.from(selectedPlatforms),
        scheduledTime: buildScheduledTime(),
        caption: caption.trim() || undefined,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message ?? `HTTP ${r.status}`);
      }
      const result: PublishResult = await r.json();
      if (result.failed.length > 0) {
        const fails = result.failed.map((f) => `${PLATFORM_LABELS[f.platform]}: ${f.reason}`).join(', ');
        toast.error(`Не получилось на: ${fails}`);
      }
      if (result.scheduled.length > 0) {
        const when = timeChoice === 'now' ? 'опубликовано' : 'запланировано';
        toast.success(`${result.scheduled.length} ${when} (${result.scheduled.map(s => PLATFORM_LABELS[s.platform]).join(', ')})`);
      }
      onPublished?.(result);
      onClose();
    } catch (e: any) {
      toast.error(`Не удалось: ${e?.message ?? 'ошибка'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const activePlatforms = accounts.filter((a) => a.status === 'active').map((a) => a.platform);
  const hasAccountFor = (p: SmmPlatform) => activePlatforms.includes(p);
  const ALL_PLATFORMS: SmmPlatform[] = ['telegram', 'vk', 'youtube', 'tiktok', 'instagram'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold">Опубликовать ролик</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Platforms */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-2">Куда публикуем?</div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> загружаем аккаунты…
              </div>
            ) : (
              <div className="space-y-1">
                {ALL_PLATFORMS.map((p) => {
                  const connected = hasAccountFor(p);
                  const checked = selectedPlatforms.has(p);
                  return (
                    <label
                      key={p}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                        connected ? 'cursor-pointer hover:bg-gray-50' : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!connected}
                        onChange={() => togglePlatform(p)}
                        className="h-4 w-4 accent-forest-600"
                      />
                      <span className="text-sm">{PLATFORM_LABELS[p]}</span>
                      {!connected && (
                        <span className="text-xs text-gray-400 ml-auto">не подключено</span>
                      )}
                    </label>
                  );
                })}
                {activePlatforms.length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    Сначала подключи хотя бы одну соцсеть в <a href="/settings/social" className="underline">настройках</a>.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Time */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Когда?
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ['now', 'Сейчас'],
                ['1h', 'Через час'],
                ['tomorrow18', 'Завтра в 18:00'],
                ['custom', 'Своё время'],
              ] as Array<[TimeChoice, string]>).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTimeChoice(key)}
                  className={`text-sm py-1.5 px-2 rounded border ${
                    timeChoice === key
                      ? 'border-forest-500 bg-forest-50 text-forest-800'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {timeChoice === 'custom' && (
              <input
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="mt-2 w-full text-sm px-2 py-1.5 border border-gray-300 rounded"
              />
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-2">Подпись (опционально)</div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Текст под видео — для TG/VK/IG. Можно с эмодзи и хэштегами."
              rows={3}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900"
          >
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={submitting || selectedPlatforms.size === 0 || (timeChoice === 'custom' && !customTime)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {timeChoice === 'now' ? 'Опубликовать' : 'Запланировать'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublishModal;
