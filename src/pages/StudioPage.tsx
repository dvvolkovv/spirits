import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Bot, Send, Server } from 'lucide-react';
import { CustomAgentsListView } from '../components/custom-agents/CustomAgentsListView';
import { TgBotsListView } from '../components/tg-bot/TgBotsListView';
import { ProductsSection } from '../components/products/ProductsSection';
import { PendingProductActions } from '../components/products/PendingProductActions';
import { isUuid } from '../utils/uuid';
import { paramWord } from '../utils/cabinetSections';

type Tab = 'agents' | 'bots' | 'products';

const StudioPage: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  // ПРОДУКТЫ ОТКРЫТЫ ВСЕМ (кусок 4б). Прежде тут стоял гейт по isAdmin, и он
  // снят ЦЕЛИКОМ — в обоих местах сразу: и в списке вкладок, и в разборе
  // параметра. Половина снятого гейта была бы хуже целого: вкладка в списке
  // при непринимающем разборе даёт кнопку, которая возвращает на ассистентов,
  // и это выглядит как поломка.
  //
  // Ограничивает теперь не право, а ПРЕДЕЛ ЧИСЛА ПРОДУКТОВ НА АККАУНТ, и стоит
  // он на сервере (LimitsService, 422 при заведении третьего). Прятать вкладку
  // ради того же незачем: список своих продуктов и кабинет аренды нужны как
  // раз тем, кто предел уже выбрал.
  // Ведущие буквы значения (utils/cabinetSections.ts, paramWord): знак
  // вплотную за адресом из ответа ассистента («…?tab=bots）») автоссылка
  // забирает в параметр, а вкладка всё равно сверяется со своими тремя.
  const raw = paramWord(params.get('tab'));
  const tab: Tab = raw === 'bots' ? 'bots' : raw === 'products' ? 'products' : 'agents';

  const rawAction = params.get('action');
  const actionId = isUuid(rawAction) ? rawAction : null;
  const closeAction = () => {
    const p = new URLSearchParams(params);
    p.delete('action');
    setParams(p, { replace: true });
  };

  // Карточка под списком ниже решила ожидающее действие (удаление доехало до
  // «готово», новый бот создан) — список продуктов этого не знает сам: у
  // ProductsSection нет способа перечитать себя снаружи (своего reload оно не
  // отдаёт — проверено), так что перечитывание — через remount по key.
  // Полный remount, а не точечный reloadList(): он же откатывает открытый
  // продукт обратно к списку, если решённое действие было про него.
  const [productsReloadKey, setProductsReloadKey] = useState(0);
  const onActionResolved = () => setProductsReloadKey((n) => n + 1);

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'agents') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  const tabs = [
    ['agents', t('studio.tabs.agents'), Bot],
    ['bots', t('studio.tabs.bots'), Send],
    ['products', t('studio.tabs.products'), Server],
  ] as const;

  const subtitle =
    tab === 'agents'
      ? t('pages.studio.agents_subtitle')
      : tab === 'bots'
        ? t('pages.studio.bots_subtitle')
        : t('products.subtitle');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('studio.title')}</h1>
        <p className="text-sm text-gray-500 mb-4">{subtitle}</p>

        {/*
          На телефоне три вкладки не влезали (при 390 px «Продукты» обрезались,
          «Telegram-боты» ломались в две строки). На узком экране иконки скрыты,
          и вкладки помещаются целиком; прокрутка вбок — страховка для длинных
          языков и самых узких экранов.
          Серая линия — у внешнего блока, а прокрутка — у внутреннего, сдвинутого
          на 1px вниз: так подчёркивание активной вкладки ложится на линию и не
          обрезается краем прокрутки.
        */}
        <div className="border-b border-gray-200">
          <div
            className="-mb-px flex gap-1 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {tabs.map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                  tab === k
                    ? 'border-forest-600 text-forest-700'
                    : 'border-transparent text-gray-500 hover:text-forest-600'
                }`}
              >
                <Icon size={16} className="hidden sm:block" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'agents' && <CustomAgentsListView embedded />}
      {tab === 'bots' && <TgBotsListView embedded onOpenProducts={() => setTab('products')} />}
      {tab === 'products' && (
        <PendingProductActions focusId={actionId} onCloseFocus={closeAction} onResolved={onActionResolved} />
      )}
      {tab === 'products' && <ProductsSection key={productsReloadKey} embedded />}
    </div>
  );
};

export default StudioPage;
