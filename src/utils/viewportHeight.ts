// iOS не поддерживает interactive-widget=resizes-content: клавиатура не
// сжимает ни layout viewport, ни 100dvh — низ приложения (поле ввода чата)
// уходил под клавиатуру. visualViewport.height — единственный честный размер
// видимой области на iOS. Пишем его в --vvh (index.css применяет к .h-screen)
// только когда клавиатура реально открыта; иначе возвращаем 100dvh, чтобы
// не бороться с нативным поведением там, где оно работает (Android/desktop).
export function initViewportHeightVar(): void {
  const vv = window.visualViewport;
  if (!vv) return;

  const KEYBOARD_THRESHOLD_PX = 80;

  const update = () => {
    const keyboardLikelyOpen = window.innerHeight - vv.height > KEYBOARD_THRESHOLD_PX;
    if (keyboardLikelyOpen) {
      document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      // iOS может сдвинуть страницу при фокусе инпута — возвращаем на место,
      // иначе шапка уезжает за верх экрана.
      window.scrollTo(0, 0);
    } else {
      document.documentElement.style.removeProperty('--vvh');
    }
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
}
