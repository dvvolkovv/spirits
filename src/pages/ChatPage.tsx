import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import ChatInterface from '../components/chat/ChatInterface';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [openTokens, setOpenTokens] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'tokens') {
      setOpenTokens(true);
    }
  }, [location.search]);

  return (
    <div className="h-full flex flex-col pt-16 md:pt-0">
      <ChatInterface
        title={t('chat.title')}
        welcomeMessage={t('chat.welcome_message')}
        initialShowTokens={openTokens}
      />
    </div>
  );
};

export default ChatPage;