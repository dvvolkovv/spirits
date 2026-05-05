import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { clsx } from 'clsx';

export interface EntityRich {
  name: string;
  gloss?: string;
  aliases?: string[];
  support?: number;
}

interface Props {
  item: EntityRich | string;
  dotColor?: string;
  isEditing?: boolean;
  onRemove?: () => void;
}

/**
 * Строка ценности/интереса/убеждения профиля с возможностью раскрыть
 * персональный gloss и aliases (из каких исходных фраз собрана группа).
 */
export const EntityItem: React.FC<Props> = ({ item, dotColor = 'bg-forest-500', isEditing, onRemove }) => {
  const [open, setOpen] = useState(false);
  const rich = typeof item === 'string' ? { name: item } : item;
  const hasDetails = !!rich.gloss || (rich.aliases && rich.aliases.length > 1);

  return (
    <div className="group">
      <div className="flex items-start space-x-2">
        <div className={clsx('w-2 h-2 rounded-full mt-2 flex-shrink-0', dotColor)} />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => hasDetails && setOpen(!open)}
            className={clsx(
              'text-left w-full flex items-center gap-2',
              hasDetails ? 'cursor-pointer hover:text-forest-700' : 'cursor-default',
            )}
            disabled={!hasDetails}
          >
            <span className="text-gray-700">{rich.name}</span>
            {rich.support && rich.support > 1 && (
              <span className="text-xs text-gray-400">×{rich.support}</span>
            )}
            {hasDetails && (
              <ChevronDown
                className={clsx(
                  'w-4 h-4 text-gray-400 transition-transform flex-shrink-0',
                  open && 'rotate-180',
                )}
              />
            )}
          </button>
          {open && hasDetails && (
            <div className="mt-2 pl-1 border-l-2 border-forest-200 ml-0.5 pl-3 space-y-2">
              {rich.gloss && (
                <p className="text-sm italic text-gray-600 leading-relaxed">{rich.gloss}</p>
              )}
              {rich.aliases && rich.aliases.length > 1 && (
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Включает: </span>
                  {rich.aliases.join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>
        {isEditing && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded flex-shrink-0"
            title="Удалить"
          >
            <X className="w-4 h-4 text-red-600" />
          </button>
        )}
      </div>
    </div>
  );
};
