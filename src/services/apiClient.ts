import { tokenManager } from '../utils/tokenManager';
import { authService } from './authService';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  isRetry?: boolean;
}

class APIClient {
  private baseURL: string;
  private isRefreshing: boolean = false;
  private pendingRequests: Array<() => void> = [];

  constructor() {
    this.baseURL = import.meta.env.VITE_BACKEND_URL || 'https://travel-n8n.up.railway.app';
  }

  private isProtectedEndpoint(url: string): boolean {
    const publicEndpoints = [
      '/webhook/sms/',
      '/webhook/check-code/',
      '/webhook/yookassa/',
      '/webhook/get-user-tokens/',
      '/webhook/0cdacf32-7bfd-4888-b24f-3a6af3b5f99e/',
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

  private async handleTokenRefresh(): Promise<boolean> {
    if (this.isRefreshing) {
      await this.waitForTokenRefresh();
      return tokenManager.hasTokens();
    }

    this.isRefreshing = true;

    try {
      const result = await authService.refreshTokens();

      if (result) {
        this.resolvePendingRequests();
        return true;
      } else {
        this.resolvePendingRequests();
        return false;
      }
    } catch (error) {
      console.error('Error during token refresh:', error);
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

    const headers: HeadersInit = {
      ...fetchOptions.headers,
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

      if (response.status === 401 && !isRetry && !skipAuth && this.isProtectedEndpoint(fullURL)) {
        const refreshSuccess = await this.handleTokenRefresh();

        if (refreshSuccess) {
          return this.request(url, { ...options, isRetry: true });
        } else {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            window.location.href = '/';
          }
          throw new Error('Authentication failed');
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
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    return this.request<T>(url, {
      ...options,
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
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
}

export const apiClient = new APIClient();
