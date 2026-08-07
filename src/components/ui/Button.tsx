import React from 'react';
import { Loader } from 'lucide-react';
import { buttonClasses, type ButtonVariant } from './controlStyles';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Значок слева в слоте фиксированного размера — чтобы подписи стояли по одной линии. */
  leading?: React.ReactNode;
}

/**
 * Тонкая обёртка над buttonClasses: своей логики нет, вся геометрия и
 * состояния — в controlStyles, где они покрыты тестами.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading = false,
  leading,
  disabled,
  className,
  children,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={buttonClasses(variant, className)}
  >
    {loading ? (
      <Loader className="w-4 h-4 animate-spin" aria-hidden />
    ) : (
      leading && <span className="w-[18px] h-[18px] shrink-0 flex items-center justify-center">{leading}</span>
    )}
    {children}
  </button>
);

export default Button;
