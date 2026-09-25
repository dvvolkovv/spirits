import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { CallSessionItem, type CallSession } from './CallSessionItem';

/**
 * Звонки и встречи человека — отдельным компонентом, как UserDevicesList:
 * карточка пользователя уже 990 строк, и класть туда ещё один экран значит
 * сделать её нечитаемой. Строку рисует CallSessionItem — тот же, что в ленте
 * раздела «Звонки», поэтому сессия в обоих местах выглядит одинаково.
 */
export const UserCallsList: React.FC<{ userId: string }> = ({ userId }) => {
  const { t } = useTranslation();
  const [calls, setCalls] = useState<CallSession[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .get(`/webhook/admin/calls/user/${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setCalls(d.calls ?? []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [userId]);

  if (failed) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm text-red-600">
          {t('admin.calls.loadFailed', 'Не удалось загрузить звонки')}
        </p>
      </div>
    );
  }
  if (calls === null) {
    return <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-400">…</div>;
  }
  // Сессий нет — секцию не показываем вовсе: пустая карточка «Звонки (0)» в
  // карточке каждого не звонившего человека только зашумляет.
  if (calls.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
        <Phone className="w-4 h-4 text-forest-600" />
        {t('admin.calls.sectionTitle', 'Звонки и встречи')}
        <span className="text-xs font-normal text-gray-500">({calls.length})</span>
      </h3>

      <ul className="flex flex-col gap-2">
        {calls.map((c) => (
          <CallSessionItem key={c.id} session={c} />
        ))}
      </ul>
    </div>
  );
};
