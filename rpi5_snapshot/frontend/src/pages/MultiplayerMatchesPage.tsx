import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import type { ApiError } from '../api/ApiProvider';
import {
  useDeleteMultiplayerMatch,
  useMultiplayerGame,
  useMultiplayerGameOptions,
  useMultiplayerMatches,
  usePlayers,
} from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { MatchNoteHint } from '../components/MatchNoteHint';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

export function MultiplayerMatchesPage() {
  const { gameCode } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { notify } = useToast();

  const filters = {
    playerId: searchParams.get('playerId') || undefined,
    optionId: searchParams.get('optionId') || undefined,
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
  };

  const offsetRaw = searchParams.get('offset');
  const offset = offsetRaw ? Math.max(0, Number(offsetRaw) || 0) : 0;
  const limit = 50;

  const {
    data: game,
    isLoading: gameLoading,
    isError: gameError,
    error: gameErrorPayload,
    refetch: refetchGame,
  } = useMultiplayerGame(gameCode);

  const {
    data: players = [],
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers,
  } = usePlayers({ active: true });
  const {
    data: gameOptions = [],
    isLoading: optionsLoading,
    isError: optionsError,
    refetch: refetchOptions,
  } = useMultiplayerGameOptions(gameCode);

  const {
    data: matchesData,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch: refetchMatches,
  } = useMultiplayerMatches(
    {
      gameId: game?.id,
      ...filters,
      limit,
      offset,
    },
    { enabled: Boolean(game?.id) }
  );

  const deleteMatch = useDeleteMultiplayerMatch();

  if (!gameCode) {
    return <Navigate to="/games/overview" replace />;
  }

  if (gameLoading) {
    return (
      <div className="card center-content">
        <Spinner />
        <p>Ładowanie gry...</p>
      </div>
    );
  }

  if (gameError) {
    const error = gameErrorPayload as ApiError | null;
    if (error?.code === 'NOT_FOUND') {
      return (
        <EmptyState
          title="Nie znaleziono gry"
          description="Wybrana gra wieloosobowa nie istnieje lub jest nieaktywna."
          action={
            <Link className="button secondary" to="/games/overview">
              Wróć do przeglądu
            </Link>
          }
        />
      );
    }
    return <ErrorState onRetry={refetchGame} />;
  }

  if (!game) {
    return (
      <EmptyState
        title="Nie znaleziono gry"
        description="Wybrana gra wieloosobowa nie istnieje lub jest nieaktywna."
        action={
          <Link className="button secondary" to="/games/overview">
            Wróć do przeglądu
          </Link>
        }
      />
    );
  }

  const matches = matchesData?.items ?? [];
  const total = matchesData?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  const searchSuffix = location.search || (searchParams.toString() ? `?${searchParams.toString()}` : '');

  const updateSearchParams = (next: Partial<typeof filters> & { offset?: number }) => {
    const params = new URLSearchParams(searchParams);

    const setParam = (key: string, value?: string) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };

    if (next.playerId !== undefined) {
      setParam('playerId', next.playerId);
    }
    if (next.optionId !== undefined) {
      setParam('optionId', next.optionId);
    }
    if (next.dateFrom !== undefined) {
      setParam('dateFrom', next.dateFrom);
    }
    if (next.dateTo !== undefined) {
      setParam('dateTo', next.dateTo);
    }
    if (next.offset !== undefined) {
      if (next.offset <= 0) {
        params.delete('offset');
      } else {
        params.set('offset', String(next.offset));
      }
    }

    setSearchParams(params, { replace: true });
  };

  const handleClear = () => {
    setSearchParams({}, { replace: true });
  };

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) {
      return;
    }
    try {
      await deleteMatch.mutateAsync(pendingDeleteId);
      notify('Mecz został usunięty.', 'success');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const loading = matchesLoading || playersLoading || optionsLoading;
  const hasError = matchesError || playersError || optionsError;

  const formatParticipants = (
    players: Array<{ playerId: string; name: string; place: number | null }>
  ) => {
    const sorted = [...players].sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
    return (
      <div className="participants-list">
        {sorted.map((player) => (
          <span key={player.playerId}>
            {player.place ?? '-'}.
            {' '}
            {player.name}
          </span>
        ))}
      </div>
    );
  };

  const formatPodium = (players: Array<{ playerId: string; name: string; place: number | null }>) => {
    const sorted = [...players].sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
    const podiumPlayers = sorted.filter((player) => player.place != null && player.place <= 3);
    if (podiumPlayers.length === 0) {
      return '-';
    }
    return podiumPlayers.map((player) => `${player.place}: ${player.name}`).join(', ');
  };

  return (
    <>
      <div className="page-header-row">
        <PageHeader title={`${game.displayName} • Mecze`} />
        <Link className="button primary" to={`/games/${game.code}/matches/new${searchSuffix}`}>
          Dodaj mecz
        </Link>
      </div>

      <div className="filters">
        <div className="filters-row">
          <FormField label="Gracz">
            <Select
              value={filters.playerId ?? ''}
              onChange={(event) =>
                updateSearchParams({ playerId: event.target.value || undefined, offset: 0 })
              }
            >
              <option value="">Wszyscy</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </Select>
          </FormField>
          {gameOptions.length > 0 ? (
            <FormField label="Opcja gry">
              <Select
                value={filters.optionId ?? ''}
                onChange={(event) =>
                  updateSearchParams({ optionId: event.target.value || undefined, offset: 0 })
                }
              >
                <option value="">Wszystkie</option>
                {gameOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.displayName}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label="Data od">
            <Input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(event) =>
                updateSearchParams({ dateFrom: event.target.value || undefined, offset: 0 })
              }
            />
          </FormField>
          <FormField label="Data do">
            <Input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(event) =>
                updateSearchParams({ dateTo: event.target.value || undefined, offset: 0 })
              }
            />
          </FormField>
          <Button type="button" variant="secondary" onClick={handleClear}>
            Wyczyść filtry
          </Button>
        </div>
      </div>

      {hasError ? (
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać meczów multiplayer."
            onRetry={() => {
              refetchMatches();
              refetchPlayers();
              refetchOptions();
            }}
          />
        </div>
      ) : loading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie meczów...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Brak meczów"
            description="Dodaj pierwszy mecz, aby rozpocząć statystyki."
            action={
              <Link className="button primary" to={`/games/${game.code}/matches/new${searchSuffix}`}>
                Dodaj mecz
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Opcja</th>
                  <th>Uczestnicy</th>
                  <th>Podium</th>
                  <th className="note-col">Notatka</th>
                  <th className="actions-col">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id}>
                    <td>{match.playedOn}</td>
                    <td>{match.option?.displayName ?? '—'}</td>
                    <td>{formatParticipants(match.players)}</td>
                    <td>{formatPodium(match.players)}</td>
                    <td className="note-col">
                      <MatchNoteHint note={match.notes} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <Link
                          className="button link"
                          to={`/games/${game.code}/matches/${match.id}/edit${searchSuffix}`}
                        >
                          Edytuj
                        </Link>
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => handleDelete(match.id)}
                        >
                          Usuń
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <Button
              type="button"
              variant="secondary"
              disabled={!canPrev}
              onClick={() => updateSearchParams({ offset: Math.max(0, offset - limit) })}
            >
              Poprzednie
            </Button>
            <div className="pagination-meta">
              {total > 0 ? `${offset + 1}-${Math.min(offset + limit, total)} z ${total}` : '0'}
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!canNext}
              onClick={() => updateSearchParams({ offset: offset + limit })}
            >
              Następne
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Usuń mecz multiplayer"
        description="Czy na pewno chcesz usunąć ten mecz? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}
