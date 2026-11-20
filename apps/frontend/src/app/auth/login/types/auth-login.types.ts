import type {
  IssuedTokenEntry,
  SystemCode,
} from '@shared/types/auth-session.types';

export interface LoginRequest {
  email: string;
  password: string;
  system?: SystemCode;
}

export interface LoginResponse extends IssuedTokenEntry {
  tokens?: IssuedTokenEntry[];
}
