import { useMemo, useState } from 'react';
import { useGames, useHeadToHead, usePlayers, useStatsPlayers } from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';

export function StatsPage() {
  const { data: games = [], isLoading: gamesLoading, isError: gamesError, refetch: refetchGames } =
    useGames();
  const {
    data: players = [],
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers,
  } = usePlayers({ active: true });
  const [gameId, setGameId] = useState<string>('');
  const availableGames = games.filter((game) => game.code !== 'ticket_to_ride');
  const [player1Id, setPlayer1Id] = useState<string>('');
  const [player2Id, setPlayer2Id] = useState<string>('');

  const {
    data: stats = [],
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useStatsPlayers({
    gameId: gameId || undefined,
  });

  const samePlayerError =
    player1Id && player2Id && player1Id === player2Id
      ? 'Wybierz dwóch różnych graczy.'
      : null;

  const headToHeadParams = useMemo(() => {
    if (!player1Id || !player2Id || samePlayerError) {
      return null;
    }
    return {
      player1Id,
      player2Id,
      gameId: gameId || undefined,
    };
  }, [player1Id, player2Id, gameId, samePlayerError]);

  const {
    data: headToHead,
    isLoading: headToHeadLoading,
    isError: headToHeadError,
    refetch: refetchHeadToHead,
  } = useHeadToHead(headToHeadParams);

  const loading = gamesLoading || playersLoading;
  const error = gamesError || playersError;
  const hasGameSelected = Boolean(gameId);

  return (
    <section>
      <PageHeader title="Statystyki" description="Statystyki graczy i pojedynków." />

      <div className="card">
        <FormField label="Gra">
          <Select value={gameId} onChange={(event) => setGameId(event.target.value)}>
            <option value="">Wybierz grę</option>
            {availableGames.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {error ? (
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać listy gier lub graczy."
            onRetry={() => {
              refetchGames();
              refetchPlayers();
            }}
          />
        </div>
      ) : loading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie danych...</p>
        </div>
      ) : !hasGameSelected ? (
        <div className="card">
          <EmptyState title="Wybierz grę" description="Wybierz grę, aby zobaczyć statystyki." />
        </div>
      ) : statsError ? (
        <div className="card">
          <ErrorState description="Nie udało się pobrać statystyk." onRetry={refetchStats} />
        </div>
      ) : stats.length === 0 ? (
        <div className="card">
          <EmptyState title="Brak meczów" description="Dodaj mecze, aby zobaczyć statystyki." />
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Gracz</th>
                <th>Mecze</th>
                <th>Wygrane</th>
                <th>Punkty</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.name}</td>
                  <td>{row.matches}</td>
                  <td>{row.wins}</td>
                  <td>
                    {(row.pointsFor ?? 0)}:{(row.pointsAgainst ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="head-to-head">
          <div className="head-to-head-controls">
            <FormField label="Gracz 1">
              <Select value={player1Id} onChange={(event) => setPlayer1Id(event.target.value)}>
                <option value="">Wybierz gracza</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Gracz 2">
              <Select value={player2Id} onChange={(event) => setPlayer2Id(event.target.value)}>
                <option value="">Wybierz gracza</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {samePlayerError ? <p className="error-text">{samePlayerError}</p> : null}
          {headToHeadLoading ? (
            <div className="center-content">
              <Spinner />
              <p>Ładowanie statystyk...</p>
            </div>
          ) : headToHeadError ? (
            <ErrorState
              title="Nie udało się pobrać statystyk"
              description="Spróbuj ponownie."
              onRetry={refetchHeadToHead}
            />
          ) : headToHead ? (
            <div className="head-to-head-results">
              <div className="result-tile">
                <span>Mecze</span>
                <strong>{headToHead.matches}</strong>
              </div>
              <div className="result-tile">
                <span>{headToHead.player1.name} wygrane</span>
                <strong>{headToHead.player1Wins}</strong>
              </div>
              <div className="result-tile">
                <span>{headToHead.player2.name} wygrane</span>
                <strong>{headToHead.player2Wins}</strong>
              </div>
              <div className="result-tile">
                <span>Remisy</span>
                <strong>{headToHead.draws}</strong>
              </div>
            </div>
          ) : (
            <p className="muted">Wybierz dwóch graczy, aby zobaczyć wynik.</p>
          )}
        </div>
      </div>
    </section>
  );
}
