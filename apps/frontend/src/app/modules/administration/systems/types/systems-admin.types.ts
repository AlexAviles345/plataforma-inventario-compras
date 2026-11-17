import type { SystemCode } from '@shared/types/auth-session.types';

export interface AuthSystemConfiguration {
  code: SystemCode;
  accessTokenTtlSeconds: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSystemTtlInput {
  accessTokenTtlSeconds: number;
  expectedVersion: number;
}
