import React, { useState, useEffect } from 'react';
import { Copy, Users, TrendingUp, CheckCircle, Clock, Loader, AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { ReferralStats } from '../../types/auth';

const ReferralDashboard: React.FC = () => {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotLeader, setIsNotLeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);
    setIsNotLeader(false);
    try {
      const response = await apiClient.get('/webhook/referral/stats');
      if (response.status === 403) {
        setIsNotLeader(true);
        return;
      }
      if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);
      const data = await response.json();
      if (data.isLeader === false || (!data.leader && !data.referral_link)) {
        setIsNotLeader(true);
        return;
      }
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные реферальной программы');
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = () => {
    if (!stats) return;
    navigator.clipboard.writeText(stats.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatRub = (n: number) =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader className="w-5 h-5 animate-spin" />
          <span className="text-sm">Загружаем данные реферальной программы...</span>
        </div>
      </div>
    );
  }

  if (isNotLeader) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">Партнёрская программа</h3>
        <p className="text-sm text-gray-500">Вы не являетесь участником партнёрской программы.<br />Для подключения обратитесь к администратору.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      {/* Заголовок */}
      <div className="bg-gradient-to-r from-forest-50 to-warm-50 border-b border-forest-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-forest-600" />
          Моя реферальная программа
        </h2>
        <p className="text-sm text-gray-600 mt-0.5">
          {stats.leader.name} · уровень {stats.leader.level} · {stats.leader.commission_pct}% комиссии
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Реферальная ссылка */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <span className="text-sm text-gray-700 flex-1 break-all">{stats.referral_link}</span>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm flex-shrink-0"
          >
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
        </div>

        {/* Сводка */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Приведено людей</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_referees}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Расходы рефералов</p>
            <p className="text-lg font-bold text-gray-900">{formatRub(stats.total_paid_rub)}</p>
          </div>
          <div className="bg-forest-50 rounded-lg p-4 text-center">
            <p className="text-xs text-forest-700 mb-1">Ваша комиссия</p>
            <p className="text-lg font-bold text-forest-700">{formatRub(stats.total_commission_rub)}</p>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 text-center">
            <p className="text-xs text-warm-700 mb-1">К выплате</p>
            <p className="text-lg font-bold text-warm-700">{formatRub(stats.pending_rub)}</p>
          </div>
        </div>

        {/* Детализация */}
        {(stats.commission_breakdown.direct_commission_rub > 0 || stats.commission_breakdown.upstream_commission_rub > 0) && (
          <div className="flex gap-4 text-sm">
            {stats.commission_breakdown.direct_commission_rub > 0 && (
              <div className="flex items-center gap-2 text-gray-600">
                <TrendingUp className="w-4 h-4 text-forest-500" />
                <span>Прямые ({stats.commission_breakdown.direct_pct}%): {formatRub(stats.commission_breakdown.direct_commission_rub)}</span>
              </div>
            )}
            {stats.commission_breakdown.upstream_commission_rub > 0 && (
              <div className="flex items-center gap-2 text-gray-600">
                <TrendingUp className="w-4 h-4 text-warm-500" />
                <span>Апстрим ({stats.commission_breakdown.upstream_pct}%): {formatRub(stats.commission_breakdown.upstream_commission_rub)}</span>
              </div>
            )}
          </div>
        )}

        {stats.paid_out_rub > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Выплачено: {formatRub(stats.paid_out_rub)}</span>
          </div>
        )}

        {/* История начислений */}
        {stats.commissions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">История начислений</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-left pb-2 pr-3">Дата</th>
                    <th className="text-left pb-2 pr-3">Телефон</th>
                    <th className="text-right pb-2 pr-3">Оплата</th>
                    <th className="text-right pb-2 pr-3">Комиссия</th>
                    <th className="text-center pb-2">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.commissions.map(c => (
                    <tr key={c.id} className="text-gray-700">
                      <td className="py-2 pr-3 text-gray-500 text-xs">{formatDate(c.date)}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{c.referee_phone}</td>
                      <td className="py-2 pr-3 text-right">{formatRub(c.payment_amount)}</td>
                      <td className="py-2 pr-3 text-right font-medium text-forest-700">{formatRub(c.commission_rub)}</td>
                      <td className="py-2 text-center">
                        {c.paid_out
                          ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" title="Выплачено" />
                          : <Clock className="w-4 h-4 text-warm-500 mx-auto" title="Ожидает выплаты" />
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stats.commissions.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            Пока нет начислений. Поделитесь своей ссылкой — комиссия появится после первой оплаты реферала.
          </p>
        )}
      </div>
    </div>
  );
};

export default ReferralDashboard;
