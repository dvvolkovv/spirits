/** Проба ассистента без регистрации (spec 2026-10-30-guest-trial). */
export type GuestMode = 'off' | 'preview' | 'on';

export interface GuestConfig {
  mode: GuestMode;
  answersPerTrial: number;
  maxChars: number;
}

export interface GuestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GuestAgent {
  id: string;
  name: string;
}

export type GuestEvent =
  | { type: 'guest'; token?: string; left: number }
  | { type: 'begin' }
  | { type: 'ping' }
  | { type: 'item'; content: string }
  | { type: 'end'; content: string }
  | { type: 'wall'; reason: 'limit' | 'closed' }
  | { type: 'error'; code: 'model' | 'busy' };
