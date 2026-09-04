import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from 'lucide-react';
import { useVoiceCall } from '../../components/chat/useVoiceCall';

/**
 * Звонок Роману из мини-аппа.
 *
 * Хук взят из веба целиком: он не тянет ничего веб-специфичного — только
 * React, i18next, livekit-client и общий apiClient. Писать второй значило бы
 * держать две реализации одного разговора, и они разошлись бы на первой же
 * правке.
 *
 * Файл грузится лениво (см. AssistantsScreen): livekit-client весит около
 * полутора мегабайт, а мини-апп открывают с телефона. Тянуть его в стартовый
 * бандл ради кнопки, которую нажимают не каждый раз, — плохая сделка.
 */
export function CallSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, error, micOn, micBlocked, start, hangUp, toggleMic } = useVoiceCall();

  const idle = state === 'idle' || state === 'ended' || state === 'error';
  const connecting = state === 'connecting' || state === 'waiting_agent';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-6">
      <p className="text-lg font-semibold">{t('tma.call.title')}</p>
      <p className="mt-1 text-sm text-gray-500">
        {state === 'active' ? t('tma.call.active')
          : connecting ? t('tma.call.connecting')
          : t('tma.call.hint')}
      </p>

      {micBlocked && <p className="mt-3 text-sm text-amber-700">{t('tma.call.micBlocked')}</p>}
      {state === 'error' && <p className="mt-3 text-sm text-red-600">{error || t('tma.call.failed')}</p>}

      <div className="mt-8 flex items-center gap-4">
        {idle ? (
          <button
            onClick={start}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-white"
            aria-label={t('tma.call.start')}
          >
            <Phone className="h-6 w-6" />
          </button>
        ) : (
          <>
            <button
              onClick={() => toggleMic()}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-300"
              aria-label={micOn ? t('tma.call.micOff') : t('tma.call.micOn')}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              onClick={hangUp}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white"
              aria-label={t('tma.call.hangUp')}
            >
              {connecting ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-6 w-6" />}
            </button>
          </>
        )}
      </div>

      {/* Закрыть можно только когда не разговариваешь: иначе экран уходит, а
          оплачиваемая сессия остаётся жить незаметно для человека. */}
      {idle && (
        <button onClick={onClose} className="mt-10 text-sm text-gray-500 underline">
          {t('tma.call.close')}
        </button>
      )}
    </div>
  );
}
