import type { ReactNode } from 'react';

/**
 * Карточка — основной строительный блок обоих интерфейсов. Классы взяты из
 * мобильного веба, чтобы Mini App не выглядел чужим приложением.
 *
 * С onClick рендерится <button>, а не <div>: кликабельный div недоступен с
 * клавиатуры и не читается скринридером как действие.
 */
export function Card({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base = 'w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm';
  if (!onClick) return <div className={base}>{children}</div>;
  return (
    <button
      className={`${base} transition active:scale-[0.99] disabled:opacity-50`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
