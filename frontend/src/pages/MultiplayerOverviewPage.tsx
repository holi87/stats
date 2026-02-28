import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMultiplayerGames, useMultiplayerStatsPodiums } from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';

export function MultiplayerOverviewPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedGameCode, setSelectedGameCode] = useState('');

  const {
    data: games = [],
    isLoading,
    isError,
  } = useMultiplayerGames();
  const activeGames = games;

  const {
    data: podiums = [],
    isLoading: podiumsLoading,
    isError: podiumsError,
    refetch: refetchPodiums,
  } = useMultiplayerStatsPodiums({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const showSelectedGameActions = Boolean(selectedGameCode);

  return (
    <>
      <div className="page-header-row">
        <PageHeader
          title="Gry"
          description="Centrum meczów i statystyk dla wszystkich aktywnych gier."
        />
      </div>

      <section className="overview-hero card">
        <div>
          <h2>Tryb szybkiego działania</h2>
          <p>
            Wybierz grę i przejdź od razu do dodawania meczu albo przeglądu statystyk. Ten widok jest
            zoptymalizowany pod iPhone i desktop.
          </p>
        </div>
        <div className="overview-hero-actions">
          {showSelectedGameActions ? (
            <>
              <Link className="button primary" to={`/games/${selectedGameCode}/matches/new`}>
                Dodaj mecz
              </Link>
              <Link className="button secondary" to={`/games/${selectedGameCode}/stats`}>
                Statystyki gry
              </Link>
            </>
          ) : (
            <button type="button" className="button primary" disabled>
              Wybierz grę poniżej
            </button>
          )}
        </div>
      </section>

      <div className="card">
        <div className="filters-row">
          <FormField label="Data od">
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </FormField>
          <FormField label="Data do">
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </FormField>
          <FormField label="Wybierz grę">
            <Select
              value={selectedGameCode}
              onChange={(event) => setSelectedGameCode(event.target.value)}
              disabled={isLoading || isError}
            >
              <option value="">Wybierz grę</option>
              {activeGames.map((game) => (
                <option key={game.id} value={game.code}>
                  {game.displayName}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {isError ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Nie udało się pobrać listy gier.
          </p>
        ) : null}
      </div>

      {podiumsError ? (
        <div className="card">
          <ErrorState description="Nie udało się pobrać podiumów." onRetry={refetchPodiums} />
        </div>
      ) : podiumsLoading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie podiumów...</p>
        </div>
      ) : podiums.length === 0 ? (
        <div className="card">
          <EmptyState title="Brak danych" description="Dodaj mecze, aby zobaczyć podium." />
        </div>
      ) : (
        <div className="card table-card">
          <div className="stats-table-heading">Ranking podium (wszystkie gry)</div>
          <table className="table">
            <thead>
              <tr>
                <th>Gracz</th>
                <th>1. miejsca</th>
                <th>2. miejsca</th>
                <th>3. miejsca</th>
                <th>Podia</th>
              </tr>
            </thead>
            <tbody>
              {podiums.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.name}</td>
                  <td>{row.wins}</td>
                  <td>{row.seconds}</td>
                  <td>{row.thirds}</td>
                  <td>{row.podiums}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError ? (
        activeGames.length === 0 ? (
          <div className="card">
            <EmptyState
              title="Brak gier"
              description="Nie znaleziono aktywnych gier."
            />
          </div>
        ) : (
          <div className="multiplayer-game-grid">
            {activeGames.map((game) => (
              <div key={game.id} className="card multiplayer-game-card">
                <div>
                  <h3>{game.displayName}</h3>
                  <p className="multiplayer-game-meta">
                    {game.minPlayers}–{game.maxPlayers} graczy
                    {game.requiresOption ? ' • z opcjami gry' : ''}
                  </p>
                </div>
                <div className="multiplayer-game-actions">
                  <Link className="button primary" to={`/games/${game.code}/matches/new`}>
                    Dodaj mecz
                  </Link>
                  <Link className="button secondary" to={`/games/${game.code}/stats`}>
                    Statystyki
                  </Link>
                  <Link className="button ghost" to={`/games/${game.code}/matches`}>
                    Lista meczów
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )
      ) : isLoading ? (
        <Spinner />
      ) : null}
    </>
  );
}
