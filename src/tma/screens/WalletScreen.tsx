import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson } from '../api';
import { loadWallet, tokensLabel, type Field, type HistoryRow } from './walletData';

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

      <div className="mt-4 rounded-2xl border p-4">
        <div className="text-sm opacity-70">{t('tma.wallet.balance')}</div>
        <div className="mt-1 text-3xl font-semibold">
          {balance === null && '…'}
          {balance === 'failed' && <span className="text-base text-red-500">{t('tma.wallet.failed')}</span>}
          {typeof balance === 'number' && tokensLabel(t, balance)}
        </div>
      </div>

      <h2 className="mt-6 font-medium">{t('tma.wallet.history')}</h2>
      {history === null && <p className="mt-2 opacity-60">…</p>}
      {history === 'failed' && <p className="mt-2 text-red-500">{t('tma.wallet.failed')}</p>}
      {Array.isArray(history) && history.length === 0 && (
        <p className="mt-2 opacity-60">{t('tma.wallet.empty')}</p>
      )}

      <ul className="mt-2 flex flex-col gap-2">
        {Array.isArray(history) &&
          history.map((row, i) => (
            <li key={`${row.at}-${i}`} className="flex items-baseline justify-between rounded-xl border p-3">
              <span>
                <span className="font-medium">{row.description || row.type || '—'}</span>
                {row.at && (
                  <span className="block text-xs opacity-60">
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
