import { setItemResilient } from './persistentStorage';

interface JWTPayload {
  exp?: number;
  iat?: number;
  [key: string]: any;
}

class TokenManager {
  private readonly ACCESS_TOKEN_KEY = 'jwt_access_token';
  private readonly REFRESH_TOKEN_KEY = 'jwt_refresh_token';

  /**
   * @returns удалось ли сохранить пару. Раньше метод молча глотал
   * QuotaExceededError и возвращал void — вход «проходил», но токенов в
   * хранилище не было, и дальше всё валилось в 401 без внятной причины.
   */
  saveTokens(accessToken: string, refreshToken: string): boolean {
    const ok =
      setItemResilient(this.ACCESS_TOKEN_KEY, accessToken) &&
      setItemResilient(this.REFRESH_TOKEN_KEY, refreshToken);

    if (!ok) {
      // Половина пары хуже, чем ничего: apiClient уходит в цикл
      // запрос → 401 → refresh без refresh-токена → принудительный логаут.
      console.error('Не удалось сохранить токены: в localStorage нет места');
      this.clearTokens();
    }
    return ok;
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  hasTokens(): boolean {
    return !!(this.getAccessToken() && this.getRefreshToken());
  }

  clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  private decodeToken(token: string): JWTPayload | null {
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) return true;

    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  }

  getTokenExpirationTime(token: string): number | null {
    const payload = this.decodeToken(token);
    return payload?.exp || null;
  }

  isAccessTokenExpiringSoon(bufferSeconds: number = 60): boolean {
    const accessToken = this.getAccessToken();
    if (!accessToken) return true;

    const payload = this.decodeToken(accessToken);
    if (!payload || !payload.exp) return true;

    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp - currentTime < bufferSeconds;
  }
}

export const tokenManager = new TokenManager();
