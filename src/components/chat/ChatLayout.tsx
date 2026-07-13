import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { avatarService } from '../../services/avatarService';
import { customAgentsApi, CustomAgent } from '../../services/customAgentsApi';
import { clsx } from 'clsx';

interface Assistant {
  id: number;
  name: string;
  displayName?: string;
  description: string;
  category?: string;
}

interface ChatLayoutProps {
  children: (props: { selectedAssistant: Assistant | null; onSelectAssistant: (a: Assistant) => void; assistants: Assistant[] }) => React.ReactNode;
}

const getRoleBadge = (desc: string): string => {
  if (desc.includes('Коуч')) return 'Коуч';
  if (desc.includes('Психолог')) return 'Психолог';
  if (desc.includes('Игропрактик')) return 'Игропрактик';
  if (desc.includes('Бухгалтер')) return 'Бухгалтер';
  if (desc.includes('Юрист')) return 'Юрист';
  if (desc.includes('Нумеролог')) return 'Нумеролог';
  if (desc.includes('Маркетолог')) return 'Маркетолог';
  if (desc.includes('HR')) return 'HR';
  return 'Ассистент';
};

const ChatLayout: React.FC<ChatLayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<number, string>>({});
  const [showSidebar, setShowSidebar] = useState(true);

  // Подтягиваем кастомных ассистентов — рендерим секцию «Мои» в sidebar.
  useEffect(() => {
    customAgentsApi.list().then(setCustomAgents).catch(() => {});
  }, []);

  useEffect(() => {
    apiClient.get('/webhook/agents').then(async r => {
      if (r.ok) {
        const data = await r.json();
        setAssistants(data);
        // Restore selected id из sessionStorage (per-tab) ДО подгрузки аватарок —
        // иначе при медленном/нестабильном CDN заголовок чата зависал на «Loading…»,
        // потому что один зависший аватар замораживал весь Promise.all.
        const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
        const saved = sessionStorage.getItem('selected_assistant');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setSelectedId(parsed.id);
            if (!isMobile) setShowSidebar(false); // desktop показывает и sidebar, и chat одновременно — скрывать нечего
          } catch {}
        }
        // Аватары грузим в фоне — инкрементально обновляем мапу.
        data.forEach((a: Assistant) => {
          avatarService.getAvatarUrl(a.id)
            .then(url => setAvatarUrls(prev => ({ ...prev, [a.id]: url })))
            .catch(() => {});
        });
        // На мобилке без явного выбора sidebar остаётся видимым (state init true).
      }
    });
  }, []);

  // selected ищем сначала среди пресетов, потом — синтезируем из customAgents
  // (для синтетических id вида "custom:<uuid>")
  const selected: Assistant | null = (() => {
    if (selectedId === null) return null;
    const preset = assistants.find(a => a.id === selectedId);
    if (preset) return preset;
    const idStr = String(selectedId);
    if (idStr.startsWith('custom:')) {
      const customId = idStr.substring('custom:'.length);
      const custom = customAgents.find(c => c.id === customId);
      if (custom) {
        return {
          id: idStr as unknown as number,
          name: idStr,
          displayName: custom.name,
          description: custom.description ?? '',
          category: 'custom',
        };
      }
    }
    return null;
  })();

  const handleSelect = (a: Assistant) => {
    setSelectedId(a.id);
    setShowSidebar(false);
    sessionStorage.setItem('selected_assistant', JSON.stringify(a));
    // Долговременная память последнего ассистента (переживает закрытие приложения,
    // в отличие от sessionStorage) — для «умного» шортката «Продолжить» (?resume=1).
    try { localStorage.setItem('linkeon_last_assistant', JSON.stringify(a)); } catch {}
  };

  // Deep-link предвыбор ассистента (шорткаты, шеринг). Применяем один раз после
  // загрузки списка агентов.
  //  • ?assistant=<name|id> — конкретный ассистент (заодно снимает барьер
  //    активации молчунов: сразу в разговор, минуя пикер).
  //  • ?resume=1 — «умный» шорткат «Продолжить»: открывает последнего ассистента
  //    из localStorage (лейбл один на всех, назначение персональное).
  // Реагируем на КАЖДУЮ навигацию с deep-link параметрами (location.key меняется
  // при любом переходе, даже на тот же путь /chat) — иначе повторный тап «Продолжить»
  // из виджета/шортката, когда мы уже на экране списка (/chat), не срабатывал:
  // путь тот же, а прежний эффект был one-shot по ref + deps [assistants].
  const location = useLocation();
  const lastAppliedNav = useRef<string>('');
  useEffect(() => {
    if (assistants.length === 0) return;
    const params = new URLSearchParams(location.search);
    const q = params.get('assistant');
    const resume = params.get('resume') === '1';
    if (!q && !resume) return;
    const navKey = location.key + '|' + location.search;
    if (lastAppliedNav.current === navKey) return;
    lastAppliedNav.current = navKey;
    if (q) {
      // Латинские алиасы для человекочитаемых шорткат-URL → к именам агентов.
      const ALIASES: Record<string, string> = {
        roman: 'роман', raya: 'райя', misha: 'миша', masha: 'маша',
        yulia: 'юля', julia: 'юля', yulya: 'юля',
      };
      const norm = (ALIASES[q.toLowerCase()] || q).toLowerCase();
      const match = assistants.find(a =>
        String(a.id) === q ||
        (a.name || '').toLowerCase() === norm ||
        (a.displayName || '').toLowerCase() === norm,
      );
      if (match) handleSelect(match);
    } else if (resume) {
      try {
        const last = localStorage.getItem('linkeon_last_assistant');
        if (last) {
          const a = JSON.parse(last) as Assistant;
          if (a && a.id != null) {
            // Предпочитаем свежую запись из списка (актуальные поля), иначе —
            // сохранённый объект (напр. кастомный ассистент custom:<uuid>).
            const fresh = assistants.find(x => String(x.id) === String(a.id));
            handleSelect(fresh || a);
          }
        }
      } catch { /* нет сохранённого — просто останется пикер */ }
    }
  }, [assistants, location.key, location.search]);

  const visibleAssistants = assistants;
  const myAssistant = visibleAssistants.filter(a => a.category === 'assistant');
  const businessAssistants = visibleAssistants.filter(a => a.category === 'business');
  const personalAssistants = visibleAssistants.filter(a => a.category === 'personal');
  const smmAssistants = visibleAssistants.filter(a => a.category === 'smm');
  const otherAssistants = visibleAssistants.filter(a => !a.category);

  const renderAssistantItem = (a: Assistant) => (
    <button
      key={a.id}
      onClick={() => handleSelect(a)}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
        selectedId === a.id
          ? 'bg-forest-50 border-l-3 border-forest-500'
          : 'hover:bg-gray-50'
      )}
    >
      {avatarUrls[a.id] ? (
        <img src={avatarUrls[a.id]} alt={a.displayName ?? a.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">{(a.displayName ?? a.name)[0]}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm font-medium truncate', selectedId === a.id ? 'text-forest-700' : 'text-gray-900')}>{a.displayName ?? a.name}</p>
        <p className="text-xs text-gray-500 line-clamp-2 leading-tight">{a.description}</p>
      </div>
    </button>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar - always visible on desktop, toggle on mobile */}
      <div className={clsx(
        'border-r border-gray-200 bg-white flex-shrink-0 flex flex-col overflow-hidden transition-all duration-200',
        (showSidebar || !selected) ? 'w-full md:w-72' : 'hidden md:flex md:w-72'
      )}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">{t('chat.assistants')}</h2>
        </div>

        {/* Assistant list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {customAgents.length > 0 && (
            <>
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide px-3 pt-2 pb-1">✨ Мои</p>
              {customAgents.map(c => {
                const synthetic: Assistant = {
                  id: `custom:${c.id}` as unknown as number,
                  name: `custom:${c.id}`,
                  displayName: c.name,
                  description: c.description ?? '',
                  category: 'custom',
                };
                return renderAssistantItem(synthetic);
              })}
            </>
          )}
          {myAssistant.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide px-3 pt-2 pb-1">{t('chat.personal_assistant')}</p>
              {myAssistant.map(renderAssistantItem)}
            </>
          )}
          {businessAssistants.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide px-3 pt-3 pb-1">{t('chat.for_business')}</p>
              {businessAssistants.map(renderAssistantItem)}
            </>
          )}
          {personalAssistants.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide px-3 pt-3 pb-1">{t('chat.personal_growth')}</p>
              {personalAssistants.map(renderAssistantItem)}
            </>
          )}
          {smmAssistants.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide px-3 pt-3 pb-1">SMM</p>
              {smmAssistants.map(renderAssistantItem)}
            </>
          )}
          {otherAssistants.length > 0 && otherAssistants.map(renderAssistantItem)}
        </div>
      </div>

      {/* Chat area */}
      <div className={clsx(
        'flex-1 flex flex-col min-w-0',
        (showSidebar || (!selected && !showSidebar)) && 'hidden md:flex'
      )}>
        {/* Mobile back button */}
        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="md:hidden flex items-center gap-2 px-4 py-2 text-sm text-forest-600 border-b border-gray-100"
          >
            <span>&#8592;</span> {t('chat.all_assistants')}
          </button>
        )}
        {children({ selectedAssistant: selected, onSelectAssistant: handleSelect, assistants })}
      </div>
    </div>
  );
};

export default ChatLayout;
