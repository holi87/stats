import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useTicketToRideMatch,
  useTicketToRideVariants,
  usePlayers,
  useUpdateTicketToRideMatch,
} from '../api/hooks';
import { TicketToRideMatchForm } from '../components/TicketToRideMatchForm';
import { PageHeader } from '../components/PageHeader';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

export function TicketToRideMatchEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();

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
    data: match,
    isLoading: matchLoading,
    isError: matchError,
    refetch: refetchMatch,
  } = useTicketToRideMatch(id);

  const updateMatch = useUpdateTicketToRideMatch();

  if (variantsLoading || playersLoading || matchLoading) {
    return (
      <section>
        <PageHeader title="Edytuj mecz Pociągów" description="Ładowanie danych meczu..." />
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie...</p>
        </div>
      </section>
    );
  }

  if (variantsError || playersError) {
    return (
      <section>
        <PageHeader title="Edytuj mecz Pociągów" description="Edytuj dane meczu." />
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać listy wariantów lub graczy."
            onRetry={() => {
              refetchVariants();
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
        <PageHeader title="Edytuj mecz Pociągów" description="Nie udało się pobrać meczu." />
        <div className="card">
          <ErrorState description="Nie udało się pobrać danych meczu." onRetry={refetchMatch} />
          <Link className="button secondary" to="/ticket-to-ride/matches">
            Wróć do listy
          </Link>
        </div>
      </section>
    );
  }

  if (!match) {
    return (
      <section>
        <PageHeader title="Edytuj mecz Pociągów" description="Nie znaleziono meczu." />
        <div className="card">
          <p>Nie znaleziono meczu.</p>
          <Link className="button secondary" to="/ticket-to-ride/matches">
            Wróć do listy
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PageHeader title="Edytuj mecz Pociągów" description="Zaktualizuj dane meczu." />
      <TicketToRideMatchForm
        variants={variants}
        players={players}
        initialValues={{
          playedOn: match.playedOn,
          variantId: match.variant.id,
          notes: match.notes ?? '',
          players: match.players.map((player) => ({
            playerId: player.player.id,
            ticketsPoints: player.ticketsPoints,
            bonusPoints: player.bonusPoints,
            trainsCounts: player.trainsCounts,
          })),
        }}
        onSubmit={async (values) => {
          if (!id) {
            return;
          }
          await updateMatch.mutateAsync({
            id,
            playedOn: values.playedOn,
            variantId: values.variantId,
            notes: values.notes?.trim() ? values.notes.trim() : undefined,
            players: values.players.map((player) => ({
              playerId: player.playerId,
              ticketsPoints: player.ticketsPoints,
              bonusPoints: player.bonusPoints,
              trainsCounts: player.trainsCounts,
            })),
          });
          notify('Mecz Pociągów został zaktualizowany.', 'success');
          navigate('/ticket-to-ride/matches');
        }}
        isSubmitting={updateMatch.isPending}
        submitLabel={updateMatch.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
      />
    </section>
  );
}
