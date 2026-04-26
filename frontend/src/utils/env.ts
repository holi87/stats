export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

export function getApiBaseUrl() {
  return API_BASE_URL?.trim() ?? '';
}
