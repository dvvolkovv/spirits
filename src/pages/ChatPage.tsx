import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import ChatInterface from '../components/chat/ChatInterface';
import ChatLayout from '../components/chat/ChatLayout';
import OnboardingMatch from '../components/onboarding/OnboardingMatch';
import { useAuth } from '../contexts/AuthContext';
import { TokenPackages } from '../components/tokens/TokenPackages';
import { peekPendingAssistant } from '../utils/pendingAssistant';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuth();
  const [openTokens, setOpenTokens] = useState(false);
  const [dismissed, setDismissed] = useState(false);    // прошёл match в этой сессии
  const [greeting, setGreeting] = useState<string | undefined>(undefined);

  // Пришёл по ссылке на конкретного ассистента — со страницы на linkeon.io
  // (через вход: запомненный выбор) или по шорткату (?assistant=). Выбор уже
  // сделан, экран «С чего начнём?» ему не нужен. Считается один раз при
  // монтировании: ChatLayout стирает запомненное, применив его, и пересчёт
  // вернул бы экран выбора поверх открытого чата.
  const [deepLinkRequested] = useState(
    () => new URLSearchParams(location.search).has('assistant') || peekPendingAssistant() !== null,
  );

  // Онбординг пройден: ассистента человек выбрал сам. Отдельным эффектом, а не
  // в onDeepLink: профиль с флагом onboarded может догрузиться позже списка
  // ассистентов.
  useEffect(() => {
    if (deepLinkRequested && user?.onboarded === false) completeOnboarding();
  }, [deepLinkRequested, user?.onboarded, completeOnboarding]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'tokens') {
      setOpenTokens(true);
    }
  }, [location.search]);

  // Показ ТОЛЬКО при onboarded === false (явно). undefined/неизвестно
  // (профиль не догрузился) → fail-open в чат, возвращающихся не блокируем.
  // Ручного переоткрытия нет: ссылка «Подобрать специалиста» убрана из шапки,
  // смена ассистента живёт в выпадающем списке. Пришедшего по ссылке на
  // конкретного ассистента (deepLinkRequested) экран выбора темы не встречает:
  // выбор уже сделан на странице ассистента на linkeon.io.
  const showMatch = user?.onboarded === false && !dismissed && !deepLinkRequested;

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
      <ChatLayout
        onDeepLink={(a) =>
          // То же приветствие, что после выбора темы: видно только в пустом чате.
          setGreeting(t('onboarding.match.greeting', { name: a.displayName || a.name, role: a.description || '' }))
        }
      >
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
              if (user?.onboarded === false) completeOnboarding();
            }}
            onShowAll={() => {
              setDismissed(true);
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
          />
        )
      }
      </ChatLayout>
    </>
  );
};

export default ChatPage;
