import React, { useState, useEffect } from 'react';
import { Users, Plus, ToggleLeft, ToggleRight, Copy, ChevronDown, ChevronUp, ChevronRight, CheckCircle, Loader } from 'lucide-react';
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
  // L1 expanded → shows its L2 children
  const [expandedL1, setExpandedL1] = useState<string | null>(null);
  // L1's own commissions expanded
  const [expandedL1Commissions, setExpandedL1Commissions] = useState<string | null>(null);
  // L2 expanded → shows its commissions
  const [expandedL2, setExpandedL2] = useState<string | null>(null);
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

  useEffect(() => { loadStats(); }, []);

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
      const response = await apiClient.post('/webhook/admin/referral', { action: 'toggle', id, is_active: !isActive });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка изменения статуса');
    }
  };

  const handleMarkPaid = async (commissionId: string) => {
    setMarkingPaid(commissionId);
    try {
      const response = await apiClient.post('/webhook/admin/referral', { action: 'mark_paid', commission_id: commissionId });
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
      const response = await apiClient.post('/webhook/admin/referral', { action: 'mark_all_paid', leader_id: leaderId });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отметки выплат');
    } finally {
      setMarkingPaid(null);
    }
  };

  const copyLink = (slug: string) => navigator.clipboard.writeText(`https://my.linkeon.io/?ref=${slug}`);
  const formatRub = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const level1Leaders = stats?.leaders.filter(l => l.level === 1) ?? [];
  const level1Ids = new Set(level1Leaders.map(l => l.id));
  const orphanL2Leaders = stats?.leaders.filter(l => l.level === 2 && (l.parent_leader_id === null || !level1Ids.has(l.parent_leader_id))) ?? [];

  const CommissionsTable = ({ leader }: { leader: Leader }) => {
    const unpaid = leader.commissions.filter(c => !c.paid_out);
    return (
      <div className="px-4 py-3">
        {unpaid.length > 0 && (
          <button
            onClick={() => handleMarkAllPaid(leader.id)}
            disabled={markingPaid === `all_${leader.id}`}
            className="mb-2 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {markingPaid === `all_${leader.id}` ? <Loader className="w-3 h-3 animate-spin" /> : null}
            Выплатить всё ({unpaid.length})
          </button>
        )}
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
                          onClick={() => handleMarkPaid(c.id)}
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
    );
  };

  const LeaderRow = ({
    leader,
    isExpanded,
    onToggle,
    indent = false,
  }: {
    leader: Leader;
    isExpanded: boolean;
    onToggle: () => void;
    indent?: boolean;
  }) => {
    const unpaid = leader.commissions.filter(c => !c.paid_out);
    return (
      <div className={clsx('flex items-center gap-3 px-4 py-3', indent && 'pl-8 bg-blue-50/40')}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {indent && <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />}
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
          {unpaid.length > 0 && !indent && (
            <button
              onClick={() => handleMarkAllPaid(leader.id)}
              disabled={markingPaid === `all_${leader.id}`}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {markingPaid === `all_${leader.id}` ? <Loader className="w-3 h-3 animate-spin" /> : 'Выплатить всё'}
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
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            {isExpanded
              ? <ChevronUp className="w-4 h-4 text-gray-500" />
              : <ChevronDown className="w-4 h-4 text-gray-500" />
            }
          </button>
        </div>
      </div>
    );
  };

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
                    type="number" min={0} max={100} step={0.5}
                    value={newLeader.commission_pct}
                    onChange={e => setNewLeader(prev => ({ ...prev, commission_pct: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                </div>
                {newLeader.level === 2 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">% для родителя (апстрим)</label>
                    <input
                      type="number" min={0} max={100} step={0.5}
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

          {/* Иерархия лидеров */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {level1Leaders.length === 0 && (
                <p className="text-center text-gray-500 py-8 text-sm">Лидеры не найдены</p>
              )}

              {level1Leaders.map(l1 => {
                const isL1Expanded = expandedL1 === l1.id;
                const children = stats?.leaders.filter(l => l.level === 2 && l.parent_leader_id === l1.id) ?? [];
                const isL1CommExpanded = expandedL1Commissions === l1.id;

                return (
                  <div key={l1.id}>
                    {/* Строка L1 */}
                    <div className="relative">
                      <LeaderRow
                        leader={l1}
                        isExpanded={isL1Expanded}
                        onToggle={() => {
                          setExpandedL1(isL1Expanded ? null : l1.id);
                          if (isL1Expanded) {
                            setExpandedL1Commissions(null);
                            setExpandedL2(null);
                          }
                        }}
                      />
                      {children.length > 0 && (
                        <span className="absolute left-4 bottom-1 text-xs text-blue-500">
                          ↳ {children.length} суб-лидер{children.length > 1 ? 'а' : ''}
                        </span>
                      )}
                    </div>

                    {/* Развёрнутый L1: суб-лидеры + свои начисления */}
                    {isL1Expanded && (
                      <div className="border-t border-gray-100 bg-gray-50">

                        {/* Свои начисления L1 */}
                        <div className="border-b border-gray-100">
                          <button
                            onClick={() => setExpandedL1Commissions(isL1CommExpanded ? null : l1.id)}
                            className="w-full flex items-center gap-2 px-8 py-2 text-xs text-gray-600 hover:bg-gray-100 transition-colors text-left"
                          >
                            {isL1CommExpanded
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />
                            }
                            <span>Свои начисления</span>
                            <span className="text-gray-400">({l1.commissions.length})</span>
                            {l1.pending_rub > 0 && (
                              <span className="ml-auto text-warm-600 font-medium">{formatRub(l1.pending_rub)} к выплате</span>
                            )}
                          </button>
                          {isL1CommExpanded && (
                            <div className="bg-white border-t border-gray-100 pl-8">
                              <CommissionsTable leader={l1} />
                            </div>
                          )}
                        </div>

                        {/* Суб-лидеры L2 */}
                        {children.length > 0 && (
                          <div>
                            <p className="px-8 py-2 text-xs font-medium text-gray-500">
                              Суб-лидеры ({children.length})
                            </p>
                            <div className="divide-y divide-gray-100">
                              {children.map(l2 => {
                                const isL2Expanded = expandedL2 === l2.id;
                                return (
                                  <div key={l2.id}>
                                    <LeaderRow
                                      leader={l2}
                                      isExpanded={isL2Expanded}
                                      onToggle={() => setExpandedL2(isL2Expanded ? null : l2.id)}
                                      indent
                                    />
                                    {isL2Expanded && (
                                      <div className="bg-white border-t border-gray-100 pl-8">
                                        <CommissionsTable leader={l2} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {children.length === 0 && (
                          <p className="px-8 py-3 text-xs text-gray-400">Суб-лидеров нет</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Лидеры 2-го уровня без привязанного родителя */}
        {orphanL2Leaders.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">ур.2</span>
                Суб-лидеры без родителя ({orphanL2Leaders.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {orphanL2Leaders.map(l2 => {
                const isL2Expanded = expandedL2 === l2.id;
                return (
                  <div key={l2.id}>
                    <LeaderRow
                      leader={l2}
                      isExpanded={isL2Expanded}
                      onToggle={() => setExpandedL2(isL2Expanded ? null : l2.id)}
                    />
                    {isL2Expanded && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        <CommissionsTable leader={l2} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminReferralsView;
