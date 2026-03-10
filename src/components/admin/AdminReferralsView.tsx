import React, { useState, useEffect } from 'react';
import { Users, Plus, ToggleLeft, ToggleRight, Copy, ChevronDown, ChevronUp, CheckCircle, Loader } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

interface Leader {
  id: string;
  name: string;
  slug: string;
  user_phone: string;
  parent_leader_id: string | null;
  parent_name?: string;
  level: number;
  commission_pct: number;
  is_active: boolean;
  total_referees: number;
  total_commission_rub: number;
  paid_out_rub: number;
  pending_rub: number;
  commissions: Commission[];
}

interface Commission {
  id: string;
  date: string;
  referee_phone: string;
  payment_amount: number;
  commission_pct: number;
  commission_rub: number;
  level: number;
  paid_out: boolean;
}

interface AdminStats {
  summary: {
    total_commission_all_rub: number;
    total_paid_out_rub: number;
    total_pending_rub: number;
  };
  leaders: Leader[];
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

const AdminReferralsView: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLeader, setExpandedLeader] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const [newLeader, setNewLeader] = useState({
    name: '',
    slug: '',
    user_phone: '',
    level: 1,
    parent_leader_id: '',
    commission_pct: 10,
    parent_commission_pct: 0,
  });
  const [slugError, setSlugError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/webhook/admin/referral/stats');
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSlugChange = (value: string) => {
    const lower = value.toLowerCase();
    setNewLeader(prev => ({ ...prev, slug: lower }));
    if (lower && !SLUG_PATTERN.test(lower)) {
      setSlugError('Только строчные буквы (a-z), цифры и дефис');
    } else {
      setSlugError('');
    }
  };

  const handleCreate = async () => {
    if (!newLeader.name.trim() || !newLeader.slug.trim() || !newLeader.user_phone.trim()) return;
    if (!SLUG_PATTERN.test(newLeader.slug)) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await apiClient.post('/webhook/admin/referral', {
        action: 'create',
        name: newLeader.name.trim(),
        slug: newLeader.slug.trim(),
        user_phone: newLeader.user_phone.trim(),
        level: newLeader.level,
        parent_leader_id: newLeader.parent_leader_id || null,
        commission_pct: newLeader.commission_pct,
        parent_commission_pct: newLeader.parent_commission_pct,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Ошибка: ${response.status}`);
      }
      setNewLeader({ name: '', slug: '', user_phone: '', level: 1, parent_leader_id: '', commission_pct: 10, parent_commission_pct: 0 });
      setShowCreateForm(false);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const response = await apiClient.post('/webhook/admin/referral', {
        action: 'toggle',
        id,
        is_active: !isActive,
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка изменения статуса');
    }
  };

  const handleMarkPaid = async (leaderId: string, commissionId: string) => {
    setMarkingPaid(commissionId);
    try {
      const response = await apiClient.post('/webhook/admin/referral', {
        action: 'mark_paid',
        commission_id: commissionId,
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отметки выплаты');
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleMarkAllPaid = async (leaderId: string) => {
    setMarkingPaid(`all_${leaderId}`);
    try {
      const response = await apiClient.post('/webhook/admin/referral', {
        action: 'mark_all_paid',
        leader_id: leaderId,
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отметки выплат');
    } finally {
      setMarkingPaid(null);
    }
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`https://my.linkeon.io/?ref=${slug}`);
  };

  const formatRub = (n: number) =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const level1Leaders = stats?.leaders.filter(l => l.level === 1) ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Сводка */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Всего начислено</p>
              <p className="text-lg font-bold text-gray-900">{formatRub(stats.summary.total_commission_all_rub)}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Выплачено</p>
              <p className="text-lg font-bold text-green-600">{formatRub(stats.summary.total_paid_out_rub)}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Долг</p>
              <p className="text-lg font-bold text-warm-600">{formatRub(stats.summary.total_pending_rub)}</p>
            </div>
          </div>
        )}

        {/* Ошибка */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
        )}

        {/* Кнопка + форма создания */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 flex items-center justify-between border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-forest-600" />
              Лидеры
            </h2>
            <button
              onClick={() => setShowCreateForm(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Добавить
            </button>
          </div>

          {showCreateForm && (
            <div className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Имя *</label>
                  <input
                    type="text"
                    value={newLeader.name}
                    onChange={e => setNewLeader(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Иван Иванов"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Slug (ссылка) *</label>
                  <input
                    type="text"
                    value={newLeader.slug}
                    onChange={e => handleSlugChange(e.target.value)}
                    placeholder="ivan"
                    className={clsx(
                      'w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent',
                      slugError ? 'border-red-400' : 'border-gray-300'
                    )}
                  />
                  {slugError && <p className="text-xs text-red-600 mt-1">{slugError}</p>}
                  {newLeader.slug && !slugError && (
                    <p className="text-xs text-gray-500 mt-1">my.linkeon.io/?ref={newLeader.slug}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Телефон лидера *</label>
                  <input
                    type="text"
                    value={newLeader.user_phone}
                    onChange={e => setNewLeader(prev => ({ ...prev, user_phone: e.target.value }))}
                    placeholder="79031234567"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Уровень</label>
                  <select
                    value={newLeader.level}
                    onChange={e => setNewLeader(prev => ({ ...prev, level: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  >
                    <option value={1}>1 (независимый)</option>
                    <option value={2}>2 (под родителем)</option>
                  </select>
                </div>
                {newLeader.level === 2 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Родитель (лидер ур.1)</label>
                    <select
                      value={newLeader.parent_leader_id}
                      onChange={e => setNewLeader(prev => ({ ...prev, parent_leader_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                    >
                      <option value="">— выбрать —</option>
                      {level1Leaders.map(l => (
                        <option key={l.id} value={l.id}>{l.name} (@{l.slug})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">% комиссии лидера</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={newLeader.commission_pct}
                    onChange={e => setNewLeader(prev => ({ ...prev, commission_pct: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                </div>
                {newLeader.level === 2 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">% для родителя (апстрим)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={newLeader.parent_commission_pct}
                      onChange={e => setNewLeader(prev => ({ ...prev, parent_commission_pct: Number(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={isSubmitting || !newLeader.name.trim() || !newLeader.slug.trim() || !newLeader.user_phone.trim() || !!slugError}
                  className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Создать
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Таблица лидеров */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {stats?.leaders.length === 0 && (
                <p className="text-center text-gray-500 py-8 text-sm">Лидеры не найдены</p>
              )}
              {stats?.leaders.map(leader => {
                const isExpanded = expandedLeader === leader.id;
                const unpaidCommissions = leader.commissions.filter(c => !c.paid_out);
                return (
                  <div key={leader.id}>
                    {/* Строка лидера */}
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{leader.name}</span>
                          <span className={clsx(
                            'text-xs px-1.5 py-0.5 rounded-full',
                            leader.level === 1 ? 'bg-forest-100 text-forest-700' : 'bg-blue-100 text-blue-700'
                          )}>
                            ур.{leader.level}
                          </span>
                          {!leader.is_active && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">неактивен</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <button
                            onClick={() => copyLink(leader.slug)}
                            className="flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700"
                            title="Скопировать ссылку"
                          >
                            <Copy className="w-3 h-3" />
                            ?ref={leader.slug}
                          </button>
                          <span className="text-xs text-gray-400">{leader.user_phone}</span>
                          {leader.parent_name && (
                            <span className="text-xs text-gray-400">↑ {leader.parent_name}</span>
                          )}
                        </div>
                      </div>

                      {/* Статистика */}
                      <div className="hidden md:flex items-center gap-4 text-sm flex-shrink-0">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">рефералов</p>
                          <p className="font-semibold text-gray-900">{leader.total_referees}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">начислено</p>
                          <p className="font-semibold text-gray-900">{formatRub(leader.total_commission_rub)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">к выплате</p>
                          <p className={clsx('font-semibold', leader.pending_rub > 0 ? 'text-warm-600' : 'text-gray-400')}>
                            {formatRub(leader.pending_rub)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">%</p>
                          <p className="font-semibold text-gray-900">{leader.commission_pct}%</p>
                        </div>
                      </div>

                      {/* Действия */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {unpaidCommissions.length > 0 && (
                          <button
                            onClick={() => handleMarkAllPaid(leader.id)}
                            disabled={markingPaid === `all_${leader.id}`}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {markingPaid === `all_${leader.id}` ? (
                              <Loader className="w-3 h-3 animate-spin" />
                            ) : (
                              'Выплатить всё'
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleToggle(leader.id, leader.is_active)}
                          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                          title={leader.is_active ? 'Деактивировать' : 'Активировать'}
                        >
                          {leader.is_active
                            ? <ToggleRight className="w-5 h-5 text-green-600" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400" />
                          }
                        </button>
                        <button
                          onClick={() => setExpandedLeader(isExpanded ? null : leader.id)}
                          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                        >
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-gray-500" />
                            : <ChevronDown className="w-4 h-4 text-gray-500" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* Детали начислений */}
                    {isExpanded && (
                      <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                        {/* Мобильная статистика */}
                        <div className="md:hidden grid grid-cols-3 gap-2 mb-3">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">рефералов</p>
                            <p className="font-semibold text-sm">{leader.total_referees}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">начислено</p>
                            <p className="font-semibold text-sm">{formatRub(leader.total_commission_rub)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">к выплате</p>
                            <p className={clsx('font-semibold text-sm', leader.pending_rub > 0 ? 'text-warm-600' : 'text-gray-400')}>
                              {formatRub(leader.pending_rub)}
                            </p>
                          </div>
                        </div>

                        {leader.commissions.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-2">Начислений нет</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b border-gray-200">
                                  <th className="text-left pb-2 pr-3">Дата</th>
                                  <th className="text-left pb-2 pr-3">Телефон</th>
                                  <th className="text-right pb-2 pr-3">Оплата</th>
                                  <th className="text-right pb-2 pr-3">%</th>
                                  <th className="text-right pb-2 pr-3">Комиссия</th>
                                  <th className="text-center pb-2 pr-3">Ур.</th>
                                  <th className="text-center pb-2">Статус</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {leader.commissions.map(c => (
                                  <tr key={c.id} className={clsx(c.paid_out ? 'text-gray-400' : 'text-gray-700')}>
                                    <td className="py-1.5 pr-3">{formatDate(c.date)}</td>
                                    <td className="py-1.5 pr-3 font-mono">{c.referee_phone}</td>
                                    <td className="py-1.5 pr-3 text-right">{formatRub(c.payment_amount)}</td>
                                    <td className="py-1.5 pr-3 text-right">{c.commission_pct}%</td>
                                    <td className="py-1.5 pr-3 text-right font-medium">{formatRub(c.commission_rub)}</td>
                                    <td className="py-1.5 pr-3 text-center">{c.level}</td>
                                    <td className="py-1.5 text-center">
                                      {c.paid_out ? (
                                        <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                                      ) : (
                                        <button
                                          onClick={() => handleMarkPaid(leader.id, c.id)}
                                          disabled={markingPaid === c.id}
                                          className="px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                                        >
                                          {markingPaid === c.id ? '...' : 'Выплачено'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminReferralsView;
