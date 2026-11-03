import React from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface AdminPageHeaderProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onRefresh: () => void;
  isLoading?: boolean;
  refreshLabel?: string;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  icon,
  title,
  description,
  onRefresh,
  isLoading = false,
  refreshLabel = 'Обновить',
}) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-forest-600 flex-shrink-0">{icon}</span>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      </div>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
    <button
      type="button"
      onClick={onRefresh}
      disabled={isLoading}
      className="self-start sm:self-auto min-h-11 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
    >
      <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
      {refreshLabel}
    </button>
  </div>
);
