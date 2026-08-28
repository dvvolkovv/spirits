import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson } from '../api';
import { openLink } from '../telegram';
import { loadWallet, tokensLabel, type Field, type HistoryRow } from './walletData';
import { Card } from '../../shared/ui/Card';
import { BalanceBadge } from '../../shared/ui/BalanceBadge';

/**
 * Пополнение уводит во внешний браузер, а не открывает оплату внутри:
 * Telegram Stars в v1 нет (решение владельца — ~30% комиссии и холд 21
 * день), а обычный чекаут в WebView ломается на редиректах банка.
 */
const TOP_UP_URL = 'https://my.linkeon.io/tokens';

export function WalletScreen() {
  const { t, i18n } = useTranslation();
  const [balance, setBalance] = useState<Field<number>>(null);
  const [history, setHistory] = useState<Field<HistoryRow[]>>(null);

  // Опрос по открытию и возврату фокуса, без таймера: сессии Mini App
  // короткие, а фон Telegram замораживает вкладку — пятисекундный поллинг
  // из веба здесь только жёг бы батарею.
  useEffect(() => {
    const load = () => {
      loadWallet({
        getTokens: () => getJson('/webhook/user/tokens/'),
        getHistory: () => getJson('/webhook/tokens/history'),
      }).then((r) => {
        setBalance(r.balance);
        setHistory(r.history);
      });
    };
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.wallet.title')}</h1>

      <div className="mt-4">
        <Card>
          <div className="text-sm text-gray-500">{t('tma.wallet.balance')}</div>
          <div className="mt-1">
            {balance === null && <span className="text-3xl font-semibold text-gray-300">…</span>}
            {balance === 'failed' && <span className="text-base text-red-600">{t('tma.wallet.failed')}</span>}
            {typeof balance === 'number' && (
              <>
                <BalanceBadge tokens={balance} locale={i18n.language} />
                <span className="ml-2 text-sm text-gray-500">{tokensLabel(t, balance)}</span>
              </>
            )}
          </div>
        </Card>
      </div>

      <button
        className="mt-3 w-full rounded-2xl bg-green-600 px-4 py-3 font-medium text-white"
        onClick={() => openLink(TOP_UP_URL)}
      >
        {t('tma.wallet.topUp')}
      </button>

      <h2 className="mt-6 font-medium">{t('tma.wallet.history')}</h2>
      {history === null && <p className="mt-2 text-gray-400">…</p>}
      {history === 'failed' && <p className="mt-2 text-red-600">{t('tma.wallet.failed')}</p>}
      {Array.isArray(history) && history.length === 0 && (
        <p className="mt-2 text-gray-400">{t('tma.wallet.empty')}</p>
      )}

      <ul className="mt-2 flex flex-col gap-2">
        {Array.isArray(history) &&
          history.map((row, i) => (
            <li key={`${row.at}-${i}`} className="flex items-baseline justify-between rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <span>
                <span className="font-medium">{row.description || row.type || '—'}</span>
                {row.at && (
                  <span className="block text-xs text-gray-400">
                    {new Date(row.at).toLocaleString(i18n.language)}
                  </span>
                )}
              </span>
              <span className="tabular-nums text-green-700">+{row.tokens}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
