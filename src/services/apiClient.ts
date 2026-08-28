import { tokenManager } from '../utils/tokenManager';
import { authService } from './authService';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  isRetry?: boolean;
}

/**
 * Куда вести человека при провале авторизации: свой entry point, а не всегда '/'.
 *
 * Вынесено в чистую функцию ради тестируемости — jsdom не позволяет проверить
 * результат присваивания window.location.href (навигация там no-op с логом
 * «Not implemented»), а сам выбор цели — это то место, которое реально можно
 * сломать при рефакторинге. Три вызывающих места в APIClient.request()
 * остаются на прежнем поведении: без Mini App это просто было `'/'`.
 */
export function pickRedirectTarget(pathname: string): string {
  return pathname === '/tma' || pathname.startsWith('/tma/') ? '/tma/' : '/';
}

class APIClient {
  private baseURL: string;
  private isRefreshing: boolean = false;
  private pendingRequests: Array<() => void> = [];
  private reauthHandler: (() => Promise<boolean>) | null = null;

  constructor() {
    this.baseURL = import.meta.env.VITE_BACKEND_URL || '';
  }

  private isProtectedEndpoint(url: string): boolean {
    const publicEndpoints = [
      '/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/',
      '/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/',
    ];

    return !publicEndpoints.some(endpoint => url.includes(endpoint));
  }

