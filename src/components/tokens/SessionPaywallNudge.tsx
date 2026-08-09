import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { track } from '../../services/eventsClient';

// Session-peak soft-paywall для Романа (задача d6b733de): монетизация в момент
// пика вовлечённости — когда в ТЕКУЩЕЙ сессии с Романом набрано ≥15 сообщений.
// Мягкая закрываемая карточка в ленте чата (не модалка).
//
// Ненавязчивость (задачи a8a6c2b5 / 8d787015):
//  - Дисмисс ПЕРСИСТЕНТНЫЙ: пишем timestamp в localStorage и не показываем нудж
//    [DISMISS_COOLDOWN] после закрытия. Раньше флаг жил в sessionStorage + локальном
//    state — компонент рендерится в ленте без key и не размонтируется, так что state
//    держался, НО закрытие не переживало перезагрузку/новую вкладку и не давало
//    межсессионного cooldown'а. localStorage+timestamp закрывает и это, и делает
//    дисмисс пуленепробиваемым к любому ремаунту (читаем хранилище, а не только init).
//  - ТАЙМИНГ: нудж = оффер докупить токены; не показываем его тому, у кого баланс
//    ещё большой (не потратил даже стартовые токены) — плохой момент для апселла.
const ROMAN_ID = 12;
const SESSION_MSG_THRESHOLD = 15;
// int16 плейсхолдер? нет — это токены: если у неплательщика ещё > этого на балансе,
// апселл неуместен (стартовый пакет = 50 000, так что >30k = потрачено <40%).
const HIGH_BALANCE_SUPPRESS = 30000;
const DISMISS_UNTIL_KEY = 'roman_session_paywall_dismissed_until';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

function dismissedNow(): boolean {
  try {
    return Date.now() < Number(localStorage.getItem(DISMISS_UNTIL_KEY) || '0');
  } catch {
    return false;
  }
}

const SessionPaywallNudge: React.FC<{
  assistantId: number | null;
  sessionUserMsgCount: number;
  tokenBalance?: number | null;
}> = ({ assistantId, sessionUserMsgCount, tokenBalance }) => {
  const navigate = useNavigate();
  const [paid, setPaid] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(dismissedNow);
  const [shown, setShown] = useState(false);

  // Плохой момент для апселла, если баланс ещё большой (баланс неизвестен → не мешаем).
  const balanceOk = tokenBalance == null || tokenBalance <= HIGH_BALANCE_SUPPRESS;

  const active =
    assistantId === ROMAN_ID &&
    sessionUserMsgCount >= SESSION_MSG_THRESHOLD &&
    paid === false &&
    balanceOk &&
    !dismissed;

  // Узнаём статус оплаты только когда дозрели по счётчику и момент подходящий (не дёргаем зря).
  useEffect(() => {
    if (paid !== null || dismissed || !balanceOk || assistantId !== ROMAN_ID || sessionUserMsgCount < SESSION_MSG_THRESHOLD) return;
    let alive = true;
    apiClient.get('/webhook/offer/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setPaid(!!d.paid); })
      .catch(() => {});
    return () => { alive = false; };
  }, [assistantId, sessionUserMsgCount, paid, dismissed, balanceOk]);

  useEffect(() => {
    if (active && !shown) {
      setShown(true);
      track('offer_shown', { kind: 'roman_session', message_count: sessionUserMsgCount });
    }
  }, [active, shown, sessionUserMsgCount]);

  if (!active) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_COOLDOWN_MS)); } catch { /* storage disabled */ }
    setDismissed(true);
    track('offer_dismissed', { kind: 'roman_session' });
  };

  const buy = () => {
    track('offer_clicked', { kind: 'roman_session' });
    navigate('/chat?view=tokens&offer=1');
  };

  return (
    <div className="my-3 mx-auto max-w-2xl rounded-2xl border border-forest-200 bg-gradient-to-br from-forest-50 to-warm-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-forest-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800">
            Роман сегодня в ударе! Впрочем, как и всегда 👍 Дарим +50% токенов на первый пакет, чтобы получить ещё больше выгоды 🤝
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={buy}
              className="px-3 py-1.5 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors"
            >
              Выбрать пакет
            </button>
            <button onClick={dismiss} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
              Позже
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Закрыть" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default SessionPaywallNudge;
