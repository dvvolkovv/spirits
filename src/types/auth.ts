export interface JWTTokens {
  'access-token': string;
  'refresh-token': string;
}

export interface AuthResponse {
  success: boolean;
  tokens?: JWTTokens;
  error?: string;
}

export interface RefreshResponse {
  'access-token': string;
  'refresh-token': string;
}

export interface APIError {
  error: string;
  code?: number;
}

export interface SMSResponse {
  success: boolean;
  message?: string;
}

export interface Identity {
  id: string;
  provider: 'phone' | 'email' | 'google' | 'yandex' | 'talerid';
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ReferralStats {
  leader: {
    name: string;
    slug: string;
    level: number;
    commission_pct: number;
  };
  referral_link: string;
  referee_bonus_tokens?: number;
  total_referees: number;
  total_paid_rub: number;
  total_commission_rub: number;
  paid_out_rub: number;
  pending_rub: number;
  commission_breakdown: {
    direct_pct: number;
    direct_commission_rub: number;
    upstream_pct: number;
    upstream_commission_rub: number;
  };
  /**
   * Условия вывода — курс и пороги. Приходят с бэкенда, потому что применяет их
   * он; фронт держит только запасные значения (см. referralPayout.ts).
   * Необязательное: ответ может приехать из кеша версии, где поля ещё не было.
   */
  payout?: {
    rate_tokens_per_rub: number;
    min_rub: number;
    withdraw_min_rub: number;
    withdraw_methods?: string[];
  };
  referees: Array<{
    phone: string;
    registered_at: string;
    total_spent: number;
    commission: number;
  }>;
  commissions: Array<{
    id: string;
    date: string;
    referee_phone: string;
    payment_amount: number;
    commission_pct: number;
    commission_rub: number;
    level: number;
    paid_out: boolean;
  }>;
}

/** Провайдеры внешнего входа. Значение уходит на бэк как есть. */
export type OAuthProviderId = 'google' | 'yandex' | 'talerid';
