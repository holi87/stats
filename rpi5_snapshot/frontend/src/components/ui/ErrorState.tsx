import { Button } from './Button';

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = 'Wystąpił błąd',
  description = 'Nie udało się pobrać danych.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="error-state">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          Spróbuj ponownie
        </Button>
      ) : null}
    </div>
  );
}
