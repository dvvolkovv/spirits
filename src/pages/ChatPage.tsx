import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import ChatInterface from '../components/chat/ChatInterface';
import ChatLayout from '../components/chat/ChatLayout';

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
    <ChatLayout>
      {({ selectedAssistant, onSelectAssistant, assistants }) => (
        <ChatInterface
          title={t('chat.title')}
          welcomeMessage={t('chat.welcome_message')}
          initialShowTokens={openTokens}
          preSelectedAssistant={selectedAssistant}
          onAssistantSelected={onSelectAssistant}
          allAssistants={assistants}
        />
      )}
    </ChatLayout>
  );
};

export default ChatPage;