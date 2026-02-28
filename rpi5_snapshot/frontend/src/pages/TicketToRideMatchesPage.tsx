import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import {
  useDeleteTicketToRideMatch,
  useTicketToRideMatches,
  useTicketToRideVariants,
  usePlayers,
} from '../api/hooks';
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

export function TicketToRideMatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { notify } = useToast();

  const filters = {
    variantId: searchParams.get('variantId') || undefined,
    playerId: searchParams.get('playerId') || undefined,
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
  };

  const offsetRaw = searchParams.get('offset');
  const offset = offsetRaw ? Math.max(0, Number(offsetRaw) || 0) : 0;
  const limit = 50;

  const {
    data: variants = [],
    isLoading: variantsLoading,
    isError: variantsError,
    refetch: refetchVariants,
  } = useTicketToRideVariants();
  const {
    data: players = [],
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers,
  } = usePlayers({ active: true });

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useTicketToRideMatches({
    ...filters,
    limit,
    offset,
  });

  const deleteMatch = useDeleteTicketToRideMatch();

  const matches = data?.items ?? [];
  const total = data?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const updateSearchParams = (next: Partial<typeof filters> & { offset?: number }) => {
    const params = new URLSearchParams(searchParams);

    const setParam = (key: string, value?: string) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };

    if (next.variantId !== undefined) {
      setParam('variantId', next.variantId);
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
      notify('Mecz Pociągów został usunięty.', 'success');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const loading = isLoading || variantsLoading || playersLoading;
  const hasError = isError || variantsError || playersError;

  return (
    <section>
      <div className="page-header-row">
        <PageHeader title="Mecze Pociągów" description="Moduł Pociągów (2-5 graczy)." />
        <Link className="button primary" to="/ticket-to-ride/matches/new">
          Dodaj mecz
        </Link>
      </div>

      <div className="filters">
        <div className="filters-row">
          <FormField label="Wariant">
            <Select
              value={filters.variantId ?? ''}
              onChange={(event) => updateSearchParams({ variantId: event.target.value || undefined, offset: 0 })}
            >
              <option value="">Wszystkie</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Gracz">
            <Select
              value={filters.playerId ?? ''}
              onChange={(event) => updateSearchParams({ playerId: event.target.value || undefined, offset: 0 })}
            >
              <option value="">Wszyscy</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Data od">
            <Input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(event) => updateSearchParams({ dateFrom: event.target.value || undefined, offset: 0 })}
            />
          </FormField>
          <FormField label="Data do">
            <Input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(event) => updateSearchParams({ dateTo: event.target.value || undefined, offset: 0 })}
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
            description="Nie udało się pobrać meczów Pociągów."
            onRetry={() => {
              refetch();
              refetchVariants();
              refetchPlayers();
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
            title="Brak meczów Pociągów"
            description="Dodaj pierwszy mecz, aby rozpocząć statystyki."
            action={
              <Link className="button primary" to="/ticket-to-ride/matches/new">
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
                  <th>Wariant</th>
                  <th>Liczba graczy</th>
                  <th>Zwycięzca</th>
                  <th className="note-col">Notatka</th>
                  <th className="actions-col">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const winner = match.players.find((player) => player.place === 1);
                  return (
                    <tr key={match.id}>
                      <td>{match.playedOn}</td>
                      <td>{match.variant.name}</td>
                      <td>{match.players.length}</td>
                      <td>{winner ? winner.player.name : '-'}</td>
                      <td className="note-col">
                        <MatchNoteHint note={match.notes} />
                      </td>
                      <td className="actions-col">
                        <div className="table-actions">
                          <Link className="button link" to={`/ticket-to-ride/matches/${match.id}/edit`}>
                            Edytuj
                          </Link>
                          <button type="button" className="button danger" onClick={() => handleDelete(match.id)}>
                            Usuń
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
        title="Usuń mecz Pociągów"
        description="Czy na pewno chcesz usunąć ten mecz? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </section>
  );
}
