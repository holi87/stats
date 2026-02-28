import { useEffect, useRef } from 'react';
import { useApi } from '../api/ApiProvider';
import { LoadingBar } from './LoadingBar';
import { useToast } from './ui/ToastProvider';

export function GlobalStatus() {
  const { loading, error, clearError } = useApi();
  const { notify } = useToast();
  const lastErrorRef = useRef<{ message: string; at: number } | null>(null);

  useEffect(() => {
    if (error) {
      const now = Date.now();
      const lastError = lastErrorRef.current;
      const shouldNotify =
        !lastError || lastError.message !== error.message || now - lastError.at > 1500;

      if (shouldNotify) {
        notify(error.message, 'error');
        lastErrorRef.current = { message: error.message, at: now };
      }
      clearError();
    }
  }, [error, notify, clearError]);

  return (
    <>
      <LoadingBar visible={loading} />
    </>
  );
}
