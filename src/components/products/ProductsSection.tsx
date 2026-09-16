import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { productsApi, Product, Turn } from '../../services/productsApi';
import { ProductsListView } from './ProductsListView';
import { ProductChat } from './ProductChat';
import { TurnHistory } from './TurnHistory';

interface Props {
  /** Внутри вкладки Студии: свой заголовок не рисуем — его рисует Студия. */
  embedded?: boolean;
}

/**
 * Список продуктов и открытый продукт. Само по себе API продуктов не знает —
 * держит только «какой продукт выбран» и склеивает список, чат и историю.
 *
 * Вынесено из ProductsPage ради вкладки в Студии. Страница /products осталась
 * как редирект: раздел переехал, а ссылки на него могли уже разойтись.
 */
export const ProductsSection: React.FC<Props> = ({ embedded = false }) => {
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
    return <ProductsListView onOpen={setSelected} embedded={embedded} />;
  }

  return (
    <div className={embedded ? '' : 'h-full overflow-y-auto'}>
      <div className={`max-w-4xl mx-auto px-4 ${embedded ? 'pt-4 pb-6' : 'py-6'}`}>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={16} />
          {t('common.back')}
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{selected.name}</h1>
          {selected.domain && (
            // Ссылка, а не подпись: домен есть только у сайта, и добраться до
            // него — первое, что владелец хочет сделать с готовым продуктом.
            <a
              href={`https://${selected.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-forest-700 hover:underline mt-1 inline-block"
            >
              {selected.domain}
            </a>
          )}
        </div>

        <div className="mb-6">
          <ProductChat product={selected} onTurnFinished={reloadTurns} />
        </div>

        <TurnHistory productId={selected.id} turns={turns} onReverted={reloadTurns} />
      </div>
    </div>
  );
};
