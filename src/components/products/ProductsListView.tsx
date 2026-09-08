import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, CircleDot } from 'lucide-react';
import { productsApi, Product } from '../../services/productsApi';

// Цвет статуса — вынесен из JSX, чтобы не пересчитывать на каждый рендер
// и не плодить длинные тернарники внутри карточки.
const STATUS_STYLE: Record<string, string> = {
  running: 'text-green-600',
  degraded: 'text-amber-600',
  stopped: 'text-gray-400',
  provisioning: 'text-blue-600',
  archived: 'text-gray-400',
};

interface Props {
  onOpen: (product: Product) => void;
}

export const ProductsListView: React.FC<Props> = ({ onOpen }) => {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // productsApi.list() сам гасит сетевые/авторизационные ошибки и отдаёт
    // пустой список (см. комментарий в productsApi.ts) — try/catch тут не
    // нужен, в отличие от CustomAgentsListView, где customAgentsApi бросает
    // исключение при не-2xx.
    productsApi.list().then((rows) => {
      setProducts(rows);
      setLoading(false);
    });
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t('products.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('products.subtitle')}</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">{t('common.loading')}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-forest-600 to-forest-800 flex items-center justify-center mx-auto mb-4 shadow-md">
              <Server size={24} className="text-white" />
            </div>
            <p className="text-gray-600 font-medium">{t('products.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpen(p)}
                className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 text-left"
              >
                <Server className="w-5 h-5 text-gray-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">{p.name}</div>
                  {p.domain && <div className="text-sm text-gray-500 truncate">{p.domain}</div>}
                </div>
                <span
                  className={`flex items-center gap-1 text-xs shrink-0 ${STATUS_STYLE[p.status] ?? 'text-gray-400'}`}
                >
                  <CircleDot className="w-3 h-3" />
                  {t(`products.status.${p.status}`)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
