import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useGames, useMatch, usePlayers, useUpdateMatch } from '../api/hooks';
import { MatchForm } from '../components/MatchForm';
import { PageHeader } from '../components/PageHeader';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

export function MatchEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const { data: games = [], isLoading: gamesLoading, isError: gamesError, refetch: refetchGames } =
    useGames();
  const {
    data: players = [],
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers,
  } = usePlayers({ active: true });
  const {
    data: match,
    isLoading: matchLoading,
    isError: matchError,
    refetch: refetchMatch,
  } = useMatch(id);
  const updateMatch = useUpdateMatch();
  const availableGames = games.filter((game) => game.code !== 'ticket_to_ride');

  const handleSubmit = async (values: {
    playedOn: string;
    gameId: string;
    playerAId: string;
    playerBId: string;
    scoreA: number;
    scoreB: number;
    notes: string;
  }) => {
    if (!id) {
      return;
    }
    await updateMatch.mutateAsync({
      id,
      gameId: values.gameId,
      playedOn: values.playedOn,
      playerAId: values.playerAId,
      playerBId: values.playerBId,
      scoreA: values.scoreA,
      scoreB: values.scoreB,
      notes: values.notes || undefined,
    });
  };

  const handleSuccess = () => {
    notify('Mecz został zaktualizowany.', 'success');
    navigate(`/one-vs-one/matches${location.search || ''}`);
  };

  if (gamesLoading || playersLoading || matchLoading) {
    return (
      <section>
        <PageHeader title="Edytuj mecz" description="Ładowanie danych meczu..." />
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie...</p>
        </div>
      </section>
    );
  }

  if (gamesError || playersError) {
    return (
      <section>
        <PageHeader title="Edytuj mecz" description="Edytuj dane meczu." />
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać listy gier lub graczy."
            onRetry={() => {
              refetchGames();
              refetchPlayers();
            }}
          />
        </div>
      </section>
    );
  }

  if (matchError) {
    return (
      <section>
        <PageHeader title="Edytuj mecz" description="Nie udało się pobrać meczu." />
        <div className="card">
          <ErrorState description="Nie udało się pobrać danych meczu." onRetry={refetchMatch} />
          <Link className="button secondary" to={`/one-vs-one/matches${location.search || ''}`}>
            Wróć do listy
          </Link>
        </div>
      </section>
    );
  }

  if (!match) {
    return (
      <section>
        <PageHeader title="Edytuj mecz" description="Nie znaleziono meczu." />
        <div className="card">
          <p>Nie znaleziono meczu.</p>
          <Link className="button secondary" to={`/one-vs-one/matches${location.search || ''}`}>
            Wróć do listy
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHeader title="Edytuj mecz" description="Zaktualizuj dane meczu." />
      <div className="card">
        <MatchForm
          games={availableGames}
          players={players}
          initialValues={{
            playedOn: match.playedOn,
            gameId: match.game.id,
            playerAId: match.playerA.id,
            playerBId: match.playerB.id,
            scoreA: match.scoreA,
            scoreB: match.scoreB,
            notes: match.notes ?? '',
          }}
          onSubmit={handleSubmit}
          onSuccess={handleSuccess}
          submitLabel="Zapisz zmiany"
        />
      </div>
    </section>
  );
}
