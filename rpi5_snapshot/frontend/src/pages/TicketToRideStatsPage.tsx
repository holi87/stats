import { useState } from 'react';
import { useTicketToRideStatsPlayers, useTicketToRideVariants } from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';

const formatAvgPoints = (value: number) => {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
};

export function TicketToRideStatsPage() {
  const [variantId, setVariantId] = useState('');

  const {
    data: variants = [],
    isLoading: variantsLoading,
    isError: variantsError,
    refetch: refetchVariants,
  } = useTicketToRideVariants();

  const {
    data: stats = [],
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useTicketToRideStatsPlayers({ variantId: variantId || undefined });

  const loading = variantsLoading || statsLoading;
  const hasError = variantsError || statsError;

  return (
    <section>
      <PageHeader title="Statystyki Pociągów" description="Podsumowania wyników dla Pociągów." />

      <div className="card">
        <FormField label="Wariant">
          <Select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
            <option value="">Wszystkie warianty</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {hasError ? (
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać statystyk."
            onRetry={() => {
              refetchVariants();
              refetchStats();
            }}
          />
        </div>
      ) : loading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie statystyk...</p>
        </div>
      ) : stats.length === 0 ? (
        <div className="card">
          <EmptyState title="Brak danych" description="Dodaj mecze, aby zobaczyć statystyki." />
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Gracz</th>
                <th>Mecze</th>
                <th>Wygrane</th>
                <th>Podia</th>
                <th>Śr. punktów</th>
                <th>Najlepszy wynik</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.name}</td>
                  <td>{row.matches}</td>
                  <td>{row.wins}</td>
                  <td>{row.podiums}</td>
                  <td>{formatAvgPoints(row.avgPoints)}</td>
                  <td>{row.bestPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
