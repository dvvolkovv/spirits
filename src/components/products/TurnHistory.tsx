import React from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import { productsApi, Turn } from '../../services/productsApi';

// Статус хода → цвет и ключ перевода. failed/reverted красим отдельно,
// остальные (queued/running/done) держим нейтральными — они не требуют
// внимания владельца продукта так, как явная неудача или уже сделанный откат.
const STATUS_STYLE: Record<string, string> = {
  failed: 'text-red-600',
  reverted: 'text-gray-400',
};

/**
 * Можно ли откатить ход.
 *
 * Экспортируется отдельно от компонента, чтобы правило "когда можно
 * откатывать" проверялось юнит-тестом без рендера DOM.
 */
export function canRevert(turn: Turn): boolean {
  // Служебный ход отката опознаём по полю revert_to_sha, а не по тексту
  // промпта — строковый контракт между бэкендом и фронтом может разъехаться
  // молча (на бэкенде это уже было отдельной находкой).
  if (turn.revert_to_sha) return false;

  // Откатывать можно только успешно завершённый ход с точкой возврата:
  // - failed — агент ничего не закоммитил, дерево не менялось;
  // - reverted — дерево уже вернули этим же откатом раньше;
  // - queued/running — ход ещё идёт, замок и так не даст поставить откат.
  if (turn.status !== 'done') return false;

  // sha_before заполняется только при финализации хода; у ходов, не
  // дошедших до неё, возвращаться попросту некуда.
  return Boolean(turn.sha_before);
}

interface Props {
  productId: string;
  turns: Turn[];
  onReverted: () => void;
}

export const TurnHistory: React.FC<Props> = ({ productId, turns, onReverted }) => {
  const { t } = useTranslation();

  if (turns.length === 0) {
    return <div className="p-4 text-sm text-gray-500">{t('products.history.empty')}</div>;
  }

  const revert = async (turnId: string) => {
    await productsApi.revert(productId, turnId);
    onReverted();
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('products.history.title')}</h2>
      <div className="space-y-2">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-800 break-words">{turn.prompt}</div>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                <span className={STATUS_STYLE[turn.status] ?? ''}>
                  {t(`products.history.${turn.status}`)}
                </span>
                {turn.tokens_spent > 0 && (
                  <span>{t('products.history.tokens', { count: turn.tokens_spent })}</span>
                )}
              </div>
            </div>

            {canRevert(turn) && (
              <button
                onClick={() => revert(turn.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-xs text-gray-600 hover:text-gray-900 shrink-0"
              >
                <Undo2 size={14} />
                {t('products.history.revert')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
