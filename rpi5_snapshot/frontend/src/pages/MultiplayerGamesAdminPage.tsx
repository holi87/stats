import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../api/ApiProvider';
import {
  useDeleteMultiplayerGame,
  useMultiplayerGames,
  useUpdateMultiplayerGame,
  type MultiplayerGame,
} from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Input } from '../components/ui/Input';
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

type EditDraft = {
  displayName: string;
  minPlayers: string;
  maxPlayers: string;
  isActive: boolean;
  showInQuickMenu: boolean;
};

function createEmptyDraft(): EditDraft {
  return {
    displayName: '',
    minPlayers: '',
    maxPlayers: '',
    isActive: true,
    showInQuickMenu: true,
  };
}

export function MultiplayerGamesAdminPage() {
  const { notify } = useToast();
  const [showInactive, setShowInactive] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>(createEmptyDraft);

  const {
    data: games = [],
    isLoading,
    isError,
    refetch,
  } = useMultiplayerGames({ includeInactive: true });

  const updateGame = useUpdateMultiplayerGame();
  const deleteGame = useDeleteMultiplayerGame();

  const rows = useMemo(() => {
    return games
      .filter((game) => (showInactive ? true : game.isActive))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pl'));
  }, [games, showInactive]);

  const beginEdit = (game: MultiplayerGame) => {
    setEditingCode(game.code);
    setDraft({
      displayName: game.displayName,
      minPlayers: String(game.minPlayers),
      maxPlayers: String(game.maxPlayers),
      isActive: game.isActive,
      showInQuickMenu: game.showInQuickMenu,
    });
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setDraft(createEmptyDraft());
  };

  const saveEdit = async (game: MultiplayerGame) => {
    const displayName = draft.displayName.trim();
    const minPlayers = Number(draft.minPlayers);
    const maxPlayers = Number(draft.maxPlayers);

    if (!displayName) {
      notify('Nazwa gry nie może być pusta.', 'error');
      return;
    }
    if (!Number.isInteger(minPlayers) || minPlayers < 1) {
      notify('Minimalna liczba graczy musi być liczbą całkowitą >= 1.', 'error');
      return;
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1) {
      notify('Maksymalna liczba graczy musi być liczbą całkowitą >= 1.', 'error');
      return;
    }
    if (minPlayers > maxPlayers) {
      notify('Minimalna liczba graczy nie może być większa od maksymalnej.', 'error');
      return;
    }

    const payload: {
      code: string;
      displayName?: string;
      minPlayers?: number;
      maxPlayers?: number;
      isActive?: boolean;
      showInQuickMenu?: boolean;
    } = { code: game.code };

    let hasChanges = false;
    if (displayName !== game.displayName) {
      payload.displayName = displayName;
      hasChanges = true;
    }
    if (minPlayers !== game.minPlayers) {
      payload.minPlayers = minPlayers;
      hasChanges = true;
    }
    if (maxPlayers !== game.maxPlayers) {
      payload.maxPlayers = maxPlayers;
      hasChanges = true;
    }
    if (draft.isActive !== game.isActive) {
      payload.isActive = draft.isActive;
      hasChanges = true;
    }
    if (draft.showInQuickMenu !== game.showInQuickMenu) {
      payload.showInQuickMenu = draft.showInQuickMenu;
      hasChanges = true;
    }

    if (!hasChanges) {
      notify('Brak zmian do zapisania.', 'info');
      cancelEdit();
      return;
    }

    try {
      await updateGame.mutateAsync(payload);
      notify(`Zapisano zmiany dla gry ${displayName}.`, 'success');
      cancelEdit();
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

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

  const isBusy = updateGame.isPending || deleteGame.isPending;

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
                <th>Aktywna</th>
                <th>Szybkie menu</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((game) => {
                const isEditing = editingCode === game.code;
                return (
                  <tr key={game.id}>
                    <td>
                      {isEditing ? (
                        <Input
                          className="table-input"
                          value={draft.displayName}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, displayName: event.target.value }))
                          }
                          maxLength={80}
                        />
                      ) : (
                        game.displayName
                      )}
                    </td>
                    <td>{game.code}</td>
                    <td>{game.scoringType}</td>
                    <td>
                      {isEditing ? (
                        <div className="table-range-edit">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            className="table-input table-input-small"
                            value={draft.minPlayers}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, minPlayers: event.target.value }))
                            }
                          />
                          <span>-</span>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            className="table-input table-input-small"
                            value={draft.maxPlayers}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, maxPlayers: event.target.value }))
                            }
                          />
                        </div>
                      ) : (
                        `${game.minPlayers}-${game.maxPlayers}`
                      )}
                    </td>
                    <td className="table-checkbox-cell">
                      <span className="table-checkbox-wrap">
                        <input
                          type="checkbox"
                          className="table-checkbox"
                          checked={isEditing ? draft.isActive : game.isActive}
                          disabled={!isEditing}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, isActive: event.target.checked }))
                          }
                          aria-label="Gra aktywna"
                        />
                      </span>
                    </td>
                    <td className="table-checkbox-cell">
                      <span className="table-checkbox-wrap">
                        <input
                          type="checkbox"
                          className="table-checkbox"
                          checked={isEditing ? draft.showInQuickMenu : game.showInQuickMenu}
                          disabled={!isEditing}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, showInQuickMenu: event.target.checked }))
                          }
                          aria-label="Gra w szybkim menu"
                        />
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        {isEditing ? (
                          <>
                            <Button type="button" variant="primary" onClick={() => saveEdit(game)} disabled={isBusy}>
                              Zapisz
                            </Button>
                            <Button type="button" variant="secondary" onClick={cancelEdit} disabled={isBusy}>
                              Anuluj
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button type="button" variant="secondary" onClick={() => beginEdit(game)} disabled={isBusy}>
                              Edytuj
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              onClick={() => removeGame(game)}
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
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