  private async waitForTokenRefresh(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingRequests.push(() => resolve());
    });
  }

  private resolvePendingRequests(): void {
    this.pendingRequests.forEach((callback) => callback());
    this.pendingRequests = [];
  }

  /**
   * Запасной способ восстановить сессию, когда refresh-токен не сработал.
   *
   * Нужен Mini App: там initData доступен всегда, поэтому протухшая сессия
   * лечится молча, без экрана входа. Веб этот колбэк не ставит и ведёт себя
   * по-прежнему — выкидывает на онбординг.
   */
  setReauthHandler(handler: (() => Promise<boolean>) | null): void {
    this.reauthHandler = handler;
  }

  private async handleTokenRefresh(): Promise<boolean> {
    // Если уже идет обновление токенов, ждем его завершения
    if (this.isRefreshing) {
      await this.waitForTokenRefresh();
      return tokenManager.hasTokens();
    }

    this.isRefreshing = true;

    try {
      const refreshToken = tokenManager.getRefreshToken();
      
      if (!refreshToken) {
        console.warn('No refresh token available for token refresh');
        if (this.reauthHandler) {
          // Колбэк чужой: бросил — считаем, что не восстановил. Без этого
          // исключение уходило в общий catch, там handler звался ВТОРОЙ раз,
          // и при повторном броске метод выходил мимо resolvePendingRequests() —
          // очередь ожидающих запросов зависала навсегда.
          let restored = false;
          try {
            restored = await this.reauthHandler();
          } catch {
            restored = false;
          }
          if (restored) {
            this.resolvePendingRequests();
            return true;
          }
        }
        this.resolvePendingRequests();
        return false;
      }

      console.log('Attempting to refresh access token using refresh token');
      const result = await authService.refreshTokens();

      if (result && result['access-token'] && result['refresh-token']) {
        console.log('Access token successfully refreshed');
        this.resolvePendingRequests();
        return true;
      } else {
        console.error('Failed to refresh tokens: invalid response from server');
        if (this.reauthHandler) {
          // См. комментарий выше: свой try/catch, чтобы бросивший handler не
          // улетал во внешний catch и не звался там повторно.
          let restored = false;
          try {
            restored = await this.reauthHandler();
          } catch {
            restored = false;
          }
          if (restored) {
            this.resolvePendingRequests();
            return true;
          }
        }
        this.resolvePendingRequests();
        return false;
      }
    } catch (error) {
      console.error('Error during token refresh:', error);
      if (this.reauthHandler) {
        // Сюда попадаем при реальной ошибке refresh (не от reauthHandler —
        // те уже погашены на месте выше). Свой try/catch по той же причине:
        // это последний рубеж перед resolvePendingRequests(), бросить наружу
        // нельзя — очередь останется висеть навсегда.
        let restored = false;
        try {
          restored = await this.reauthHandler();
        } catch {
          restored = false;
        }
        if (restored) {
          this.resolvePendingRequests();
          return true;
        }
      }
      this.resolvePendingRequests();
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  async request<T = any>(
    url: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    const { skipAuth = false, isRetry = false, ...fetchOptions } = options;

    const fullURL = url.startsWith('http') ? url : `${this.baseURL}${url}`;

    const headers: Record<string, string> = {
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (!skipAuth && this.isProtectedEndpoint(fullURL)) {
      const accessToken = tokenManager.getAccessToken();

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    try {
      const response = await fetch(fullURL, {
        ...fetchOptions,
        headers,
      });

      if (response.status === 403 && !skipAuth && this.isProtectedEndpoint(fullURL)) {
        try {
          const errorData = await response.clone().json();
          if (errorData.error === 'No token provided as Bearer') {
            console.error('Authentication error: No token provided, redirecting to login');
            if (typeof window !== 'undefined') {
              localStorage.removeItem('authToken');
              localStorage.removeItem('userData');
              tokenManager.clearTokens();
              // Возвращаемся в СВОЙ entry point. Жёсткий '/' выбрасывал
              // Mini App в веб-SPA прямо внутри Telegram.
              window.location.href = pickRedirectTarget(window.location.pathname);
            }
            throw new Error('Authentication failed: no token provided');
          }
        } catch (e) {
        }
      }

      if (response.status === 401 && !isRetry && !skipAuth && this.isProtectedEndpoint(fullURL)) {
        console.log('Received 401 error, attempting to refresh access token');
        const refreshSuccess = await this.handleTokenRefresh();

        if (refreshSuccess) {
          const newAccessToken = tokenManager.getAccessToken();
          if (newAccessToken) {
            console.log('Retrying request with refreshed access token');
            return this.request(url, {
              ...options,
              isRetry: true
            });
          } else {
            console.error('New access token not available after refresh');
            if (typeof window !== 'undefined') {
              localStorage.removeItem('authToken');
              localStorage.removeItem('userData');
              tokenManager.clearTokens();
              // Возвращаемся в СВОЙ entry point. Жёсткий '/' выбрасывал
              // Mini App в веб-SPA прямо внутри Telegram.
              window.location.href = pickRedirectTarget(window.location.pathname);
            }
            throw new Error('Authentication failed: new token not available');
          }
        } else {
          console.error('Token refresh failed, redirecting to login');
          if (typeof window !== 'undefined') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            tokenManager.clearTokens();
            // Возвращаемся в СВОЙ entry point. Жёсткий '/' выбрасывал
            // Mini App в веб-SPA прямо внутри Telegram.
            window.location.href = pickRedirectTarget(window.location.pathname);
          }
          throw new Error('Authentication failed: token refresh unsuccessful');
        }
      }

      return response;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  async get<T = any>(url: string, options?: RequestOptions): Promise<Response> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<Response> {
    const isFormData = data instanceof FormData;

    const headers: HeadersInit = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    };

    return this.request<T>(url, {
      ...options,
      method: 'POST',
      headers,
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
    });
  }

  async put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<Response> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T = any>(url: string, data?: any, options?: RequestOptions): Promise<Response> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(url: string, options?: RequestOptions): Promise<Response> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  async fetchStream(
    url: string,
    options: RequestOptions = {}
  ): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
    const response = await this.request(url, options);

    if (!response.ok || !response.body) {
      return null;
    }

    return response.body.getReader();
  }

  /**
   * Принудительно обновляет access token перед важными запросами
   * @returns Promise<boolean> - true если токен успешно обновлен, false в противном случае
   */
  async refreshTokenIfNeeded(): Promise<boolean> {
    return this.handleTokenRefresh();
  }
}

export const apiClient = new APIClient();
