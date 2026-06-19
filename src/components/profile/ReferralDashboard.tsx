import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Users, TrendingUp, CheckCircle, Clock, Loader, AlertCircle, Coins } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { ReferralStats } from '../../types/auth';

// Курс/порог вывода комиссий токенами (совпадает с бэком).
const PAYOUT_RATE = 600;
const PAYOUT_MIN_RUB = 100;
// Порог вывода ДЕНЬГАМИ (совпадает с WITHDRAW_MIN_RUB на бэке).
const WITHDRAW_MIN_RUB = 1000;

const ReferralDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotLeader, setIsNotLeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutDone, setPayoutDone] = useState<{ rub: number; tokens: number } | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  // Вывод деньгами (DEV-3): заявка на ручную выплату командой.
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [wMethod, setWMethod] = useState<'sbp' | 'card'>('sbp');
  const [wReq, setWReq] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawDone, setWithdrawDone] = useState<{ amount_rub: number } | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

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
      if (!response.ok) throw new Error(t('referral.load_error_status', { status: response.status }));
      const data = await response.json();
      if (data.isLeader === false || (!data.leader && !data.referral_link)) {
        setIsNotLeader(true);
        return;
      }
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('referral.load_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const doPayout = async () => {
    setPayoutBusy(true);
    setPayoutError(null);
    try {
      const r = await apiClient.post('/webhook/referral/payout', { method: 'tokens' });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || t('referral.payout_error'));
      setPayoutDone({ rub: data.rub, tokens: data.tokens });
      setShowPayout(false);
      await loadStats();
    } catch (e) {
      setPayoutError(e instanceof Error ? e.message : t('referral.payout_error'));
    } finally {
      setPayoutBusy(false);
    }
  };

  const doWithdraw = async () => {
    setWithdrawBusy(true);
    setWithdrawError(null);
    try {
      const r = await apiClient.post('/webhook/referral/withdraw', { method: wMethod, requisites: wReq.trim() });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Не удалось создать заявку');
      setWithdrawDone({ amount_rub: data.amount_rub });
      setShowWithdraw(false);
      await loadStats();
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setWithdrawBusy(false);
    }
  };

  const copyLink = () => {
    if (!stats) return;
    navigator.clipboard.writeText(stats.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatRub = (n: number) =>
    n.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: '2-digit' });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t('referral.loading')}</span>
        </div>
      </div>
    );
  }

  if (isNotLeader) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">{t('referral.not_eligible_title')}</h3>
        <p className="text-sm text-gray-500">{t('referral.not_eligible_body_line1')}<br />{t('referral.not_eligible_body_line2')}</p>
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
      {/* Header */}
      <div className="bg-gradient-to-r from-forest-50 to-warm-50 border-b border-forest-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-forest-600" />
          {t('referral.title')}
        </h2>
        <p className="text-sm text-gray-600 mt-0.5">
          {t('referral.leader_line', { name: stats.leader.name, level: stats.leader.level, pct: stats.leader.commission_pct })}
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Referral link */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <span className="text-sm text-gray-700 flex-1 break-all">{stats.referral_link}</span>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm flex-shrink-0"
          >
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t('referral.copied') : t('referral.copy')}
          </button>
        </div>

        {/* Питч двустороннего бонуса — усиливает мотив поделиться */}
        {!!stats.referee_bonus_tokens && stats.referee_bonus_tokens > 0 && (
          <p className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2 flex items-center gap-2">
            🎁 <span>Друзья получают <b>{stats.referee_bonus_tokens.toLocaleString(i18n.language)}</b> токенов на старт по вашей ссылке — а вы {stats.leader.commission_pct}% с их оплат.</span>
          </p>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{t('referral.card_referees')}</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_referees}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{t('referral.card_paid')}</p>
            <p className="text-lg font-bold text-gray-900">{formatRub(stats.total_paid_rub)}</p>
          </div>
          <div className="bg-forest-50 rounded-lg p-4 text-center">
            <p className="text-xs text-forest-700 mb-1">{t('referral.card_commission')}</p>
            <p className="text-lg font-bold text-forest-700">{formatRub(stats.total_commission_rub)}</p>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 text-center">
            <p className="text-xs text-warm-700 mb-1">{t('referral.card_pending')}</p>
            <p className="text-lg font-bold text-warm-700">{formatRub(stats.pending_rub)}</p>
          </div>
        </div>

        {/* Вывод вознаграждения — всегда видимое пояснение (даже при нулевом
            балансе), чтобы меню «токенами или деньгами» было обнаружимо. */}
        {(() => {
          const w = Math.round(Math.max(0, (stats.total_commission_rub || 0) - (stats.paid_out_rub || 0)) * 100) / 100;
          if (w > 0 || payoutDone || withdrawDone) return null;
          return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              💸 <b>Вывод вознаграждения</b> — токенами (от {PAYOUT_MIN_RUB}&nbsp;₽) или деньгами на карту/СБП (от {WITHDRAW_MIN_RUB}&nbsp;₽). Кнопки появятся здесь, как только накопится комиссия с приглашённых.
            </div>
          );
        })()}

        {/* Вывод комиссий токенами */}
        {(() => {
          const withdrawable = Math.max(0, (stats.total_commission_rub || 0) - (stats.paid_out_rub || 0));
          const withdrawable2 = Math.round(withdrawable * 100) / 100;
          if (withdrawable2 <= 0 && !payoutDone) return null;
          return (
            <div className="rounded-lg border border-forest-200 bg-forest-50 p-4">
              {payoutDone ? (
                <div className="flex items-center gap-2 text-sm text-forest-800">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{t('referral.payout_success', { rub: formatRub(payoutDone.rub), tokens: payoutDone.tokens.toLocaleString(i18n.language) })}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-forest-700 mb-0.5">{t('referral.payout_available')}</p>
                    <p className="text-lg font-bold text-forest-800">
                      {formatRub(withdrawable2)} <span className="text-sm font-normal text-forest-600">→ {Math.round(withdrawable2 * PAYOUT_RATE).toLocaleString(i18n.language)} {t('referral.payout_tokens_word')}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => { setPayoutError(null); setShowPayout(true); }}
                    disabled={withdrawable2 < PAYOUT_MIN_RUB}
                    className="flex items-center gap-1.5 px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={withdrawable2 < PAYOUT_MIN_RUB ? t('referral.payout_min_hint', { min: PAYOUT_MIN_RUB }) : undefined}
                  >
                    <Coins className="w-4 h-4" /> {t('referral.payout_button')}
                  </button>
                </div>
              )}
              {withdrawable2 < PAYOUT_MIN_RUB && !payoutDone && (
                <p className="text-xs text-forest-600 mt-1.5">{t('referral.payout_min_hint', { min: PAYOUT_MIN_RUB })}</p>
              )}
            </div>
          );
        })()}

        {/* Вывод комиссий ДЕНЬГАМИ (DEV-3) */}
        {(() => {
          const withdrawable = Math.round(Math.max(0, (stats.total_commission_rub || 0) - (stats.paid_out_rub || 0)) * 100) / 100;
          if (withdrawable <= 0 && !withdrawDone) return null;
          return (
            <div className="rounded-lg border border-warm-200 bg-warm-50 p-4">
              {withdrawDone ? (
                <div className="flex items-center gap-2 text-sm text-warm-800">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Заявка на вывод {formatRub(withdrawDone.amount_rub)} создана — обработаем в ближайшее время.</span>
                </div>
              ) : !showWithdraw ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-warm-700 mb-0.5">Вывести деньгами на карту или по СБП</p>
                    <p className="text-lg font-bold text-warm-800">{formatRub(withdrawable)}</p>
                  </div>
                  <button
                    onClick={() => { setWithdrawError(null); setShowWithdraw(true); }}
                    disabled={withdrawable < WITHDRAW_MIN_RUB}
                    className="px-4 py-2 bg-warm-600 text-white text-sm font-medium rounded-lg hover:bg-warm-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={withdrawable < WITHDRAW_MIN_RUB ? `Минимум — ${WITHDRAW_MIN_RUB} ₽` : undefined}
                  >
                    Вывести деньгами
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-sm font-medium text-warm-800">Заявка на вывод {formatRub(withdrawable)}</p>
                  <div className="flex gap-2">
                    {(['sbp', 'card'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setWMethod(m)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${wMethod === m ? 'border-warm-500 bg-warm-100 text-warm-800 font-medium' : 'border-gray-200 bg-white text-gray-600'}`}
                      >
                        {m === 'sbp' ? 'СБП' : 'Карта'}
                      </button>
                    ))}
                  </div>
                  <input
                    value={wReq}
                    onChange={(e) => setWReq(e.target.value)}
                    placeholder={wMethod === 'sbp' ? 'Телефон для СБП (+7…)' : 'Номер карты'}
                    inputMode={wMethod === 'sbp' ? 'tel' : 'numeric'}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-warm-300"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={doWithdraw}
                      disabled={withdrawBusy || wReq.trim().length < 4}
                      className="flex items-center gap-1.5 px-4 py-2 bg-warm-600 text-white text-sm font-medium rounded-lg hover:bg-warm-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {withdrawBusy ? <Loader className="w-4 h-4 animate-spin" /> : null}
                      Отправить заявку
                    </button>
                    <button onClick={() => setShowWithdraw(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Отмена</button>
                  </div>
                  {withdrawError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{withdrawError}</p>}
                </div>
              )}
              {withdrawable < WITHDRAW_MIN_RUB && !withdrawDone && (
                <p className="text-xs text-warm-600 mt-1.5">Минимум для вывода деньгами — {WITHDRAW_MIN_RUB} ₽</p>
              )}
            </div>
          );
        })()}

        {/* Breakdown */}
        {(stats.commission_breakdown.direct_commission_rub > 0 || stats.commission_breakdown.upstream_commission_rub > 0) && (
          <div className="flex gap-4 text-sm">
            {stats.commission_breakdown.direct_commission_rub > 0 && (
              <div className="flex items-center gap-2 text-gray-600">
                <TrendingUp className="w-4 h-4 text-forest-500" />
                <span>{t('referral.breakdown_direct', { pct: stats.commission_breakdown.direct_pct, amount: formatRub(stats.commission_breakdown.direct_commission_rub) })}</span>
              </div>
            )}
            {stats.commission_breakdown.upstream_commission_rub > 0 && (
              <div className="flex items-center gap-2 text-gray-600">
                <TrendingUp className="w-4 h-4 text-warm-500" />
                <span>{t('referral.breakdown_upstream', { pct: stats.commission_breakdown.upstream_pct, amount: formatRub(stats.commission_breakdown.upstream_commission_rub) })}</span>
              </div>
            )}
          </div>
        )}

        {stats.paid_out_rub > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{t('referral.paid_out', { amount: formatRub(stats.paid_out_rub) })}</span>
          </div>
        )}

        {/* History */}
        {stats.commissions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('referral.history_title')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-left pb-2 pr-3">{t('referral.history_date')}</th>
                    <th className="text-left pb-2 pr-3">{t('referral.history_phone')}</th>
                    <th className="text-right pb-2 pr-3">{t('referral.history_payment')}</th>
                    <th className="text-right pb-2 pr-3">{t('referral.history_commission')}</th>
                    <th className="text-center pb-2">{t('referral.history_status')}</th>
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
                          ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" aria-label={t('referral.history_paid_title')} />
                          : <Clock className="w-4 h-4 text-warm-500 mx-auto" aria-label={t('referral.history_pending_title')} />
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
            {t('referral.empty_history')}
          </p>
        )}
      </div>

      {showPayout && stats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !payoutBusy && setShowPayout(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Coins className="w-5 h-5 text-forest-600" /> {t('referral.payout_confirm_title')}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('referral.payout_confirm_body', {
                rub: formatRub(Math.round(Math.max(0, (stats.total_commission_rub || 0) - (stats.paid_out_rub || 0)) * 100) / 100),
                tokens: Math.round(Math.max(0, (stats.total_commission_rub || 0) - (stats.paid_out_rub || 0)) * PAYOUT_RATE).toLocaleString(i18n.language),
              })}
            </p>
            {payoutError && (
              <div className="text-sm text-rose-600 mb-3 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{payoutError}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowPayout(false)} disabled={payoutBusy}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-60">
                {t('referral.payout_cancel')}
              </button>
              <button onClick={doPayout} disabled={payoutBusy}
                className="flex-1 px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
                {payoutBusy ? <Loader className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                {t('referral.payout_confirm_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralDashboard;
