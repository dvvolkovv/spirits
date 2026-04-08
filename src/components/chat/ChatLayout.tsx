import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/apiClient';
import { avatarService } from '../../services/avatarService';
import { clsx } from 'clsx';

interface Assistant {
  id: number;
  name: string;
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
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<number, string>>({});
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    apiClient.get('/webhook/agents').then(async r => {
      if (r.ok) {
        const data = await r.json();
        setAssistants(data);
        // Load avatars
        const urls: Record<number, string> = {};
        await Promise.all(data.map(async (a: Assistant) => {
          try { urls[a.id] = await avatarService.getAvatarUrl(a.id); } catch {}
        }));
        setAvatarUrls(urls);
        // Restore selected
        const saved = localStorage.getItem('selected_assistant');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setSelectedId(parsed.id);
            setShowSidebar(false);
          } catch {}
        }
      }
    });
  }, []);

  const selected = assistants.find(a => a.id === selectedId) || null;

  const handleSelect = (a: Assistant) => {
    setSelectedId(a.id);
    setShowSidebar(false);
    localStorage.setItem('selected_assistant', JSON.stringify(a));
  };

  const businessAssistants = assistants.filter(a => a.category === 'business');
  const personalAssistants = assistants.filter(a => a.category === 'personal');
  const otherAssistants = assistants.filter(a => !a.category);

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
        <img src={avatarUrls[a.id]} alt={a.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">{a.name[0]}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm font-medium truncate', selectedId === a.id ? 'text-forest-700' : 'text-gray-900')}>{a.name}</p>
        <p className="text-xs text-gray-500 truncate">{getRoleBadge(a.description)}</p>
      </div>
    </button>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar - always visible on desktop, toggle on mobile */}
      <div className={clsx(
        'border-r border-gray-200 bg-white flex-shrink-0 flex flex-col overflow-hidden transition-all duration-200',
        showSidebar ? 'w-full md:w-72' : 'hidden md:flex md:w-72'
      )}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Ассистенты</h2>
        </div>

        {/* Assistant list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {businessAssistants.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-1">Для бизнеса</p>
              {businessAssistants.map(renderAssistantItem)}
            </>
          )}
          {personalAssistants.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">Личностный рост</p>
              {personalAssistants.map(renderAssistantItem)}
            </>
          )}
          {otherAssistants.length > 0 && otherAssistants.map(renderAssistantItem)}
        </div>
      </div>

      {/* Chat area */}
      <div className={clsx(
        'flex-1 flex flex-col min-w-0',
        showSidebar && 'hidden md:flex'
      )}>
        {/* Mobile back button */}
        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="md:hidden flex items-center gap-2 px-4 py-2 text-sm text-forest-600 border-b border-gray-100"
          >
            <span>&#8592;</span> Все ассистенты
          </button>
        )}
        {children({ selectedAssistant: selected, onSelectAssistant: handleSelect, assistants })}
      </div>
    </div>
  );
};

export default ChatLayout;
