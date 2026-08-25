import React from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Phone, PhoneOff, Mic, Loader2, X } from 'lucide-react';
import { useVoiceCall, CallState } from './useVoiceCall';

interface VoiceCallModalProps {
  /** Отображаемое имя ассистента (Роман) — заголовок модалки. */
  assistantName: string;
  onClose: () => void;
}

/** Состояние хука → ключ в chat.voice_call.* для строки состояния. */
const STATE_LABEL_KEY: Record<CallState, string> = {
  idle: 'ready',
  connecting: 'connecting',
  active: 'active',
  ended: 'ended',
  error: 'error',
};

/**
 * Модалка голосового звонка Роману поверх экрана чата. Владеет всем
 * жизненным циклом звонка через useVoiceCall — снаружи только имя
 * ассистента и колбэк закрытия.
 */
export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({ assistantName, onClose }) => {
  const { t } = useTranslation();
  const { state, error, thinking, start, hangUp } = useVoiceCall();

  // Закрытие крестиком обязано класть трубку: иначе комната и микрофон
  // остаются активными до таймаута воркера, а бэкенд не узнаёт, что звонок
  // закончился, пока пользователь не откроет карточку сам.
  const handleClose = () => {
    void hangUp();
    onClose();
  };

  const canCall = state === 'idle' || state === 'error';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div
        data-testid="voice-call-modal"
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-forest-50 rounded-full flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4 text-forest-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{assistantName}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6">
          <div
            data-testid="voice-call-state"
            className={clsx(
              'flex items-center justify-center gap-2 mb-2 px-4 py-3 rounded-lg border text-sm font-medium',
              state === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : state === 'active'
                  ? 'bg-forest-50 border-forest-200 text-forest-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600',
            )}
          >
            {state === 'connecting' && <Loader2 className="w-4 h-4 animate-spin" />}
            {state === 'active' && <Mic className="w-4 h-4" />}
            <span>{t(`chat.voice_call.${STATE_LABEL_KEY[state]}`)}</span>
          </div>

          {state === 'error' && error && (
            <p className="text-sm text-red-600 text-center mb-4">{error}</p>
          )}

          {thinking.length > 0 && (
            <div className="space-y-2 mb-6 mt-4">
              {thinking.map((item) => (
                <div
                  key={item.jobId}
                  data-testid="voice-call-thinking"
                  className="flex items-center gap-2 px-3 py-2 bg-warm-50 border border-warm-200 rounded-lg text-sm text-warm-800"
                >
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span>{t('chat.voice_call.specialist_thinking', { name: item.specialist })}</span>
                </div>
              ))}
            </div>
          )}

          <div className={clsx(thinking.length === 0 && 'mt-4')}>
            {canCall ? (
              <button
                onClick={() => start()}
                data-testid="voice-call-start"
                className="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 bg-forest-600 text-white hover:bg-forest-700"
              >
                <Phone className="w-5 h-5" />
                <span>{t('chat.voice_call.start')}</span>
              </button>
            ) : (
              <button
                onClick={() => hangUp()}
                data-testid="voice-call-hangup"
                className="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 bg-red-600 text-white hover:bg-red-700"
              >
                <PhoneOff className="w-5 h-5" />
                <span>{t('chat.voice_call.hang_up')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
