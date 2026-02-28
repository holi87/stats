import { Link, Navigate, useParams } from 'react-router-dom';
import type { ApiError } from '../api/ApiProvider';
import { useMultiplayerGame, useMultiplayerStatsPlayersByOption } from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { isBaseGameOption } from '../utils/multiplayerOptions';

const formatAvgPoints = (value: number) => value.toFixed(1);

function StatsTable({ rows }: { rows: Array<{ playerId: string; name: string; matches: number; wins: number; seconds: number; thirds: number; podiums: number; avgPoints: number; bestPoints: number }> }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Gracz</th>
          <th>Mecze</th>
          <th>1. miejsca</th>
          <th>2. miejsca</th>
          <th>3. miejsca</th>
          <th>Podia</th>
          <th>Śr. punkty</th>
          <th>Najlepszy wynik</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.playerId}>
            <td>{row.name}</td>
            <td>{row.matches}</td>
            <td>{row.wins}</td>
            <td>{row.seconds}</td>
            <td>{row.thirds}</td>
            <td>{row.podiums}</td>
            <td>{formatAvgPoints(row.avgPoints)}</td>
            <td>{row.bestPoints}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MultiplayerStatsPage() {
  const { gameCode } = useParams();
  const {
    data: game,
    isLoading: gameLoading,
    isError: gameError,
    error: gameErrorPayload,
    refetch: refetchGame,
  } = useMultiplayerGame(gameCode);
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useMultiplayerStatsPlayersByOption(game?.id);

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

  const overallStats = stats?.overall ?? [];
  const optionSections = (stats?.byOption ?? []).filter(
    (section) => !isBaseGameOption(section.option)
  );
  const hasAnyOptionStats = optionSections.some((section) => section.stats.length > 0);

  return (
    <>
      <PageHeader title={`${game.displayName} • Statystyki`} />
      {statsError ? (
        <div className="card">
          <ErrorState description="Nie udało się pobrać statystyk." onRetry={refetchStats} />
        </div>
      ) : statsLoading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie statystyk...</p>
        </div>
      ) : overallStats.length === 0 ? (
        <div className="card">
          <EmptyState title="Brak meczów" description="Dodaj mecze, aby zobaczyć statystyki." />
        </div>
      ) : (
        <>
          <div className="card table-card">
            <div className="stats-table-heading">Wszystkie mecze</div>
            <StatsTable rows={overallStats} />
          </div>

          {game.requiresOption ? (
            hasAnyOptionStats ? (
              optionSections
                .filter((section) => section.stats.length > 0)
                .map((section) => (
                  <div key={section.option.id} className="card table-card">
                    <div className="stats-table-heading">{section.option.displayName}</div>
                    <StatsTable rows={section.stats} />
                  </div>
                ))
            ) : (
              <div className="card">
                <EmptyState
                  title="Brak statystyk per opcja"
                  description="Dodaj mecze z wybraną opcją gry, aby zobaczyć podział."
                />
              </div>
            )
          ) : null}
        </>
      )}
    </>
  );
}
