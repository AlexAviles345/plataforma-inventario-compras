import type { PaginationMeta } from '@shared/types/api-envelope.types';
import type { SystemCode, UserRole } from '@shared/types/auth-session.types';

export interface UserSystemAssignment {
  system: SystemCode;
  role: UserRole;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  assignments: UserSystemAssignment[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUsersListFilters {
  page: number;
  limit: number;
}

export interface PaginatedAdminUsers {
  users: AdminUser[];
  meta: PaginationMeta;
}

export interface CreateAdminUserInput {
  email: string;
  displayName: string;
  password: string;
  assignments: UserSystemAssignment[];
}

export interface UpdateAdminUserInput {
  email: string;
  displayName: string;
  password?: string;
  active: boolean;
  assignments: UserSystemAssignment[];
  expectedVersion: number;
}
