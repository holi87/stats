import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getUiErrorMessage } from './errorMessages';
import { getApiBaseUrl } from '../utils/env';

export type ApiErrorDetail = {
  field?: string;
  message: string;
};

export type ApiError = Error & {
  code?: string;
  status?: number;
  details?: ApiErrorDetail[];
};

type ApiContextValue = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  loading: boolean;
  error: ApiError | null;
  adminToken: string;
  setAdminToken: (token: string) => void;
  clearError: () => void;
};

const ApiContext = createContext<ApiContextValue | null>(null);
const ADMIN_TOKEN_STORAGE_KEY = 'game-stats-admin-token';

function readStoredAdminToken() {
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
  } catch (_) {
    return '';
  }
}

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [loadingCount, setLoadingCount] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [adminToken, setAdminTokenState] = useState(readStoredAdminToken);

  const startLoading = () => setLoadingCount((count) => count + 1);
  const stopLoading = () => setLoadingCount((count) => Math.max(0, count - 1));

  const clearError = () => setError(null);
  const setAdminToken = useCallback((token: string) => {
    setAdminTokenState(token);
    try {
      const trimmed = token.trim();
      if (trimmed) {
        window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      }
    } catch (_) {
      // Storage can be unavailable in private contexts; request headers still use state.
    }
  }, []);

  const request = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
    startLoading();
    try {
      const baseUrl = getApiBaseUrl();
      const storedAdminToken = adminToken.trim();
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(storedAdminToken ? { 'X-Admin-Token': storedAdminToken } : {}),
          ...(options?.headers ?? {}),
        },
        ...options,
      });

      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        let details: ApiErrorDetail[] | undefined;
        let code: string | undefined;

        try {
          const data = await response.json();
          if (data?.error) {
            code = data.error.code;
            if (Array.isArray(data.error.details)) {
              details = data.error.details;
            }
            message = getUiErrorMessage(code, data.error.message || message);
          }
        } catch (_) {
          // ignore parse errors
        }

        const apiError = new Error(message) as ApiError;
        apiError.code = code;
        apiError.status = response.status;
        apiError.details = details;
        throw apiError;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (err) {
      const errorToStore = err instanceof Error ? err : new Error('Unexpected error');
      setError(errorToStore as ApiError);
      throw err;
    } finally {
      stopLoading();
    }
  }, [adminToken]);

  const value = useMemo(
    () => ({ request, loading: loadingCount > 0, error, adminToken, setAdminToken, clearError }),
    [request, loadingCount, error, adminToken, setAdminToken]
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi() {
  const ctx = useContext(ApiContext);
  if (!ctx) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return ctx;
}
