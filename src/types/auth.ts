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
