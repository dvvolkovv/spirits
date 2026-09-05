import React, { useState, useEffect } from 'react';
import { Phone, AlertCircle, RefreshCw, Coins, Users, Clock, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { formatTokens, formatDuration, formatWhen } from './callsFormat';

type CallKind = 'call' | 'meeting' | 'all';

interface CallUserRow {
  user_id: string;
  calls: number;
  duration_sec: number;
  /** Списано за минуты разговора (voice_calls.tokens_charged). */
  tokens_call: number;
  /** Списано за вопросы ведущего профильным ассистентам (voice_call_jobs). */
  tokens_consult: number;
  tokens_total: number;
  consults: number;
  last_call: string | null;
}

interface CallsResp {
  days: number;
  kind: CallKind;
  byUser: CallUserRow[];
  totals: {
    calls: number;
    users: number;
    duration_sec: number;
    tokens_call: number;
    tokens_consult: number;
    tokens_total: number;
  };
}

const KINDS: { id: CallKind; label: string }[] = [
  { id: 'call', label: 'Звонки' },
  { id: 'meeting', label: 'Встречи' },
  { id: 'all', label: 'Все' },
];

const PERIODS = [7, 30, 90];

const AdminCallsView: React.FC = () => {
  const [data, setData] = useState<CallsResp | null>(null);
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<CallKind>('call');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get(`/webhook/admin/calls?days=${days}&kind=${kind}`);
      if (!resp.ok) throw new Error(`Звонки: ${resp.status}`);
      setData(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [days, kind]); // eslint-disable-line

  const rows = data?.byUser ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 pb-20 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Phone className="w-6 h-6 text-forest-600" />
            <h1 className="text-xl font-bold text-gray-900">Звонки</h1>
          </div>
          <button
            onClick={load}
            disabled={isLoading}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
            Обновить
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                data-testid={`admin-calls-kind-${k.id}`}
                onClick={() => setKind(k.id)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-md border transition-colors',
                  kind === k.id
                    ? 'border-forest-400 bg-forest-50 text-forest-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {PERIODS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-md border transition-colors',
                  days === d
                    ? 'border-forest-400 bg-forest-50 text-forest-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {d} дней
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={kind === 'meeting' ? 'Встреч' : 'Звонков'}
            value={formatTokens(data?.totals.calls ?? 0)}
            icon={<Phone className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="Пользователей"
            value={formatTokens(data?.totals.users ?? 0)}
            icon={<Users className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="Общая длительность"
            value={formatDuration(data?.totals.duration_sec ?? 0)}
            icon={<Clock className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="Списано всего"
            value={formatTokens(data?.totals.tokens_total ?? 0)}
            icon={<Coins className="w-3.5 h-3.5" />}
            hint={`разговор ${formatTokens(data?.totals.tokens_call ?? 0)} + консультации ${formatTokens(data?.totals.tokens_consult ?? 0)}`}
            accent
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Разбивка по пользователям</h2>
            <span className="text-xs text-gray-400">за {data?.days ?? days} дней</span>
          </div>

          {isLoading && !data ? (
            <p className="text-sm text-gray-400 py-12 text-center">Загрузка…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-12 text-center">
              {kind === 'meeting' ? 'Встреч за период не было' : 'Звонков за период не было'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Пользователь</th>
                    <th className="text-right px-4 py-2.5 font-medium">
                      {kind === 'meeting' ? 'Встреч' : 'Звонков'}
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium">Длительность</th>
                    <th className="text-right px-4 py-2.5 font-medium">Консультаций</th>
                    <th className="text-right px-4 py-2.5 font-medium">За разговор</th>
                    <th className="text-right px-4 py-2.5 font-medium">За консультации</th>
                    <th className="text-right px-4 py-2.5 font-medium">Всего списано</th>
                    <th className="text-right px-4 py-2.5 font-medium">Последний</th>
                  </tr>
                </thead>
                <tbody data-testid="admin-calls-rows" className="divide-y divide-gray-100">
                  {rows.map((r, idx) => (
                    <tr key={r.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.user_id}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{r.calls}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatDuration(r.duration_sec)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                          {r.consults}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatTokens(r.tokens_call)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatTokens(r.tokens_consult)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-forest-800">
                        {formatTokens(r.tokens_total)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{formatWhen(r.last_call)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Оговорка про два списания стоит рядом с таблицей, а не в
              документации: цифры сходятся только если знать, что консультации
              ассистентов тарифицируются отдельно от минут разговора. */}
          <p className="text-xs text-gray-400 px-4 py-3 border-t border-gray-100">
            «За разговор» — списание за минуты голосовой сессии. «За консультации» — вопросы,
            которые ведущий во время звонка задал профильным ассистентам; они тарифицируются
            отдельно. Тестовые аккаунты в выборку не входят.
          </p>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; hint?: string; accent?: boolean }> = ({ label, value, icon, hint, accent }) => (
  <div className={clsx('rounded-xl border p-3', accent ? 'border-forest-300 bg-forest-50' : 'border-gray-200 bg-white')}>
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <p className={clsx('text-lg font-semibold', accent ? 'text-forest-800' : 'text-gray-900')}>{value}</p>
    {hint && <p className="text-xs text-gray-400 mt-1 leading-tight">{hint}</p>}
  </div>
);

export default AdminCallsView;
