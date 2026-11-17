import type { SystemCode } from '@shared/types/auth-session.types';

export interface LoginRequest {
  email: string;
  password: string;
  system: SystemCode;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
