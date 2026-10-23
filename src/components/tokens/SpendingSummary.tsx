import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { parseSpending, spendingUrl, type SpendingMonth } from '../../shared/spending';
import { SpendingMonths } from '../../shared/ui/SpendingMonths';

/**
 * «Расход по месяцам» — куда ушли токены, по категориям.
 *
 * Заведён после жалобы 23.10.2026 «сгорели токены»: история пополнений
 * показывает только начисления, в чате видна стоимость одних ответов, и
 * картинки с видео нигде не было видно.
 *
 * Пока грузится, при ошибке и без трат — молчим, как TopUpHistory: это
 * справка, она не должна мешать оплате.
 */
export const SpendingSummary: React.FC = () => {
  const { t } = useTranslation();
  const [months, setMonths] = useState<SpendingMonth[] | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .get(spendingUrl())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (alive) setMonths(parseSpending(data));
      })
      .catch((e) => {
        console.error('расход по месяцам:', e);
        if (alive) setMonths([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!months || months.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center space-x-2">
        <PieChart className="h-4 w-4 text-gray-600" />
        <h4 className="text-sm font-medium text-gray-700">{t('payment.spending.title')}</h4>
      </div>
      <SpendingMonths months={months} />
    </div>
  );
};
