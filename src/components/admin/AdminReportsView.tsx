import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldAlert, Ban, EyeOff, Check, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

/**
 * Очередь жалоб на пользователей.
 *
 * Заведена по факту: жалобы копились в user_reports с самого запуска
 * переписки между пользователями, и во всём бэкенде не было ни одного
 * чтения оттуда — ни эндпоинта, ни экрана. При этом оферта обещает
 * рассмотреть жалобу в течение 24 часов, а магазины приложений требуют
 * работающий механизм для приложений с пользовательским контентом.
 *
 * Поэтому здесь показан не просто список, а всё, что нужно для решения без
 * ухода с экрана: обе стороны, текст сообщения из контекста жалобы, возраст
 * заявки и признак того, что нарушитель уже заблокирован.
 */

interface ReportItem {
  id: string;
  reporterId: string;
  reporterName: string | null;
  targetId: string;
  targetName: string | null;
  targetBlocked: boolean;
  reason: string;
  contextType: string | null;
  contextMessage: string | null;
  status: string;
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  ageHours: number;
}

type Action = 'dismiss' | 'content_removed' | 'block';

const AdminReportsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiClient.get(
        `/webhook/admin/reports?status=${showAll ? 'all' : 'new'}&limit=200`,
      );
      if (!r.ok) throw new Error(String(r.status));
      setItems(await r.json());
    } catch (e) {
      setError(t('admin.reports.load_error', { error: String(e) }));
    } finally {
      setLoading(false);
    }
  }, [showAll, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string, action: Action) => {
    // Блокировка закрывает человеку вход в аккаунт целиком — это не то
    // действие, которое делают случайным промахом по кнопке.
    if (action === 'block' && !window.confirm(t('admin.reports.confirm_block'))) return;
    setBusy(id);
    try {
      const r = await apiClient.post(`/webhook/admin/reports/${id}/resolve`, { action });
      if (!r.ok) throw new Error(String(r.status));
      await load();
    } catch (e) {
      setError(t('admin.reports.resolve_error', { error: String(e) }));
    } finally {
      setBusy(null);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const overdue = items.filter((r) => r.status === 'new' && r.ageHours >= 24).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">{t('admin.reports.title')}</h3>
          {overdue > 0 && (
            // Просрочка видна числом, а не вычисляется глазами: срок в
            // 24 часа обещан офертой, и его нарушение — факт, а не оттенок.
            <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
              {t('admin.reports.overdue', { count: overdue })}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="rounded"
          />
          {t('admin.reports.show_all')}
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-gray-500">
          <Inbox className="w-8 h-8" />
          <span className="text-sm">{t('admin.reports.empty')}</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li
              key={r.id}
              className={clsx(
                'rounded-lg border p-4',
                r.status === 'new' && r.ageHours >= 24
                  ? 'border-red-200 bg-red-50/40'
                  : 'border-gray-200 bg-white',
              )}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm text-gray-900">
                    <span className="font-medium">
                      {r.reporterName || r.reporterId}
                    </span>
                    {' → '}
                    <span className="font-medium">{r.targetName || r.targetId}</span>
                    {r.targetBlocked && (
                      <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                        {t('admin.reports.already_blocked')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {fmtDate(r.createdAt)} · {t('admin.reports.age_hours', { count: r.ageHours })}
                    {r.contextType && <> · {r.contextType}</>}
                  </div>
                </div>

                {r.status === 'new' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => resolve(r.id, 'dismiss')}
                      disabled={busy === r.id}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <EyeOff className="w-4 h-4 inline mr-1" />
                      {t('admin.reports.dismiss')}
                    </button>
                    <button
                      onClick={() => resolve(r.id, 'content_removed')}
                      disabled={busy === r.id}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4 inline mr-1" />
                      {t('admin.reports.content_removed')}
                    </button>
                    <button
                      onClick={() => resolve(r.id, 'block')}
                      disabled={busy === r.id}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <Ban className="w-4 h-4 inline mr-1" />
                      {t('admin.reports.block')}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 shrink-0">
                    {t('admin.reports.resolved_by', {
                      resolution: r.resolution || r.status,
                      moderator: r.resolvedBy || '—',
                    })}
                  </div>
                )}
              </div>

              <div className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{r.reason}</div>

              {r.contextMessage && (
                // Текст, на который пожаловались. Без него модератор пошёл бы
                // искать переписку руками по номеру телефона.
                <div className="mt-2 p-2 rounded bg-gray-50 border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap">
                  {r.contextMessage}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminReportsView;
