import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatInterface from '../components/chat/ChatInterface';
import ChatLayout from '../components/chat/ChatLayout';
import OnboardingMatch from '../components/onboarding/OnboardingMatch';
import { useAuth } from '../contexts/AuthContext';
import { TokenPackages } from '../components/tokens/TokenPackages';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
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
    <>
      {/* Модалка пополнения живёт на уровне СТРАНИЦЫ, а не внутри ChatInterface.
          Внутри она была недостижима для всех, кто приходит по «?view=tokens»
          без выбранного ассистента: в этом состоянии ChatLayout отдаёт весь
          экран своему сайдбару со списком ассистентов, а колонку с
          ChatInterface прячет классом `hidden md:flex`. Модалка оказывалась в
          поддереве с display:none — в DOM есть, размер 0×0, на экране ничего.
          Пользователь жал «Пополнить» в профиле и попадал на список
          ассистентов; на телефоне это ловилось почти всегда, потому что
          признак выбранного ассистента хранится в sessionStorage, а он живёт
          только в пределах вкладки.
          Здесь оверлей вне обеих скрываемых веток и работает одинаково на
          мобиле и десктопе. Кнопка пополнения внутри самого чата продолжает
          открывать свою модалку — она доступна только когда чат и так виден. */}
      {openTokens && (
        <TokenPackages
          onClose={() => {
            setOpenTokens(false);
            // Убираем ?view=tokens из адреса: иначе параметр остаётся висеть, и
            // модалка возвращается при любом следующем ререндере страницы.
            navigate('/chat', { replace: true });
          }}
        />
      )}
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
            preSelectedAssistant={selectedAssistant}
            onAssistantSelected={onSelectAssistant}
            allAssistants={assistants}
            onOpenMatch={() => setMatchOpen(true)}
          />
        )
      }
      </ChatLayout>
    </>
  );
};

export default ChatPage;
