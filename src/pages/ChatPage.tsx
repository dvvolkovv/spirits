import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import ChatInterface from '../components/chat/ChatInterface';
import ChatLayout from '../components/chat/ChatLayout';
import OnboardingMatch from '../components/onboarding/OnboardingMatch';
import { useAuth } from '../contexts/AuthContext';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, completeOnboarding } = useAuth();
  const [openTokens, setOpenTokens] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);   // принудительное открытие по кнопке
  const [dismissed, setDismissed] = useState(false);    // прошёл match в этой сессии
  const [greeting, setGreeting] = useState<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'tokens') {
      setOpenTokens(true);
    }
  }, [location.search]);

  // Показ ТОЛЬКО при onboarded === false (явно). undefined/неизвестно
  // (профиль не догрузился) → fail-open в чат, возвращающихся не блокируем.
  const showMatch = matchOpen || (user?.onboarded === false && !dismissed);

  return (
    <ChatLayout>
      {({ selectedAssistant, onSelectAssistant, assistants }) =>
        showMatch ? (
          <OnboardingMatch
            assistants={assistants}
            onPickTheme={(a) => {
              setGreeting(
                t('onboarding.match.greeting', {
                  name: a.displayName || a.name,
                  role: a.description || '',
                }),
              );
              onSelectAssistant(a);
              setDismissed(true);
              setMatchOpen(false);
              if (user?.onboarded === false) completeOnboarding();
            }}
            onShowAll={() => {
              setDismissed(true);
              setMatchOpen(false);
              if (user?.onboarded === false) completeOnboarding();
            }}
          />
        ) : (
          <ChatInterface
            title={t('chat.title')}
            welcomeMessage={greeting ?? t('chat.welcome_message')}
            initialShowTokens={openTokens}
            preSelectedAssistant={selectedAssistant}
            onAssistantSelected={onSelectAssistant}
            allAssistants={assistants}
            onOpenMatch={() => setMatchOpen(true)}
          />
        )
      }
    </ChatLayout>
  );
};

export default ChatPage;
