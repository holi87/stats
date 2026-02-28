import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../api/ApiProvider';
import {
  useDeleteMultiplayerGame,
  useMultiplayerGames,
  type MultiplayerGame,
} from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

function getErrorMessage(error: unknown) {
  const apiError = error as ApiError;
  if (
    apiError?.status === 409 &&
    /dedicated calculator/i.test(String(apiError?.message || ''))
  ) {
    return 'Nie można usunąć gry z dedykowanym kalkulatorem.';
  }
  if (Array.isArray(apiError?.details) && apiError.details.length > 0) {
    return apiError.details.map((detail) => detail.message).join(', ');
  }
  return apiError?.message || 'Wystąpił błąd.';
}

export function MultiplayerGamesAdminPage() {
  const { notify } = useToast();
  const [showInactive, setShowInactive] = useState(true);

  const {
    data: games = [],
    isLoading,
    isError,
    refetch,
  } = useMultiplayerGames({ includeInactive: true });

  const deleteGame = useDeleteMultiplayerGame();

  const rows = useMemo(() => {
    return games
      .filter((game) => (showInactive ? true : game.isActive))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pl'));
  }, [games, showInactive]);

  const removeGame = async (game: MultiplayerGame) => {
    if (game.scoringType === 'TTR_CALCULATOR' || game.scoringType === 'TM_CALCULATOR') {
      notify('Nie można usunąć gry z dedykowanym kalkulatorem.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Usunąć grę "${game.displayName}" i wszystkie jej mecze/statystyki?`
    );
    if (!confirmed) {
      return;
    }

    try {
      const result = await deleteGame.mutateAsync(game.code);
      notify(`Usunięto grę ${game.displayName} oraz ${result.deletedMatches} meczów.`, 'success');
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

  const isBusy = deleteGame.isPending;

  return (
    <section>
      <PageHeader
        title="Gry"
        description="Zarządzanie aktywnymi grami multiplayer oraz widocznością w szybkim menu."
      />

      <div className="card admin-toolbar-card">
        <div className="players-toolbar">
          <div className="multiplayer-game-actions">
            <Link className="button primary" to="/admin/multiplayer-games/new">
              Dodaj nową grę
            </Link>
          </div>
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
          <ErrorState description="Nie udało się pobrać listy gier." onRetry={refetch} />
        </div>
      ) : isLoading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie gier...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState title="Brak gier" description="Brak gier do wyświetlenia." />
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Kod</th>
                <th>Typ</th>
                <th>Gracze</th>
                <th>Dodatki</th>
                <th>Aktywna</th>
                <th>Szybkie menu</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((game) => (
                <tr key={game.id}>
                  <td>{game.displayName}</td>
                  <td>{game.code}</td>
                  <td>{game.scoringType}</td>
                  <td>{`${game.minPlayers}-${game.maxPlayers}`}</td>
                  <td>{game.optionsExclusive ? 'wykluczające się' : 'łączone'}</td>
                  <td className="table-checkbox-cell">
                    <span className={`status ${game.isActive ? 'active' : 'inactive'}`}>
                      {game.isActive ? 'tak' : 'nie'}
                    </span>
                  </td>
                  <td className="table-checkbox-cell">
                    <span className={`status ${game.showInQuickMenu ? 'active' : 'inactive'}`}>
                      {game.showInQuickMenu ? 'tak' : 'nie'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <Link
                        className="button secondary"
                        to={`/admin/multiplayer-games/${game.code}/edit`}
                      >
                        Edytuj
                      </Link>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => void removeGame(game)}
                        disabled={
                          isBusy ||
                          game.scoringType === 'TTR_CALCULATOR' ||
                          game.scoringType === 'TM_CALCULATOR'
                        }
                        title={
                          game.scoringType === 'TTR_CALCULATOR' ||
                          game.scoringType === 'TM_CALCULATOR'
                            ? 'Gry z dedykowanym kalkulatorem nie mogą zostać usunięte'
                            : undefined
                        }
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
