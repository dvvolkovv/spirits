import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const VoiceCallModal = React.lazy(() =>
  import('./VoiceCallModal').then((m) => ({ default: m.VoiceCallModal })),
);

/**
 * Плавающая кнопка «Позвонить Роману» — видна на всех экранах авторизованного
 * приложения.
 *
 * До этого кнопка звонка жила только в шапке чата и только при выбранном
 * Романе (`selectedAssistant?.id !== 12 -> null` в ChatInterface), то есть
 * найти её можно было, лишь заранее зная, что она там. Голосом по-прежнему
 * разговаривает только Роман, но начинать разговор логично из любого места.
 *
 * Звонок открыт всем вошедшим: админскую проверку бэкенд снял 28.08.2026
 * (voice-call), по встречам — 03.09. Поэтому здесь никакого гейта нет.
 *
 * Позиционирование: на мобиле нижняя навигация занимает низ экрана
 * (`fixed bottom-0 ... py-3`, ~64px), поэтому кнопка поднята на bottom-24;
 * на десктопе навигация слева и низ свободен. z-40 — ниже навигации (z-50) и
 * заметно ниже модалки звонка (z-[60]), чтобы кнопка не всплывала поверх них.
 */
export const FloatingCallButton: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // В чате кнопка живёт в шапке — там она не спорит с полем ввода. Плавающая
  // на мобиле встала бы ровно поверх строки ввода и кнопки отправки: нижняя
  // навигация занимает ~64px, поле ввода — следующие ~60, а кнопка поднята
  // всего на 96. Поэтому на /chat её не показываем, а в шапке чата снято
  // условие «только у Романа», из-за которого её там раньше не было видно.
  if (pathname.startsWith('/chat')) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="floating-call-button"
        title={t('chat.voice_call.button_title')}
        aria-label={t('chat.voice_call.button_title')}
        className="fixed right-4 bottom-24 md:bottom-6 z-40 flex items-center justify-center
                   w-14 h-14 rounded-full bg-forest-600 text-white shadow-lg
                   hover:bg-forest-700 active:scale-95 transition"
      >
        <Phone className="w-6 h-6" />
      </button>

      {open && (
        <React.Suspense fallback={null}>
          <VoiceCallModal
            assistantName={t('chat.voice_call.assistant_name')}
            onClose={() => setOpen(false)}
          />
        </React.Suspense>
      )}
    </>
  );
};
