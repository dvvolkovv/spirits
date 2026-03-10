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

export interface ReferralStats {
  leader: {
    name: string;
    slug: string;
    level: number;
    commission_pct: number;
  };
  referral_link: string;
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
