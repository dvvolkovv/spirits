/**
 * Гудки дозвона, как в телефоне.
 *
 * Пока идёт соединение, пользователю нечего слушать, и тишина неотличима от
 * поломки — именно на этом обжигались: интерфейс писал «Ждём Романа», а было
 * непонятно, работает вообще что-нибудь или нет. Гудок отвечает на этот вопрос
 * без единого слова.
 *
 * Тон синтезируем, а не грузим файлом: это полторы сотни байт кода против
 * лишнего ассета в бандле, и не нужно думать про кеш и форматы.
 *
 * Ритм российский: 425 Гц, секунда звучания, четыре секунды паузы (ГОСТ на
 * «контроль посылки вызова»). Он узнаётся на слух и сразу читается как «идёт
 * дозвон», а не как «что-то пищит».
 */
const TONE_HZ = 425;
const BEEP_SEC = 1;
const PAUSE_SEC = 4;

export interface Ringback {
  stop: () => void;
}

/**
 * Запустить гудки. Возвращает объект с stop(); повторный stop() безопасен.
 *
 * Требует пользовательского жеста — вызывается из обработчика клика по
 * «Позвонить», поэтому autoplay-политика браузера не мешает.
 */
export function startRingback(): Ringback {
  let ctx: AudioContext | null = null;
  try {
    // globalThis, а не window: модуль остаётся проверяемым в node-окружении
    // тестов, где window не существует, и ничего не теряет в браузере.
    const g = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = g.AudioContext || g.webkitAudioContext;
    if (!Ctor) return { stop: () => {} };
    ctx = new Ctor();
  } catch {
    // Web Audio недоступен — звонок это не ломает, просто будет тихо.
    return { stop: () => {} };
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = TONE_HZ;
  // Держим громкость на нуле и открываем её пачками: так один осциллятор
  // отыгрывает всю серию гудков без пересоздания узлов.
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();

  const period = BEEP_SEC + PAUSE_SEC;
  // Расписываем несколько циклов вперёд по часам аудиоконтекста: setInterval
  // в фоновой вкладке душится браузером, а планировщик Web Audio — нет.
  for (let i = 0; i < 24; i++) {
    const at = ctx.currentTime + i * period;
    gain.gain.setValueAtTime(0.06, at);
    gain.gain.setValueAtTime(0, at + BEEP_SEC);
  }

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { osc.stop(); } catch { /* уже остановлен */ }
      try { void ctx?.close(); } catch { /* уже закрыт */ }
    },
  };
}
