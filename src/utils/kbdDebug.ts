// Диагностика клавиатуры в установленном PWA (Яндекс Браузер, Android): во
// вкладке поле ввода поднимается над клавиатурой, в PWA — уходит под неё.
// Плашка показывает, что страница видит при открытой клавиатуре: сжимаются ли
// окно, visualViewport и 100dvh, есть ли VirtualKeyboard API. От этого
// зависит, чинить ли порог в viewportHeight.ts или обходить окно без resize.
//
// Включается в обычной вкладке адресом ?kbd-debug=1 — флаг ложится в
// localStorage, общий у вкладки и PWA. Выключается ?kbd-debug=0 или кнопкой
// off на самой плашке. Обычные пользователи её не видят.

const STORAGE_KEY = 'kbd_debug';
const PARAM = 'kbd-debug';

export function resolveKbdDebug(search: string, storage: Storage): boolean {
  const param = new URLSearchParams(search).get(PARAM);
  try {
    if (param === '1') storage.setItem(STORAGE_KEY, '1');
    else if (param === '0') storage.removeItem(STORAGE_KEY);
    else return storage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Хранилище недоступно — параметр действует хотя бы на эту загрузку.
  }
  return param === '1';
}

interface VirtualKeyboardLike extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRect;
}

const PROBES = {
  vh: '100vh',
  dvh: '100dvh',
  svh: '100svh',
  lvh: '100lvh',
  kbInset: 'env(keyboard-inset-height, 0px)',
  safeTop: 'env(safe-area-inset-top, 0px)',
  safeBot: 'env(safe-area-inset-bottom, 0px)',
} as const;

type ProbeName = keyof typeof PROBES;

function displayMode(): string {
  for (const mode of ['fullscreen', 'standalone', 'minimal-ui', 'browser']) {
    if (window.matchMedia?.(`(display-mode: ${mode})`).matches) return mode;
  }
  return '?';
}

function shortUa(): string {
  const ua = navigator.userAgent;
  const pick = (re: RegExp) => ua.match(re)?.[1];
  return [
    pick(/YaBrowser\/([\d.]+)/) && `ya ${pick(/YaBrowser\/([\d.]+)/)}`,
    pick(/Chrome\/(\d+)/) && `chr ${pick(/Chrome\/(\d+)/)}`,
    pick(/Android ([\d.]+)/) && `and ${pick(/Android ([\d.]+)/)}`,
  ].filter(Boolean).join(' ') || ua.slice(0, 40);
}

const r = (n: number | undefined) => (n === undefined ? '-' : String(Math.round(n)));

export function initKbdDebug(search = window.location.search): () => void {
  if (!resolveKbdDebug(search, window.localStorage)) return () => {};

  const panel = document.createElement('div');
  panel.setAttribute('data-kbd-debug', '');
  panel.style.cssText = [
    'position:fixed', 'left:4px', 'top:calc(env(safe-area-inset-top, 0px) + 4px)',
    'z-index:2147483647', 'max-width:calc(100vw - 8px)', 'padding:4px 6px',
    'font:10px/1.3 ui-monospace,monospace', 'white-space:pre', 'color:#fff',
    'background:rgba(0,0,0,.78)', 'border-radius:6px', 'pointer-events:none',
  ].join(';');

  const text = document.createElement('div');
  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:6px;margin-top:4px;pointer-events:auto';
  panel.append(text, buttons);

  const probeBox = document.createElement('div');
  probeBox.style.cssText = 'position:fixed;top:0;left:-10px;width:1px;visibility:hidden;pointer-events:none';
  const probes = {} as Record<ProbeName, HTMLDivElement>;
  for (const [name, height] of Object.entries(PROBES) as [ProbeName, string][]) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;top:0;width:1px;height:${height}`;
    probeBox.appendChild(el);
    probes[name] = el;
  }

  const vv = window.visualViewport;
  const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike }).virtualKeyboard;
  const counts = { vv: 0, win: 0, vk: 0 };
  let vkHeight = 0;
  let minWin = window.innerHeight;
  let minVv = vv?.height ?? window.innerHeight;

  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'font:inherit;color:#000;background:#fff;border:0;border-radius:4px;padding:2px 8px';
    b.addEventListener('click', onClick);
    buttons.appendChild(b);
    return b;
  };

  const render = () => {
    minWin = Math.min(minWin, window.innerHeight);
    if (vv) minVv = Math.min(minVv, vv.height);
    const probe = (name: ProbeName) => r(probes[name].getBoundingClientRect().height);
    const root = document.querySelector('.h-screen')?.getBoundingClientRect().height;
    const vvh = document.documentElement.style.getPropertyValue('--vvh') || '-';
    const active = document.activeElement;
    const activeRect = active && active !== document.body ? active.getBoundingClientRect() : null;

    text.textContent = [
      `mode ${displayMode()} | ${shortUa()}`,
      `scr ${screen.width}x${screen.height} dpr ${window.devicePixelRatio}`,
      `win ${window.innerWidth}x${window.innerHeight} out ${window.outerHeight} doc ${document.documentElement.clientHeight}`,
      vv ? `vv ${r(vv.width)}x${r(vv.height)} top ${r(vv.offsetTop)} sc ${vv.scale.toFixed(2)}` : 'vv: none',
      `vh ${probe('vh')} dvh ${probe('dvh')} svh ${probe('svh')} lvh ${probe('lvh')}`,
      `kbInset ${probe('kbInset')} safeTop ${probe('safeTop')} safeBot ${probe('safeBot')}`,
      `--vvh ${vvh} root ${r(root)}`,
      `min win ${minWin} vv ${r(minVv)}`,
      `ev vv ${counts.vv} win ${counts.win} vk ${counts.vk}`,
      activeRect ? `active ${active!.tagName} ${r(activeRect.top)}-${r(activeRect.bottom)}` : 'active -',
      vk ? `vk overlay ${vk.overlaysContent ? 'on' : 'off'} h ${r(vkHeight)}` : 'vk: none',
    ].join('\n');

    if (vv) panel.style.transform = `translateY(${vv.offsetTop}px)`;
  };

  const onVv = () => { counts.vv += 1; render(); };
  const onWin = () => { counts.win += 1; render(); };
  const onVk = () => {
    counts.vk += 1;
    vkHeight = vk?.boundingRect.height ?? 0;
    render();
  };

  vv?.addEventListener('resize', onVv);
  vv?.addEventListener('scroll', onVv);
  window.addEventListener('resize', onWin);
  document.addEventListener('focusin', render);
  document.addEventListener('focusout', render);
  vk?.addEventListener('geometrychange', onVk);
  // Окно без resize не шлёт событий вовсе — опрос показывает и этот случай.
  const timer = window.setInterval(render, 400);

  const stop = () => {
    window.clearInterval(timer);
    vv?.removeEventListener('resize', onVv);
    vv?.removeEventListener('scroll', onVv);
    window.removeEventListener('resize', onWin);
    document.removeEventListener('focusin', render);
    document.removeEventListener('focusout', render);
    vk?.removeEventListener('geometrychange', onVk);
    panel.remove();
    probeBox.remove();
  };

  if (vk) {
    // overlaysContent=true отдаёт геометрию клавиатуры странице, но и
    // перестаёт сжимать её — включать только для замера.
    button('vk', () => {
      vk.overlaysContent = !vk.overlaysContent;
      render();
    });
  }
  const off = button('off', () => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* недоступно */ }
    stop();
  });
  off.setAttribute('data-kbd-debug-off', '');

  document.body.append(probeBox, panel);
  render();
  return stop;
}
