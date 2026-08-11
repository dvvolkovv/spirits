import React, { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import { apiClient } from '../../../services/apiClient';
import { platformLabel } from './deviceLabels';

interface Device {
  signature: string;
  platform: string;
  os: string | null;
  browser: string | null;
  first_seen: string;
  last_seen: string;
  seen_count: number;
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Устройства одного человека, свежие первыми.
 *
 * Открывается там же, где возникает вопрос: пользователь жалуется — видно, с
 * чего он заходит, и можно не спрашивать «а у вас телефон или компьютер».
 */
const UserDevicesList: React.FC<{ phone: string }> = ({ phone }) => {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const resp = await apiClient.get(`/webhook/admin/devices?userId=${encodeURIComponent(phone)}`);
        const data = resp.ok ? await resp.json() : [];
        if (!cancelled) setDevices(Array.isArray(data) ? data : []);
      } catch {
        // Устройства — справка, а не суть карточки: молчаливый пустой блок
        // лучше, чем красная ошибка поверх живой информации о пользователе.
        if (!cancelled) setDevices([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phone]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Устройства</h3>

      {isLoading && <Loader className="w-4 h-4 animate-spin text-forest-600" />}

      {!isLoading && devices?.length === 0 && (
        <p className="text-sm text-gray-400">
          Пока не зафиксированы — запись появится при следующем входе или продлении сессии.
        </p>
      )}

      {!isLoading && devices && devices.length > 0 && (
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.signature} className="flex items-baseline gap-2 text-sm">
              <span className="text-gray-900">{platformLabel(d.platform)}</span>
              <span className="text-gray-500">{[d.browser, d.os].filter(Boolean).join(' · ') || '—'}</span>
              <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                {formatWhen(d.last_seen)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserDevicesList;
