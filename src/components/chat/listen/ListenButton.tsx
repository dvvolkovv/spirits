// src/components/chat/listen/ListenButton.tsx
import React, { memo, useMemo } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../../utils/formatters';
import { LISTEN_MAX_CHARS, listenPrice, toSpeechText } from './speechText';
import type { ListenPhase } from './useListenPlayer';

interface ListenButtonProps {
  messageId: string;
  /** Сырой текст ответа — разметку и служебные теги срезает toSpeechText. */
  content: string;
  /** Внутреннее имя ассистента ленты: по нему бэк выбирает голос. */
  assistant?: string;
  phase: ListenPhase;
  onToggle: (id: string, text: string, assistant?: string) => void;
}

/**
 * «Прослушать» в строке под ответом, рядом с «Копировать» и тем же видом.
 * memo + useMemo: лента перерисовывается на каждый кусок стрима, а текст для
 * чтения считается регулярками — только когда меняется сам ответ.
 */
const ListenButton: React.FC<ListenButtonProps> = ({ messageId, content, assistant, phase, onToggle }) => {
  const { t } = useTranslation();
  const text = useMemo(() => toSpeechText(content), [content]);
  if (!text) return null;

  const tooLong = text.length > LISTEN_MAX_CHARS;
  const label =
    phase === 'loading' ? t('chat.listen_loading')
      : phase === 'playing' ? t('chat.listen_stop')
        : t('chat.listen');
  // Цена кратна 1000, поэтому форма множественного числа у суффикса одна.
  const hint = tooLong
    ? t('chat.listen_too_long', { max: formatNumber(LISTEN_MAX_CHARS) })
    : phase === 'idle'
      ? t('chat.listen_title', { tokens: formatNumber(listenPrice(text.length)), unit: t('chat.tokens_suffix') })
      : label;
  const Icon = phase === 'loading' ? Loader2 : phase === 'playing' ? Square : Volume2;

  return (
    <button
      type="button"
      onClick={() => onToggle(messageId, text, assistant)}
      disabled={tooLong || phase === 'loading'}
      title={hint}
      aria-label={hint}
      className="inline-flex items-center gap-1 text-gray-400 hover:text-forest-600 transition-colors disabled:opacity-40 disabled:hover:text-gray-400"
    >
      <Icon className={phase === 'loading' ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
      {label}
    </button>
  );
};

export default memo(ListenButton);
