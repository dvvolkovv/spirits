import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { productActionsApi } from '../../services/productActionsApi';
import { ProductActionCard } from './ProductActionCard';

/**
 * Действия, которые ждут подтверждения, на вкладке «Продукты»: запасной путь,
 * если карточка не прикрепилась к ответу, и цель ссылки из клиентов без
 * карточек. Карточка из ссылки (?action=) — первой и с кнопкой «Закрыть».
 */
export function PendingProductActions({ focusId, onCloseFocus }: { focusId: string | null; onCloseFocus: () => void }) {
  const { t } = useTranslation();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void productActionsApi.pending().then((list) => {
      if (alive) setIds(list.map((a) => a.id));
    });
    return () => {
      alive = false;
    };
  }, [focusId]);

  const all = [...(focusId ? [focusId] : []), ...ids.filter((id) => id !== focusId)];
  if (!all.length) return null;
  return (
    <section className="mb-4">
      <h2 className="text-sm font-medium text-gray-700 mb-1">{t('products.action.pendingTitle')}</h2>
      {all.map((id) => (
        <ProductActionCard key={id} actionId={id} via="cabinet" onClose={id === focusId ? onCloseFocus : undefined} />
      ))}
    </section>
  );
}
