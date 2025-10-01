import React from 'react';
import { useTranslation } from 'react-i18next';
import ChatInterface from '../components/chat/ChatInterface';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <ChatInterface
      title={t('chat.title')}
      welcomeMessage={t('chat.welcome_message')}
    />
  );
};

export default ChatPage;