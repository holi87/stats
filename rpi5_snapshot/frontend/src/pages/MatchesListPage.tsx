import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useDeleteMatch, useGames, useMatches, usePlayers } from '../api/hooks';
import { MatchesFilters, MatchesFiltersState } from '../components/MatchesFilters';
import { MatchesTable } from '../components/MatchesTable';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';
import { getApiBaseUrl } from '../utils/env';

const LIMIT = 50;

function parseOffset(value: string | null) {
  if (!value) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function MatchesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { notify } = useToast();

  const filters: MatchesFiltersState = {
    gameId: searchParams.get('gameId') || undefined,
    playerId: searchParams.get('playerId') || undefined,
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
  };

  const offset = parseOffset(searchParams.get('offset'));

  const { data: games = [], isLoading: gamesLoading, isError: gamesError, refetch: refetchGames } =
    useGames();
  const availableGames = games.filter((game) => game.code !== 'ticket_to_ride');
  const {
    data: players = [],
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers,
  } = usePlayers({ active: true });
  const {
    data: matchesData,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch: refetchMatches,
  } = useMatches({
    ...filters,
    limit: LIMIT,
    offset,
    sort: 'playedOnDesc',
  });

  const deleteMatch = useDeleteMatch();

  const updateSearchParams = (next: Partial<MatchesFiltersState> & { offset?: number }) => {
    const params = new URLSearchParams(searchParams);

    const setParam = (key: string, value?: string) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };

    if (next.gameId !== undefined) {
      setParam('gameId', next.gameId);
    }
    if (next.playerId !== undefined) {
      setParam('playerId', next.playerId);
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

  const handleFiltersChange = (next: Partial<MatchesFiltersState>) => {
    updateSearchParams({ ...next, offset: 0 });
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

  const total = matchesData?.total ?? 0;
  const items = matchesData?.items ?? [];
  const canPrev = offset > 0;
  const canNext = offset + LIMIT < total;

  const loading = gamesLoading || playersLoading || matchesLoading;
  const hasError = gamesError || playersError || matchesError;
  const exportParams = new URLSearchParams();

  if (filters.gameId) {
    exportParams.set('gameId', filters.gameId);
  }
  if (filters.playerId) {
    exportParams.set('playerId', filters.playerId);
  }
  if (filters.dateFrom) {
    exportParams.set('dateFrom', filters.dateFrom);
  }
  if (filters.dateTo) {
    exportParams.set('dateTo', filters.dateTo);
  }

  const exportQuery = exportParams.toString();
  const exportUrl = `${getApiBaseUrl()}/api/v1/matches/export.csv${
    exportQuery ? `?${exportQuery}` : ''
  }`;

  return (
    <section>
      <div className="page-header-row">
        <PageHeader title="Mecze" description="Przeglądaj i filtruj zapisane mecze." />
        <div className="page-header-actions">
          <a className="button secondary" href={exportUrl}>
            Eksport CSV
          </a>
          <Link
            className="button primary"
            to={`/one-vs-one/matches/new${
              searchParams.toString() ? `?${searchParams.toString()}` : ''
            }`}
          >
            Dodaj mecz
          </Link>
        </div>
      </div>

      <MatchesFilters
        games={availableGames}
        players={players}
        values={filters}
        onChange={handleFiltersChange}
        onClear={handleClear}
      />

      {hasError ? (
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać listy meczów."
            onRetry={() => {
              refetchGames();
              refetchPlayers();
              refetchMatches();
            }}
          />
        </div>
      ) : loading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie meczów...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Brak meczów"
            description="Dodaj pierwszy mecz, aby rozpocząć statystyki."
            action={
              <Link
                className="button primary"
                to={`/one-vs-one/matches/new${
                  searchParams.toString() ? `?${searchParams.toString()}` : ''
                }`}
              >
                Dodaj mecz
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <MatchesTable items={items} onDelete={handleDelete} search={searchParams.toString()} />
          <div className="pagination">
            <Button
              type="button"
              variant="secondary"
              disabled={!canPrev}
              onClick={() => updateSearchParams({ offset: Math.max(0, offset - LIMIT) })}
            >
              Poprzednie
            </Button>
            <div className="pagination-meta">
              {total > 0 ? `${offset + 1}-${Math.min(offset + LIMIT, total)} z ${total}` : '0'}
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!canNext}
              onClick={() => updateSearchParams({ offset: offset + LIMIT })}
            >
              Następne
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Usuń mecz"
        description="Czy na pewno chcesz usunąć ten mecz? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </section>
  );
}
