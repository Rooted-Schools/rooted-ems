// API response types and shared request/response interfaces

import { StaffRole } from "./enums";

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface AuthSession {
  user_id: string;
  email: string | null;
  phone: string | null;
  is_staff: boolean;
  campus_roles: CampusRoleMap;
}

// Map of campus_id -> array of roles for that campus
export type CampusRoleMap = Record<string, StaffRole[]>;
