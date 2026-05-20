// src/components/chat/smm/PublishModal.tsx
import React, { useEffect, useState } from 'react';
import { Loader2, Send, X, Clock, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../services/apiClient';
import { socialAccountApi } from '../../../services/socialAccountApi';
import { SmmPlatform, SocialAccount, PLATFORM_LABELS } from '../../../types/smm';
import TelegramConnectForm from '../TelegramConnectForm';
import { getVideo, getScenario } from './smm-api';

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
  const [connectingPlatform, setConnectingPlatform] = useState<SmmPlatform | null>(null);
  const [tgOpen, setTgOpen] = useState(false);

  const refreshAccounts = async () => {
    try {
      const list = await socialAccountApi.list();
      setAccounts(list);
      const active = list.filter((a) => a.status === 'active');
      if (active.length === 1 && selectedPlatforms.size === 0) {
        setSelectedPlatforms(new Set([active[0].platform]));
      }
    } catch (e: any) {
      toast.error(`Не удалось загрузить аккаунты: ${e?.message ?? 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAccounts(); }, []);

  // Pre-fill caption from creator's branding settings if available.
  // video → scenario → scenario.creatorSettings.publishCaption.
  useEffect(() => {
    (async () => {
      try {
        const v = await getVideo(videoId);
        const s = await getScenario(v.scenarioId);
        if (s.creatorSettings?.publishCaption) {
          setCaption((current) => current || s.creatorSettings!.publishCaption!);
        }
      } catch { /* non-fatal — user types caption themselves */ }
    })();
  }, [videoId]);

  const togglePlatform = (p: SmmPlatform) => {
    const next = new Set(selectedPlatforms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setSelectedPlatforms(next);
  };

  const handleConnect = async (p: SmmPlatform) => {
    if (p === 'telegram') {
      setTgOpen(true);
      return;
    }
    setConnectingPlatform(p);
    try {
      // OAuth redirects back to /chat where ChatInterface shows a toast.
      const { authorizeUrl } = await socialAccountApi.getOAuthStartUrl(
        p as Exclude<SmmPlatform, 'telegram'>,
        '/chat',
      );
      window.location.href = authorizeUrl;
    } catch (e: any) {
      toast.error(`${PLATFORM_LABELS[p]}: ${e?.message ?? 'ошибка'}`);
      setConnectingPlatform(null);
    }
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
                  if (connected) {
                    return (
                      <label
                        key={p}
                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePlatform(p)}
                          className="h-4 w-4 accent-forest-600"
                        />
                        <span className="text-sm">{PLATFORM_LABELS[p]}</span>
                      </label>
                    );
                  }
                  // Not connected — show a "connect" affordance instead of greying out
                  return (
                    <div
                      key={p}
                      className="flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-gray-200"
                    >
                      <span className="text-sm text-gray-500 flex-1">{PLATFORM_LABELS[p]}</span>
                      <button
                        onClick={() => handleConnect(p)}
                        disabled={connectingPlatform === p}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        {connectingPlatform === p
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Plus className="h-3 w-3" />}
                        Подключить
                      </button>
                    </div>
                  );
                })}
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

        {/* Inline Telegram setup — only Telegram needs a multi-step form, others go via OAuth redirect */}
        {tgOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setTgOpen(false); }}
          >
            <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold">Telegram-канал</h3>
                <button onClick={() => setTgOpen(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <TelegramConnectForm
                onConnected={() => {
                  setTgOpen(false);
                  refreshAccounts();
                  toast.success('Telegram подключён');
                }}
              />
            </div>
          </div>
        )}

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
