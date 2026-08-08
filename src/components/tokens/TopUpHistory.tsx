import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { formatNumber } from '../../utils/formatters';

/**
 * История пополнений.
 *
 * Заведена по факту: начисления шли прямым UPDATE мимо add_user_tokens и следа
 * не оставляли — в базе лежало 29 840 списаний и ноль покупок. Пользователь
 * видел, как токены тают, но не мог узнать, когда и откуда они пришли.
 *
 * Показываем только начисления. Расход виден в чате по каждому сообщению, и в
 * общей ленте он был бы шумом на десятки тысяч строк.
 */

interface HistoryItem {
  at: string;
  type: 'purchase' | 'coupon' | 'bonus' | 'refund' | 'adjustment';
  tokens: number;
  /** null у перенесённых записей: остаток на тот момент восстановить было нельзя. */
  balanceAfter: number | null;
  description: string | null;
  provider: 'yookassa' | 'priem' | null;
  money: { amount: number; currency: string | null } | null;
  bonusTokens: number;
}

const TYPE_KEY: Record<HistoryItem['type'], string> = {
  purchase: 'payment.history_type_purchase',
  coupon: 'payment.history_type_coupon',
  bonus: 'payment.history_type_bonus',
  refund: 'payment.history_type_refund',
  adjustment: 'payment.history_type_adjustment',
};

export const TopUpHistory: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiClient.get('/webhook/tokens/history?limit=20')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
      .catch((e) => { console.error('история пополнений:', e); setFailed(true); });
  }, []);

  // Пока грузится или если запрос не удался — молчим. Это справочный блок,
  // из-за него не стоит показывать ошибку поверх экрана оплаты.
  if (failed || items === null || items.length === 0) return null;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const fmtMoney = (m: HistoryItem['money']) => {
    if (!m) return null;
    if (m.currency === 'USD') return `$${m.amount}`;
    if (m.currency === 'RUB') return `${m.amount} ₽`;
    return `${m.amount}${m.currency ? ' ' + m.currency : ''}`;
  };

  return (
    <div className="mb-6">
      <div className="flex items-center space-x-2 mb-3">
        <History className="w-4 h-4 text-gray-600" />
        <h4 className="text-sm font-medium text-gray-700">{t('payment.history_title')}</h4>
      </div>

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {items.map((it, i) => {
          const money = fmtMoney(it.money);
          return (
            <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="text-gray-900">{t(TYPE_KEY[it.type] ?? TYPE_KEY.adjustment)}</div>
                <div className="text-xs text-gray-500">
                  {fmtDate(it.at)}
                  {money && <> · {money}</>}
                  {it.provider === 'priem' && <> · {t('payment.history_via_crypto')}</>}
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className={it.tokens < 0 ? 'text-red-600' : 'text-forest-700'}>
                  {it.tokens > 0 ? '+' : ''}{formatNumber(it.tokens)}
                </div>
                {it.bonusTokens > 0 && (
                  <div className="text-xs text-gray-500">
                    {t('payment.history_incl_bonus', { count: it.bonusTokens, formatted: formatNumber(it.bonusTokens) })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
