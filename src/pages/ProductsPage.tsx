import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { productsApi, Product, Turn } from '../services/productsApi';
import { ProductsListView } from '../components/products/ProductsListView';
import { ProductChat } from '../components/products/ProductChat';
import { TurnHistory } from '../components/products/TurnHistory';

// Тонкая страница в стиле StudioPage.tsx: сама не знает про API продуктов,
// только держит "какой продукт выбран" и склеивает список/чат/историю.
const ProductsPage: React.FC = () => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Product | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);

  // Общий колбэк для двух источников обновления истории: конца хода в чате
  // и успешного отката из TurnHistory — оба меняют список ходов на бэкенде
  // одинаково, перечитывать его нужно тем же способом.
  const reloadTurns = useCallback(() => {
    if (selected) productsApi.turns(selected.id).then(setTurns);
  }, [selected]);

  useEffect(() => {
    reloadTurns();
  }, [reloadTurns]);

  if (!selected) {
    return <ProductsListView onOpen={setSelected} />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={16} />
          {t('common.back')}
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{selected.name}</h1>
          {selected.domain && <p className="text-sm text-gray-500 mt-1">{selected.domain}</p>}
        </div>

        <div className="mb-6">
          <ProductChat product={selected} onTurnFinished={reloadTurns} />
        </div>

        <TurnHistory productId={selected.id} turns={turns} onReverted={reloadTurns} />
      </div>
    </div>
  );
};

export default ProductsPage;
