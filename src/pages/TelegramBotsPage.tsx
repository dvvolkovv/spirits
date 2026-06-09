import React from 'react';
import { TgBotsListView } from '../components/tg-bot/TgBotsListView';
import { TgBotCreateWizard } from '../components/tg-bot/TgBotCreateWizard';

export default function TelegramBotsPage() {
  return <TgBotsListView />;
}

export const TelegramBotsNewPage: React.FC = () => <TgBotCreateWizard />;
