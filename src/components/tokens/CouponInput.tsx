import React, { useState } from 'react';
import { Ticket, Loader, CheckCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';

interface CouponInputProps {
  onSuccess?: () => void;
}

const CouponInput: React.FC<CouponInputProps> = ({ onSuccess }) => {
  const { refreshTokens } = useAuth();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ tokens: number } | null>(null);

  const errorMessages: Record<string, string> = {
    coupon_not_found: 'Купон не найден',
    coupon_inactive: 'Купон неактивен',
    coupon_already_used: 'Вы уже использовали этот купон',
    no_code_provided: 'Введите код купона',
  };

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError('Введите код купона');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess(null);

    try {
      const response = await apiClient.post('/webhook/coupon/redeem', { code: code.trim() });
      const data = await response.json();

      if (data.success) {
        setSuccess({ tokens: data.tokens_granted ?? data.tokens_added ?? 0 });
        setCode('');
        await refreshTokens();
        onSuccess?.();
      } else {
        setError(errorMessages[data.error] || 'Ошибка при активации купона');
      }
    } catch {
      setError('Ошибка при активации купона');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div data-testid="coupon-root" className="p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center space-x-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          <span data-testid="coupon-success-msg" className="font-medium">
            Начислено {success.tokens.toLocaleString('ru-RU')} токенов!
          </span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="coupon-root" className="p-4 bg-warm-50 rounded-lg border border-warm-200">
      <div className="flex items-center space-x-2 mb-3">
        <Ticket className="w-5 h-5 text-warm-600" />
        <span className="text-sm font-medium text-gray-700">Есть купон?</span>
      </div>
      <div className="flex space-x-2">
        <input
          data-testid="coupon-input"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError('');
          }}
          placeholder="Введите код купона"
          className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent ${
            error ? 'border-red-400' : 'border-gray-300'
          }`}
          disabled={isLoading}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <button
          data-testid="coupon-submit-btn"
          onClick={handleSubmit}
          disabled={isLoading || !code.trim()}
          className="px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
        >
          {isLoading ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <span>Активировать</span>
          )}
        </button>
      </div>
      {error && (
        <p data-testid="coupon-error-msg" className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default CouponInput;
