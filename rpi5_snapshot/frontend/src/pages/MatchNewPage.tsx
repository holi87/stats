import { useLocation, useNavigate } from 'react-router-dom';
import { useCreateMatch, useGames, usePlayers } from '../api/hooks';
import { MatchForm } from '../components/MatchForm';
import { PageHeader } from '../components/PageHeader';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

export function MatchNewPage() {
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
  const createMatch = useCreateMatch();
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
    await createMatch.mutateAsync({
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
    notify('Mecz został zapisany.', 'success');
    navigate(`/one-vs-one/matches${location.search || ''}`);
  };

  if (gamesLoading || playersLoading) {
    return (
      <section>
        <PageHeader title="Dodaj mecz" description="Utwórz nowy mecz." />
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie danych formularza...</p>
        </div>
      </section>
    );
  }

  if (gamesError || playersError) {
    return (
      <section>
        <PageHeader title="Dodaj mecz" description="Utwórz nowy mecz." />
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

  return (
    <section>
      <PageHeader title="Dodaj mecz" description="Utwórz nowy mecz." />
      <div className="card">
        <MatchForm
          games={availableGames}
          players={players}
          onSubmit={handleSubmit}
          onSuccess={handleSuccess}
          submitLabel="Zapisz"
        />
      </div>
    </section>
  );
}
