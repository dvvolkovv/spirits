import type { ComponentType } from 'react';

export interface NavTab<Id extends string = string> {
  id: Id;
  /**
   * ComponentType<any>, а не узкая сигнатура с одним size: иконки lucide
   * принимают куда больше пропсов (color, strokeWidth, className), и точный
   * тип здесь ничего не защищает — иконку рисуем мы сами строкой ниже.
   */
  icon: ComponentType<any>;
  label: string;
}

/**
 * Нижняя навигация — как в мобильном вебе: зелёный акцент на активной
 * вкладке, приглушённые остальные.
 *
 * pb-[env(safe-area-inset-bottom)] обязателен: без него на айфонах с
 * домашним индикатором подписи заезжают под него.
 */
export function BottomNav<Id extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: Array<NavTab<Id>>;
  active: Id;
  onSelect: (id: Id) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
            active === id ? 'font-medium text-green-600' : 'text-gray-500'
          }`}
          onClick={() => onSelect(id)}
        >
          <Icon size={20} />
          {label}
        </button>
      ))}
    </nav>
  );
}
