import { useMemo, useState } from 'react';
import type { ApiError } from '../api/ApiProvider';
import { useDeleteGame, useGames, useUpdateGameStatus } from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

function getErrorMessage(error: unknown) {
  const apiError = error as ApiError;
  if (Array.isArray(apiError?.details) && apiError.details.length > 0) {
    return apiError.details.map((detail) => detail.message).join(', ');
  }
  return apiError?.message || 'Wystąpił błąd.';
}

export function OneVsOneGamesAdminPage() {
  const { notify } = useToast();
  const [showInactive, setShowInactive] = useState(true);
  const {
    data: games = [],
    isLoading,
    isError,
    refetch,
  } = useGames({ includeInactive: true });
  const deleteGame = useDeleteGame();
  const updateGameStatus = useUpdateGameStatus();

  const visibleGames = useMemo(() => {
    const filtered = games.filter((game) => game.code !== 'ticket_to_ride');
    return showInactive ? filtered : filtered.filter((game) => game.isActive);
  }, [games, showInactive]);

  const handleToggleActive = async (id: string, name: string, isActive: boolean) => {
    try {
      const updated = await updateGameStatus.mutateAsync({ id, isActive: !isActive });
      notify(
        updated.isActive ? `Gra ${name} została aktywowana.` : `Gra ${name} została ukryta.`,
        'success'
      );
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const shouldDelete = window.confirm(
      `Usunąć grę "${name}"? Zostaną skasowane jej mecze i statystyki 1v1.`
    );
    if (!shouldDelete) {
      return;
    }

    try {
      const result = await deleteGame.mutateAsync(id);
      notify(`Usunięto ${result.name}. Skasowane mecze: ${result.deletedMatches}.`, 'success');
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

  return (
    <section>
      <PageHeader
        title="Gry 1v1"
        description="Lista gier 1v1. Możesz je ukrywać/aktywować oraz usuwać razem ze statystykami."
      />

      <div className="card admin-toolbar-card">
        <div className="players-toolbar">
          <label className="toggle checkbox-control">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Pokaż nieaktywne
          </label>
        </div>
      </div>

      {isError ? (
        <div className="card">
          <ErrorState description="Nie udało się pobrać listy gier 1v1." onRetry={refetch} />
        </div>
      ) : isLoading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie gier 1v1...</p>
        </div>
      ) : visibleGames.length === 0 ? (
        <div className="card">
          <EmptyState title="Brak gier" description="Nie ma gier do wyświetlenia." />
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Kod</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {visibleGames.map((game) => (
                <tr key={game.id}>
                  <td>{game.name}</td>
                  <td>{game.code}</td>
                  <td>
                    <span className={game.isActive ? 'status active' : 'status inactive'}>
                      {game.isActive ? 'Aktywna' : 'Ukryta'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <Button
                        type="button"
                        variant={game.isActive ? 'secondary' : 'primary'}
                        onClick={() => handleToggleActive(game.id, game.name, game.isActive)}
                        disabled={updateGameStatus.isPending || deleteGame.isPending}
                      >
                        {game.isActive ? 'Ukryj' : 'Aktywuj'}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => handleDelete(game.id, game.name)}
                        disabled={updateGameStatus.isPending || deleteGame.isPending}
                      >
                        Usuń
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
