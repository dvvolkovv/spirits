import React from 'react';
import { useTranslation } from 'react-i18next';
import ChatInterface from '../components/chat/ChatInterface';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full flex flex-col pt-16">
      <ChatInterface
        title={t('chat.title')}
        welcomeMessage={t('chat.welcome_message')}
      />
    </div>
  );
};

export default ChatPage;