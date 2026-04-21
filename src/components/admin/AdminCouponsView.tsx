import React, { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, Save, Loader } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

interface Coupon {
  id: number;
  code: string;
  token_amount: number;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

const AdminCouponsView: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newTokenAmount, setNewTokenAmount] = useState(60000);
  const [isCreating, setIsCreating] = useState(false);

  // Edit state
  const [editTokenAmount, setEditTokenAmount] = useState(0);

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/webhook/admin/coupons', { action: 'list' });
      if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);
      const data = await response.json();
      setCoupons(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCoupon = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setEditTokenAmount(coupon.token_amount);
    setShowCreateForm(false);
  };

  const handleCreate = async () => {
    if (!newCode.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const response = await apiClient.post('/webhook/admin/coupons', {
        action: 'create',
        code: newCode.trim().toUpperCase(),
        token_amount: newTokenAmount,
      });
      if (!response.ok) throw new Error(`Ошибка создания: ${response.status}`);
      const data = await response.json();
      // API returns coupon object directly, or { success, coupon } wrapper
      const coupon = data.coupon ?? (data.id ? data : null);
      if (coupon) {
        setCoupons([coupon, ...coupons]);
        setNewCode('');
        setNewTokenAmount(60000);
        setShowCreateForm(false);
      } else {
        throw new Error(data.error || 'Ошибка создания купона');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await apiClient.post('/webhook/admin/coupons', {
        action: 'update',
        id: coupon.id,
        is_active: !coupon.is_active,
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      const updated = coupons.map((c) =>
        c.id === coupon.id ? { ...c, is_active: !c.is_active } : c
      );
      setCoupons(updated);
      if (selectedCoupon?.id === coupon.id) {
        setSelectedCoupon({ ...selectedCoupon, is_active: !coupon.is_active });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAmount = async () => {
    if (!selectedCoupon || editTokenAmount === selectedCoupon.token_amount) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await apiClient.post('/webhook/admin/coupons', {
        action: 'update',
        id: selectedCoupon.id,
        token_amount: editTokenAmount,
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      const updated = coupons.map((c) =>
        c.id === selectedCoupon.id ? { ...c, token_amount: editTokenAmount } : c
      );
      setCoupons(updated);
      setSelectedCoupon({ ...selectedCoupon, token_amount: editTokenAmount });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Удалить купон "${coupon.code}"?`)) return;
    setError(null);
    try {
      const response = await apiClient.post('/webhook/admin/coupons', {
        action: 'delete',
        id: coupon.id,
      });
      if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
      setCoupons(coupons.filter((c) => c.id !== coupon.id));
      if (selectedCoupon?.id === coupon.id) setSelectedCoupon(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const formatTokens = (n: number) => n.toLocaleString('ru-RU');
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 flex items-center">
            <Shield className="w-6 h-6 mr-2 text-forest-600" />
            Управление купонами
          </h1>
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setShowCreateForm(true);
                setSelectedCoupon(null);
              }}
              className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />
              Создать
            </button>
            <button
              onClick={loadCoupons}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Загрузка...' : 'Обновить'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left: coupon list */}
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Купоны</h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-forest-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : coupons.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Нет купонов</p>
            ) : (
              <div className="space-y-2">
                {coupons.map((coupon) => (
                  <button
                    key={coupon.id}
                    onClick={() => handleSelectCoupon(coupon)}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded-lg transition-colors',
                      selectedCoupon?.id === coupon.id
                        ? 'bg-forest-100 text-forest-900 font-medium'
                        : 'hover:bg-gray-100 text-gray-700'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">{coupon.code}</span>
                      <span
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded-full',
                          coupon.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        )}
                      >
                        {coupon.is_active ? 'Акт.' : 'Выкл.'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatTokens(coupon.token_amount)} токенов · {coupon.usage_count} исп.
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: detail or create form */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showCreateForm ? (
            <div data-testid="admin-coupon-form" className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Новый купон</h2>
              <div className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Код купона
                  </label>
                  <input
                    data-testid="admin-coupon-code-input"
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="WELCOME2025"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Количество токенов
                  </label>
                  <input
                    data-testid="admin-coupon-tokens-input"
                    type="number"
                    value={newTokenAmount}
                    onChange={(e) => setNewTokenAmount(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    data-testid="admin-coupon-create-btn"
                    onClick={handleCreate}
                    disabled={isCreating || !newCode.trim()}
                    className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors disabled:opacity-50 flex items-center"
                  >
                    {isCreating ? (
                      <Loader className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1" />
                    )}
                    Создать
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          ) : selectedCoupon ? (
            <div className="p-6 overflow-y-auto pb-20 md:pb-6">
              <div className="max-w-lg space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">
                    Купон: <span className="font-mono">{selectedCoupon.code}</span>
                  </h2>
                  <p className="text-sm text-gray-500">
                    Создан: {formatDate(selectedCoupon.created_at)}
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Статус</span>
                    <p
                      className={clsx(
                        'text-sm font-medium',
                        selectedCoupon.is_active ? 'text-green-600' : 'text-gray-500'
                      )}
                    >
                      {selectedCoupon.is_active ? 'Активен' : 'Выключен'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggle(selectedCoupon)}
                    disabled={isSaving}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {selectedCoupon.is_active ? (
                      <ToggleRight className="w-8 h-8 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-400" />
                    )}
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Количество токенов
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      value={editTokenAmount}
                      onChange={(e) => setEditTokenAmount(parseInt(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                    />
                    {editTokenAmount !== selectedCoupon.token_amount && (
                      <button
                        onClick={handleSaveAmount}
                        disabled={isSaving}
                        className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors disabled:opacity-50 flex items-center"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Сохранить
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Использований:</span>
                  <span className="ml-2 text-sm text-gray-900 font-semibold">
                    {selectedCoupon.usage_count}
                  </span>
                </div>

                <button
                  onClick={() => handleDelete(selectedCoupon)}
                  className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Удалить купон
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Выберите купон или создайте новый</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCouponsView;
