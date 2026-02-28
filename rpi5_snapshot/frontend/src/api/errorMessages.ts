const DEFAULT_MESSAGE = 'Wystąpił błąd. Spróbuj ponownie.';

export function getUiErrorMessage(code?: string, fallback?: string) {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 'Nieprawidłowe dane. Sprawdź pola formularza.';
    case 'NOT_FOUND':
      return 'Nie znaleziono zasobu.';
    case 'CONFLICT':
      return 'Konflikt danych. Odśwież widok i spróbuj ponownie.';
    case 'INTERNAL_ERROR':
      return 'Wewnętrzny błąd serwera. Spróbuj ponownie później.';
    default:
      return fallback || DEFAULT_MESSAGE;
  }
}
