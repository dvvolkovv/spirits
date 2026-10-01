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
  // Привязано к id ассистента, а не просто текст: ChatInterface вставляет
  // welcomeMessage в любой пустой чат, и строка «Я Райя» утекала в чат
  // любого другого ассистента — например, по ярлыку /chat?assistant=roman
  // после того, как до этого открывали Райю. Сверяем id при подстановке ниже.
  const [greeting, setGreeting] = useState<{ id: number; text: string } | null>(null);

  // Пришёл по ссылке на конкретного ассистента — со страницы на linkeon.io
  // (через вход: запомненный выбор) или по шорткату (?assistant=).
  //  • 'none'    — ссылки не было, обычный вход.
  //  • 'pending'  — ссылка есть, но ChatLayout ещё не догрузил список
  //                 ассистентов (пока список грузится, экран тем не
  //                 показываем, иначе он мигнёт поверх открывающегося чата).
  //  • 'matched'  — ассистент из ссылки нашёлся в ростере, выбор сделан.
  //  • 'missed'   — ссылка была, но такого ассистента в ростере нет (сняли
  //                 после выката лендинга) — человек ничего не выбирал, это
  //                 обычный новичок, ему — обычный экран тем.
  // Пустой `?assistant=` НЕ считается ссылкой (раньше `.has()` засчитывал и
  // его) — читаем значение, а не факт присутствия параметра.
  const [deepLink, setDeepLink] = useState<'none' | 'pending' | 'matched' | 'missed'>(() =>
    new URLSearchParams(location.search).get('assistant')?.trim() || peekPendingAssistant() !== null
      ? 'pending'
      : 'none',
  );

  // Онбординг закрывается ТОЛЬКО когда ссылка реально привела к выбору
  // ('matched') — не на 'pending' (рано, список ещё не готов) и не на
  // 'missed' (человек ничего не выбирал). Отдельным эффектом, а не в
  // onDeepLink: профиль с флагом onboarded может догрузиться позже списка
  // ассистентов.
  useEffect(() => {
    if (deepLink === 'matched' && user?.onboarded === false) completeOnboarding();
  }, [deepLink, user?.onboarded, completeOnboarding]);

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
  // конкретного ассистента, который нашёлся ('matched'), экран выбора темы
  // не встречает: выбор уже сделан на странице ассистента на linkeon.io. Пока
  // список грузится ('pending') — тоже не показываем, иначе он мигнёт и
  // пропадёт. 'missed' (ссылка на снятого ассистента) — как и 'none',
  // обычный новичок видит обычный экран тем.
  const showMatch = user?.onboarded === false && !dismissed && (deepLink === 'none' || deepLink === 'missed');

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
        onDeepLink={(a) => {
          if (a) {
            // То же приветствие, что после выбора темы: видно только в пустом чате.
            setGreeting({
              id: a.id,
              text: t('onboarding.match.greeting', { name: a.displayName || a.name, role: a.description || '' }),
            });
            setDeepLink('matched');
          } else {
            setDeepLink('missed');
          }
        }}
      >
      {({ selectedAssistant, onSelectAssistant, assistants }) =>
        showMatch ? (
          <OnboardingMatch
            assistants={assistants}
            onPickTheme={(a) => {
              setGreeting({
                id: a.id,
                text: t('onboarding.match.greeting', {
                  name: a.displayName || a.name,
                  role: a.description || '',
                }),
              });
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
            // Приветствие — только для того ассистента, которому оно сделано:
            // после переключения на другого внутри уже открытого чата
            // (например, кнопкой в сайдбаре) greeting.id больше не совпадает
            // с selectedAssistant.id, и подставляется обычное приветствие.
            welcomeMessage={greeting && selectedAssistant?.id === greeting.id ? greeting.text : t('chat.welcome_message')}
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
