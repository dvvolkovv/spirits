import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, AlertCircle, RefreshCw, Coins, Users, Clock, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { formatTokens, formatDuration, formatWhen } from './callsFormat';
import { providerLabel } from './callProviders';
import UserActivityDrawer from './UserActivityDrawer';
import CallSessionsFeed from './CallSessionsFeed';

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
  provider: string | null;
  include_test: boolean;
  byUser: CallUserRow[];
  totals: {
    calls: number;
    users: number;
    duration_sec: number;
    tokens_call: number;
    tokens_consult: number;
    tokens_total: number;
  };
  /** Сессии по площадкам за период — для кнопок фильтра на «Встречах». */
  byProvider: { provider: string; sessions: number }[];
}

const KINDS: { id: CallKind; label: string }[] = [
  { id: 'call', label: 'Звонки' },
  { id: 'meeting', label: 'Встречи' },
  { id: 'all', label: 'Все' },
];

/** Как называть счётчик и пустую выборку на каждой вкладке. */
const COUNT_LABEL: Record<CallKind, string> = { call: 'Звонков', meeting: 'Встреч', all: 'Сессий' };
const EMPTY_LABEL: Record<CallKind, string> = {
  call: 'Звонков за период не было',
  meeting: 'Встреч за период не было',
  all: 'Сессий за период не было',
};

const PERIODS = [7, 30, 90];

const chipClass = (active: boolean) =>
  clsx(
    'px-2.5 py-1 text-xs rounded-md border transition-colors',
    active
      ? 'border-forest-400 bg-forest-50 text-forest-700'
      : 'border-gray-200 text-gray-600 hover:border-gray-300',
  );

const AdminCallsView: React.FC = () => {
  const { t } = useTranslation();
  // Клик по строке открывает карточку человека — там лежат его разговоры.
  // Раньше провалиться отсюда было некуда: карточка открывалась только из
  // «Платежей», «Пользователей» и «Токенов».
  const [drawerUser, setDrawerUser] = useState<string | null>(null);
  const [data, setData] = useState<CallsResp | null>(null);
  const [days, setDays] = useState(30);
  // «Все» по умолчанию: раздел про звонки и встречи, и встречи должны быть
  // видны сразу, а не за вкладкой.
  const [kind, setKind] = useState<CallKind>('all');
  // Площадка внутри «Встреч»; null — все площадки.
  const [provider, setProvider] = useState<string | null>(null);
  // Тестовые аккаунты по умолчанию показываем, как в «Платежах»: на 24.09.2026
  // все встречи на проде — прогоны владельца с тестового номера, и без них
  // раздел выглядит так, будто встреч нет вовсе. Снимается одним кликом.
  const [includeTest, setIncludeTest] = useState(true);
  // Растёт по «Обновить»: лента перезагружается вместе с таблицей.
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Одна строка фильтров на таблицу и ленту: разойдясь, они показали бы
  // разные наборы сессий.
  const query = [
    `days=${days}`,
    `kind=${kind}`,
    provider ? `provider=${encodeURIComponent(provider)}` : '',
    includeTest ? 'includeTest=1' : '',
  ]
    .filter(Boolean)
    .join('&');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get(`/webhook/admin/calls?${query}`);
      if (!resp.ok) throw new Error(`Звонки: ${resp.status}`);
      setData(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [query]); // eslint-disable-line

  // Площадка имеет смысл только внутри «Встреч»: при смене вкладки она
  // сбрасывается, иначе «Звонки» молча отфильтровались бы по Zoom в ноль.
  const selectKind = (k: CallKind) => {
    setKind(k);
    setProvider(null);
  };

  const refresh = () => {
    load();
    setReloadKey((n) => n + 1);
  };

  const rows = data?.byUser ?? [];
  const byProvider = data?.byProvider ?? [];
  const providersTotal = byProvider.reduce((sum, p) => sum + p.sessions, 0);

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 pb-20 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Phone className="w-6 h-6 text-forest-600" />
            <h1 className="text-xl font-bold text-gray-900">Звонки и встречи</h1>
          </div>
          <button
            data-testid="admin-calls-refresh"
            onClick={refresh}
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

        {data?.include_test && (
          <div
            data-testid="admin-calls-test-banner"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            Цифры включают тестовые аккаунты. Снимите «Тестовые», чтобы оставить только живых пользователей.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                data-testid={`admin-calls-kind-${k.id}`}
                onClick={() => selectKind(k.id)}
                className={chipClass(kind === k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {PERIODS.map((d) => (
              <button key={d} onClick={() => setDays(d)} className={chipClass(days === d)}>
                {d} дней
              </button>
            ))}
          </div>
          <button
            data-testid="admin-calls-include-test"
            onClick={() => setIncludeTest((v) => !v)}
            title="Сессии тестовых аккаунтов — в таблице, в ленте и в цифрах выше"
            className={clsx(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              includeTest
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >
            {includeTest ? '✓ ' : ''}Тестовые
          </button>
        </div>

        {/* Кнопки площадок строятся по данным: новая площадка появится без
            правки фронта, под техническим именем, пока ей не дадут подпись. */}
        {kind === 'meeting' && byProvider.length > 0 && (
          <div data-testid="admin-calls-providers" className="flex flex-wrap gap-1">
            <button
              data-testid="admin-calls-provider-all"
              onClick={() => setProvider(null)}
              className={chipClass(provider === null)}
            >
              Все площадки · {providersTotal}
            </button>
            {byProvider.map((p) => (
              <button
                key={p.provider}
                data-testid={`admin-calls-provider-${p.provider}`}
                onClick={() => setProvider(p.provider)}
                className={chipClass(provider === p.provider)}
              >
                {providerLabel(p.provider, t)} · {p.sessions}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={COUNT_LABEL[kind]}
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
            <p className="text-sm text-gray-400 py-12 text-center">{EMPTY_LABEL[kind]}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Пользователь</th>
                    <th className="text-right px-4 py-2.5 font-medium">{COUNT_LABEL[kind]}</th>
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
                    <tr
                      key={r.user_id}
                      onClick={() => setDrawerUser(r.user_id)}
                      className="cursor-pointer hover:bg-gray-50"
                      title={t('admin.calls.openUser', 'Открыть карточку и разговоры')}
                    >
                      <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-forest-700 underline-offset-2 hover:underline">{r.user_id}</td>
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
            которые ведущий во время звонка или встречи задал профильным ассистентам; они
            тарифицируются отдельно.
          </p>
        </div>

        {/* key={query}: при смене фильтров лента пересоздаётся и снова
            начинает с первой порции. */}
        <CallSessionsFeed key={query} query={query} reloadKey={reloadKey} onOpenUser={setDrawerUser} />
      </div>
    </div>

      {/* Карточка человека: там его звонки и встречи с саммари, пометками и диалогом. */}
      {drawerUser && (
        <UserActivityDrawer phone={drawerUser} onClose={() => setDrawerUser(null)} />
      )}
    </>
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
