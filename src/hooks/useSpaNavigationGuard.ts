import { useEffect } from 'react';

export function useSpaNavigationGuard(when: boolean, message: string): void {
  useEffect(() => {
    if (!when) return;

    const browserHistory = window.history;
    const originalPushState = browserHistory.pushState;
    const originalReplaceState = browserHistory.replaceState;
    let current = { url: window.location.href, state: browserHistory.state };

    const rememberCurrent = () => {
      current = { url: window.location.href, state: browserHistory.state };
    };
    const wrap = (original: History['pushState']) => function guardedHistoryMethod(
      this: History,
      data: unknown,
      title: string,
      url?: string | URL | null,
    ) {
      if (!window.confirm(message)) return;
      original.call(this, data, title, url);
      rememberCurrent();
    };

    const guardedPushState = wrap(originalPushState);
    const guardedReplaceState = wrap(originalReplaceState);
    browserHistory.pushState = guardedPushState;
    browserHistory.replaceState = guardedReplaceState;

    const handlePopState = (event: PopStateEvent) => {
      if (window.confirm(message)) {
        rememberCurrent();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      originalReplaceState.call(browserHistory, current.state, '', current.url);
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
  }, [when, message]);
}
