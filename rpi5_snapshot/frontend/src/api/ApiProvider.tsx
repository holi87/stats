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
  clearError: () => void;
};

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [loadingCount, setLoadingCount] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);

  const startLoading = () => setLoadingCount((count) => count + 1);
  const stopLoading = () => setLoadingCount((count) => Math.max(0, count - 1));

  const clearError = () => setError(null);

  const request = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
    startLoading();
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
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
  }, []);

  const value = useMemo(
    () => ({ request, loading: loadingCount > 0, error, clearError }),
    [request, loadingCount, error]
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
