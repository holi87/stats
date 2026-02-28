import { useNavigate } from 'react-router-dom';
import { useCreateTicketToRideMatch, useTicketToRideVariants, usePlayers } from '../api/hooks';
import { TicketToRideMatchForm } from '../components/TicketToRideMatchForm';
import { PageHeader } from '../components/PageHeader';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

export function TicketToRideMatchNewPage() {
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

  const createMatch = useCreateTicketToRideMatch();

  if (variantsLoading || playersLoading) {
    return (
      <section>
        <PageHeader title="Dodaj mecz Pociągów" description="Wprowadź wyniki gry Pociągi." />
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie danych formularza...</p>
        </div>
      </section>
    );
  }

  if (variantsError || playersError) {
    return (
      <section>
        <PageHeader title="Dodaj mecz Pociągów" description="Wprowadź wyniki gry Pociągi." />
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

  return (
    <section>
      <PageHeader title="Dodaj mecz Pociągów" description="Wprowadź wyniki gry Pociągi." />
      <TicketToRideMatchForm
        variants={variants}
        players={players}
        onSubmit={async (values) => {
          await createMatch.mutateAsync({
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
          notify('Mecz Pociągów został zapisany.', 'success');
          navigate('/ticket-to-ride/matches');
        }}
        isSubmitting={createMatch.isPending}
        submitLabel={createMatch.isPending ? 'Zapisywanie...' : 'Zapisz mecz'}
      />
    </section>
  );
}
