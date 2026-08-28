import React from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Phone, PhoneOff, Mic, MicOff, Loader2, X, Check, AlertTriangle, FileText } from 'lucide-react';
import { useVoiceCall, CallState, type Consultation } from './useVoiceCall';

interface VoiceCallModalProps {
  /** Отображаемое имя ассистента (Роман) — заголовок модалки. */
  assistantName: string;
  onClose: () => void;
}

/** Состояние хука → ключ в chat.voice_call.* для строки состояния. */
const STATE_LABEL_KEY: Record<CallState, string> = {
  idle: 'ready',
  connecting: 'connecting',
  waiting_agent: 'waiting_agent',
  active: 'active',
  ended: 'ended',
  error: 'error',
};

/** Разряды пробелами: 3200 → «3 200». В ленте чата принят тот же вид. */
function formatTokens(n: number): string {
  return n.toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
}

/** Секунды от вопроса до ответа — показываем, чтобы ожидание было измеримым. */
function elapsedSec(c: Consultation): number {
  return Math.max(1, Math.round(((c.finishedAt ?? Date.now()) - c.askedAt) / 1000));
}

/**
 * Модалка голосового звонка Роману поверх экрана чата. Владеет всем
 * жизненным циклом звонка через useVoiceCall — снаружи только имя
 * ассистента и колбэк закрытия.
 */
export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({ assistantName, onClose }) => {
  const { t } = useTranslation();
  const { state, error, consultations, documents, micOn, micBlocked, start, hangUp, toggleMic } = useVoiceCall();

  // Закрытие крестиком обязано класть трубку: иначе комната и микрофон
  // остаются активными до таймаута воркера, а бэкенд не узнаёт, что звонок
  // закончился, пока пользователь не откроет карточку сам.
  const handleClose = () => {
    void hangUp();
    onClose();
  };

  // 'ended' тоже: после завершённого звонка модалка иначе показывала кнопку
  // «Положить трубку», которой уже нечего класть, и позвонить повторно было
  // нельзя, не закрыв и не открыв её заново.
  const canCall = state === 'idle' || state === 'error' || state === 'ended';

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

          {/* Список за весь звонок, а не «кто думает прямо сейчас»: ответы
              приходят за 12–15 секунд, и исчезающую плашку не успеть прочитать. */}
          {consultations.length > 0 && (
            <div className="space-y-2 mb-6 mt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('chat.voice_call.consultations_title')}
              </p>
              {consultations.map((item) => (
                <div
                  key={item.jobId}
                  data-testid="voice-call-consultation"
                  data-status={item.status}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 border rounded-lg text-sm',
                    item.status === 'pending' && 'bg-warm-50 border-warm-200 text-warm-800',
                    item.status === 'answered' && 'bg-forest-50 border-forest-200 text-forest-800',
                    item.status === 'failed' && 'bg-red-50 border-red-200 text-red-700',
                  )}
                >
                  {item.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
                  {item.status === 'answered' && <Check className="w-4 h-4 flex-shrink-0" />}
                  {item.status === 'failed' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                  <span>
                    {item.status === 'pending' &&
                      t('chat.voice_call.specialist_thinking', { name: item.specialist })}
                    {item.status === 'answered' && (
                      <>
                        {t('chat.voice_call.specialist_answered', {
                          name: item.specialist,
                          seconds: elapsedSec(item),
                        })}
                        {item.tokens != null && item.tokens > 0 &&
                          ` · ${t('chat.voice_call.tokens_spent', { tokens: formatTokens(item.tokens) })}`}
                      </>
                    )}
                    {item.status === 'failed' &&
                      t('chat.voice_call.specialist_no_answer', { name: item.specialist })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Документы, надиктованные за звонок. Готовый текст уходит в ленту
              чата с Романом — здесь только видно, что он заказан и готов. */}
          {documents.length > 0 && (
            <div className="space-y-2 mb-6 mt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t('chat.voice_call.documents_title')}
              </p>
              {documents.map((doc) => (
                <div
                  key={doc.docId}
                  data-testid="voice-call-document"
                  data-status={doc.status}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 border rounded-lg text-sm',
                    doc.status === 'pending' && 'bg-warm-50 border-warm-200 text-warm-800',
                    doc.status === 'ready' && 'bg-forest-50 border-forest-200 text-forest-800',
                    doc.status === 'failed' && 'bg-red-50 border-red-200 text-red-700',
                  )}
                >
                  {doc.status === 'pending' ? (
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>
                    {doc.status === 'pending' && t('chat.voice_call.document_pending', { title: doc.title })}
                    {doc.status === 'ready' && (
                      <>
                        {t('chat.voice_call.document_ready', { title: doc.title })}
                        {doc.tokens != null && doc.tokens > 0 &&
                          ` · ${t('chat.voice_call.tokens_spent', { tokens: formatTokens(doc.tokens) })}`}
                      </>
                    )}
                    {doc.status === 'failed' && t('chat.voice_call.document_failed', { title: doc.title })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className={clsx(consultations.length === 0 && documents.length === 0 && 'mt-4')}>
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
              <div>
              {micBlocked && (
                <p className="mb-2 text-xs text-amber-700" data-testid="voice-call-mic-blocked">
                  {t('chat.voice_call.mic_blocked')}
                </p>
              )}
              <div className="flex items-center gap-2">
                {/* Микрофон отдельной кнопкой: посреди разговора бывает нужно
                    отключиться, не завершая звонок. Она же — способ вернуть
                    микрофон, если устройство сменилось и дорожка умерла. */}
                <button
                  onClick={() => toggleMic()}
                  data-testid="voice-call-mic"
                  aria-label={micOn ? t('chat.voice_call.mic_off') : t('chat.voice_call.mic_on')}
                  title={micOn ? t('chat.voice_call.mic_off') : t('chat.voice_call.mic_on')}
                  className={clsx(
                    'py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center',
                    micOn ? 'bg-forest-600 text-white hover:bg-forest-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
                  )}
                >
                  {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => hangUp()}
                  data-testid="voice-call-hangup"
                  className="flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 bg-red-600 text-white hover:bg-red-700"
                >
                  <PhoneOff className="w-5 h-5" />
                  <span>{t('chat.voice_call.hang_up')}</span>
                </button>
              </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
