import { useEffect } from 'react';

export function useSpaNavigationGuard(
  when: boolean,
  message: string,
  onAllow: () => void = () => {},
): void {
  useEffect(() => {
    if (!when) return;

    const browserHistory = window.history;
    const originalPushState = browserHistory.pushState;
    const originalReplaceState = browserHistory.replaceState;
    let currentIndex = browserHistory.state?.idx as number | null | undefined;
    let bypassNextPopState = false;

    const rememberCurrent = () => {
      currentIndex = browserHistory.state?.idx as number | null | undefined;
    };
    const wrap = (original: History['pushState']) => function guardedHistoryMethod(
      this: History,
      data: unknown,
      title: string,
      url?: string | URL | null,
    ) {
      if (!window.confirm(message)) return;
      onAllow();
      original.call(this, data, title, url);
      rememberCurrent();
    };

    const guardedPushState = wrap(originalPushState);
    const guardedReplaceState = wrap(originalReplaceState);
    browserHistory.pushState = guardedPushState;
    browserHistory.replaceState = guardedReplaceState;

    const handlePopState = (event: PopStateEvent) => {
      if (bypassNextPopState) {
        bypassNextPopState = false;
        rememberCurrent();
        return;
      }
      if (window.confirm(message)) {
        onAllow();
        rememberCurrent();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const destinationIndex = event.state?.idx as number | null | undefined;
      if (typeof currentIndex === 'number' && typeof destinationIndex === 'number') {
        const delta = currentIndex - destinationIndex;
        if (delta !== 0) {
          bypassNextPopState = true;
          setTimeout(() => browserHistory.go(delta), 0);
        }
      }
    };
    window.addEventListener('popstate', handlePopState, true);

    return () => {
      window.removeEventListener('popstate', handlePopState, true);
      if (browserHistory.pushState === guardedPushState) {
        browserHistory.pushState = originalPushState;
      }
      if (browserHistory.replaceState === guardedReplaceState) {
        browserHistory.replaceState = originalReplaceState;
      }
    };
  }, [when, message, onAllow]);
}
