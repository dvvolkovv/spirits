import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  clampPosition,
  defaultPosition,
  isTap,
  loadPosition,
  savePosition,
  type Point,
} from './floatingCallPosition';

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
 * **Живёт только в списке ассистентов** (решение владельца 05.09.2026): там
 * человек выбирает собеседника, и предложить позвонить уместно именно там. В
 * переписке кнопки нет — звонок остаётся в шапке чата, а плавающая налезала
 * на поле ввода.
 *
 * **Кнопку можно перетаскивать.** Позиция запоминается в localStorage и
 * переживает перезагрузку. Механика осталась от того времени, когда кнопка
 * висела в чате и закрывала «отправить»; в списке ассистентов перекрывать
 * нечего, но возможность подвинуть кнопку никому не мешает.
 *
 * z-40 — ниже навигации (z-50) и заметно ниже модалки звонка (z-[60]), чтобы
 * кнопка не всплывала поверх них.
 */
export const FloatingCallButton: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const [pos, setPos] = useState<Point | null>(null);
  const dragRef = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);

  // Позиция считается после монтирования: до него неизвестны размеры окна, а
  // дефолт от них зависит (на низком экране жёсткая константа уехала бы вниз).
  useEffect(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const saved = loadPosition(window.localStorage);
    // false: кнопка живёт в списке ассистентов, где поля ввода нет и поднимать
    // её не от чего.
    setPos(clampPosition(saved ?? defaultPosition(viewport, false), viewport));
  }, []);

  // Поворот экрана и изменение окна: сохранённая позиция может оказаться за
  // границей, и без пересчёта кнопка стала бы недоступной навсегда.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? clampPosition(p, { width: window.innerWidth, height: window.innerHeight }) : p));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return;
    dragRef.current = { start: { x: e.clientX, y: e.clientY }, origin: pos, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = {
      x: drag.origin.x + (e.clientX - drag.start.x),
      y: drag.origin.y + (e.clientY - drag.start.y),
    };
    if (!isTap(drag.start, { x: e.clientX, y: e.clientY })) drag.moved = true;
    setPos(clampPosition(next, { width: window.innerWidth, height: window.innerHeight }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Перетащили — запоминаем и НЕ звоним: иначе каждый сдвиг кнопки
    // открывал бы модалку звонка.
    if (drag.moved) {
      setPos((p) => { if (p) savePosition(window.localStorage, p); return p; });
      return;
    }
    setOpen(true);
  }, []);

  if (!pos) return null;

  return (
    <>
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="floating-call-button"
        title={t('chat.voice_call.button_title')}
        aria-label={t('chat.voice_call.button_title')}
        style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
        className="fixed z-40 flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-forest-600 text-white shadow-lg transition-colors hover:bg-forest-700 active:cursor-grabbing"
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
