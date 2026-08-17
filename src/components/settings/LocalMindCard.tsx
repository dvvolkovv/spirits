// «Локальный разум» — вход из меню приложения в нативную настройку on-device помощника
// [A3b/A6]. Виден только в нативном приложении (есть SetupBridge); на вебе скрыт.
// Копия по-русски — как и сами нативные экраны, куда он ведёт (Setup/Model/Backup Activity).
import React from 'react';
import { Cpu, ChevronRight } from 'lucide-react';
import { hasSetupBridge, openSetup } from '../../services/setupClient';

const LocalMindCard: React.FC = () => {
  if (!hasSetupBridge()) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <button
        type="button"
        onClick={openSetup}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className="shrink-0 w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Cpu className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900">Локальный разум</div>
          <div className="text-xs text-gray-500">
            Помощник думает о профиле прямо на телефоне — уведомления, модель, резервная копия
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
      </button>
    </div>
  );
};

export default LocalMindCard;
