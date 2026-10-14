import type { TgBotConfig } from '../../services/tgBotApi';

/**
 * Личный ли это чат с ботом. Личка заводит свою строку в том же списке, что и
 * группы (ensurePrivateConfig на бэке): положительный id чата, имя «Linkeon».
 * У группы id отрицательный; у бота, который ждёт группы, — null.
 */
export const isPrivateChat = (c: Pick<TgBotConfig, 'tgChatId'>): boolean =>
  c.tgChatId !== null && !c.tgChatId.startsWith('-');
