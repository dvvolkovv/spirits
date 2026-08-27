import { useState } from 'react';
import { Check, Copy, Loader2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

/**
 * Создание голосовой встречи и ссылка-приглашение.
 *
 * Ссылку человек рассылает участникам сам, а чтобы позвать ассистента — кидает
 * её же в чат с ним. Отдельной кнопки «позвать ассистента» нет намеренно:
 * ассистентов много, и выбор делается тем, в чей чат кинули ссылку.
 */
export default function CreateMeetingButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await apiClient.post('/webhook/room', {});
      if (!res.ok) throw new Error('failed');
      const { code } = await res.json();
      setLink(`${window.location.origin}/room/${code}`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер недоступен (нет разрешения, небезопасный контекст) — ссылка
      // видна на экране, скопировать можно руками.
    }
  };

  if (link) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-forest-200 bg-forest-50">
        <span className="text-xs text-forest-900 truncate flex-1" data-testid="meeting-link">
          {link}
        </span>
        <button
          onClick={copy}
          data-testid="meeting-copy"
          aria-label={t('chat.meeting.copy_link')}
          title={t('chat.meeting.copy_link')}
          className="p-1.5 rounded-md bg-white text-forest-800 hover:bg-forest-100 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={create}
        disabled={busy}
        data-testid="meeting-create"
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-forest-200 text-forest-800 text-sm disabled:opacity-50 hover:bg-forest-50 transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
        {t('chat.meeting.create')}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{t('chat.meeting.create_failed')}</p>}
    </div>
  );
}
