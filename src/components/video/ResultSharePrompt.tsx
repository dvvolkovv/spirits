import { useState } from 'react';
import { Gift, X, Share2 } from 'lucide-react';
import { shareWithReferral } from '../../services/shareReferral';
import type { ReferralTouch } from '../../services/shareReferral';

// ① ASK (96cba3f7→referral-automation): тактичный промпт «поделись результатом»
// в момент готового артефакта. Cooldown в localStorage (7 дней, максимум 3 показа
// суммарно), всегда dismissible — не давим (psychologist-grade).
const KEY = 'll_share_prompt';
const COOLDOWN_MS = 7 * 24 * 3600 * 1000;
const MAX_SHOWS = 3;

function readState(): { last: number; count: number } {
  try { return JSON.parse(localStorage.getItem(KEY) || '') || { last: 0, count: 0 }; }
  catch { return { last: 0, count: 0 }; }
}
export function sharePromptEligible(): boolean {
  const s = readState();
  return s.count < MAX_SHOWS && Date.now() - s.last > COOLDOWN_MS;
}

export default function ResultSharePrompt({ text, touch = 'result_prompt' }: { text: string; touch?: ReferralTouch }) {
  const [show, setShow] = useState(() => sharePromptEligible());
  if (!show) return null;
  const bump = () => {
    const s = readState();
    localStorage.setItem(KEY, JSON.stringify({ last: Date.now(), count: s.count + 1 }));
  };
  const onShare = async () => { await shareWithReferral(text, touch); bump(); setShow(false); };
  const onClose = () => { bump(); setShow(false); };
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3">
      <Gift className="w-5 h-5 text-forest-600 flex-shrink-0" />
      <div className="flex-1 text-sm text-gray-700">
        Понравился результат? Поделись — друг получит <b>20 000 токенов</b> на старт, а ты — % с его пополнений.
      </div>
      <button onClick={onShare} className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white rounded-lg text-sm hover:bg-forest-700 transition-colors flex-shrink-0">
        <Share2 className="w-4 h-4" /> Поделиться
      </button>
      <button onClick={onClose} aria-label="Закрыть" className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
