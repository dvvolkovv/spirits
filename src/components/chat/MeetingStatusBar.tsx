import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

/**
 * Плашка «ассистент на встрече» над лентой чата.
 *
 * Пока она видна, ассистент сидит в комнате и тарифицируется — поэтому кнопка
 * выхода должна быть на виду, а не спрятана в меню.
 *
 * Плашка ещё и СЛЕДИТ за входом. Успешный ответ на «зайти» ничего не обещает:
 * бот идёт на встречу секунды и минуты, и сорваться может уже после ответа —
 * занятый порт под звук, сменившаяся вёрстка площадки, отказ во входе. Прежняя
 * редакция показывала «ассистент на встрече» в любом случае, и человек ждал
 * того, кто не придёт (замечание владельца 22.09.2026).
 */

/** Как часто спрашиваем, чем кончился вход. */
const POLL_MS = 5000;

export default function MeetingStatusBar({
  callId,
  onLeft,
}: {
  callId: string;
  onLeft: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Новый звонок — новая судьба: иначе отказ прошлого входа остался бы на
    // экране поверх начавшейся встречи.
    setFailed(false);

    let alive = true;
    const ask = async () => {
      try {
        const res = await apiClient.get(`/webhook/meeting/${callId}/status`);
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (data?.status === 'failed') setFailed(true);
      } catch {
        // Сеть моргнула — спросим на следующем круге. Пугать человека
        // «не получится» из-за своей же неудачной проверки нельзя.
      }
    };
    void ask();
    const timer = window.setInterval(ask, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [callId]);

  const leave = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/webhook/meeting/${callId}/leave`);
    } catch {
      // Best-effort: ассистент мог выйти сам — по опустевшей комнате или по
      // потолку. Плашку в любом случае убираем, иначе она застрянет навсегда.
    }
    setBusy(false);
    onLeft();
  };

  if (failed) {
    // Подробности человеку не нужны и только встревожат: почему именно не
    // вышло, разбирается по алерту в дежурном чате.
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
        <span className="text-xs text-amber-900 flex-1" data-testid="meeting-failed">
          {t('chat.meeting.join_failed')}
        </span>
        <button
          onClick={onLeft}
          data-testid="meeting-dismiss"
          className="px-2 py-1 rounded-md bg-white text-amber-800 text-xs font-medium hover:bg-amber-100 transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-forest-100 border-b border-forest-200">
      <Video className="w-4 h-4 text-forest-700 animate-pulse flex-shrink-0" />
      <span className="text-xs text-forest-900 flex-1">{t('chat.meeting.in_progress')}</span>
      <button
        onClick={leave}
        disabled={busy}
        data-testid="meeting-leave"
        className="px-2 py-1 rounded-md bg-white text-forest-800 text-xs font-medium disabled:opacity-50 hover:bg-forest-50 transition-colors"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t('chat.meeting.leave')}
      </button>
    </div>
  );
}
