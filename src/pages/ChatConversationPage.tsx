import React from 'react';
import { useParams } from 'react-router-dom';
import ChatConversationView from '../components/chats/ChatConversationView';

const ChatConversationPage: React.FC = () => {
  const { chatId } = useParams<{ chatId: string }>();
  
  if (!chatId) {
    return <div>Chat not found</div>;
  }

  return <ChatConversationView chatId={chatId} />;
};

export default ChatConversationPage;