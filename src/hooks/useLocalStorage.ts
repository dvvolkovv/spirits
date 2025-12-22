import { useState, useEffect, useCallback } from 'react';

/**
 * Кастомный хук для работы с localStorage
 * Автоматически синхронизирует состояние с localStorage
 * 
 * @param key - ключ в localStorage
 * @param initialValue - начальное значение
 * @returns [storedValue, setValue] - значение и функция для обновления
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // Инициализация состояния из localStorage или начального значения
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Функция для обновления значения
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        // Поддержка функционального обновления
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        
        // Сохраняем в состояние
        setStoredValue(valueToStore);
        
        // Сохраняем в localStorage
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  // Синхронизация с изменениями в других вкладках
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [storedValue, setValue] as const;
}

