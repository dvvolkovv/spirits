import { useState } from 'react';
import { Gift, X } from 'lucide-react';

// ③ CONVERT: one-time приветствие рефери («тебя пригласил X, +N токенов») —
// message-match с реф-приглашением. Данные кладёт authService.registerReferral
// в localStorage ll_referral_welcome при успешной регистрации по ссылке.
export default function ReferralWelcomeBanner() {
  const [data] = useState<{ name?: string | null; bonus?: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem('ll_referral_welcome') || ''); }
    catch { return null; }
  });
  const [show, setShow] = useState(!!data);
  if (!show || !data) return null;
  const close = () => { localStorage.removeItem('ll_referral_welcome'); setShow(false); };
  const bonus = Number(data.bonus || 0);
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-forest-600 text-white text-sm px-4 py-2 flex items-center justify-center gap-2 shadow-md">
      <Gift className="w-4 h-4 flex-shrink-0" />
      <span>
        {data.name ? `Тебя пригласил(а) ${data.name}. ` : ''}
        {bonus > 0
          ? <>Лови <b>+{bonus.toLocaleString('ru')} токенов</b> на старт 🎁</>
          : <>Добро пожаловать в Linkeon 🎁</>}
      </span>
      <button onClick={close} aria-label="Закрыть" className="ml-2 opacity-80 hover:opacity-100 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
