import React, { useId } from 'react';
import { fieldClasses, CONTROL_HEIGHT, CONTROL_RADIUS } from './controlStyles';

// Omit<'prefix'> обязателен: в InputHTMLAttributes уже есть HTML-атрибут
// prefix?: string, и без него наш ReactNode-слот не сходится по типу (TS2430).
interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  error?: string | null;
  /** Слот слева ВНУТРИ рамки — под выбор страны в поле телефона. */
  prefix?: React.ReactNode;
}

/**
 * Поле с лейблом и ошибкой. Ошибка всегда под полем и всегда одного цвета:
 * до этого на экране входа соседствовали text-red-500 и text-red-600, а часть
 * ошибок вообще уходила в системный alert().
 */
export const TextField: React.FC<TextFieldProps> = ({
  label, error, prefix, className, id, ...rest
}) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm text-gray-600 mb-1.5">
        {label}
      </label>

      {prefix ? (
        <div className={`flex items-stretch bg-white border ${CONTROL_RADIUS} ${CONTROL_HEIGHT} ${
          error ? 'border-red-400' : 'border-gray-200'
        } focus-within:ring-2 ${
          error ? 'focus-within:ring-red-500/20 focus-within:border-red-500'
                : 'focus-within:ring-forest-700/20 focus-within:border-forest-700'
        } transition-colors duration-150`}>
          {prefix}
          <input
            {...rest}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={`flex-1 min-w-0 bg-transparent px-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none ${className ?? ''}`}
          />
        </div>
      ) : (
        <input
          {...rest}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={fieldClasses(!!error, className)}
        />
      )}

      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600 mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
};

export default TextField;
