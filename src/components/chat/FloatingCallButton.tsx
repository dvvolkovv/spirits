import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
 * **Кнопку можно перетаскивать** (05.09.2026). Поле ввода в чате растёт вверх
 * по мере набора текста и на длинном сообщении закрывалось кнопкой — она
 * попадала на «отправить». Любая фиксированная точка рано или поздно
 * оказывается под растущим полем, поэтому позицию отдали человеку: она
 * запоминается в localStorage и переживает перезагрузку.
 *
 * z-40 — ниже навигации (z-50) и заметно ниже модалки звонка (z-[60]), чтобы
 * кнопка не всплывала поверх них.
 */
export const FloatingCallButton: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // В чате на десктопе кнопки нет: там звонок живёт в шапке, и плавающая была
  // бы вторым тем же действием на одном экране.
  const inChat = pathname.startsWith('/chat');

  const [pos, setPos] = useState<Point | null>(null);
  // Ширину окна держим в состоянии, а не читаем на рендере: иначе проверка
  // «десктоп ли это» не заметила бы изменение размера окна, и кнопка осталась
  // бы в том виде, в каком её застал первый рендер.
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  const dragRef = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);

  // Позиция считается после монтирования: до него неизвестны размеры окна, а
  // дефолт от них зависит (на низком экране жёсткая константа уехала бы вниз).
  useEffect(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const saved = loadPosition(window.localStorage);
    setPos(clampPosition(saved ?? defaultPosition(viewport, inChat), viewport));
    // inChat в зависимостях нет намеренно: при переходе в чат уже выбранную
    // человеком позицию сбрасывать нельзя, дефолт нужен только на первом входе.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Поворот экрана и изменение окна: сохранённая позиция может оказаться за
  // границей, и без пересчёта кнопка стала бы недоступной навсегда.
  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
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

  // 768 — брейкпоинт md у Tailwind, тот же, по которому раньше стоял md:hidden.
  if (inChat && viewportWidth >= 768) return null;
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
