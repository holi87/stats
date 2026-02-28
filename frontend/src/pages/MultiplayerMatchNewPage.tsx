import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ApiError } from '../api/ApiProvider';
import {
  useCreateMultiplayerMatch,
  useMultiplayerGame,
  useMultiplayerGameCustomFields,
  useMultiplayerGameOptions,
  usePlayers,
  useTicketToRideVariants,
} from '../api/hooks';
import { MultiplayerCustomCalculatorMatchForm } from '../components/MultiplayerCustomCalculatorMatchForm';
import { MultiplayerManualMatchForm } from '../components/MultiplayerManualMatchForm';
import { MultiplayerTerraformingMarsMatchForm } from '../components/MultiplayerTerraformingMarsMatchForm';
import { MultiplayerTicketToRideMatchForm } from '../components/MultiplayerTicketToRideMatchForm';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';
import { featureFlags } from '../utils/featureFlags';

export function MultiplayerMatchNewPage() {
  const { gameCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const {
    data: game,
    isLoading: gameLoading,
    isError: gameError,
    error: gameErrorPayload,
    refetch: refetchGame,
  } = useMultiplayerGame(gameCode);
  const {
    data: players = [],
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers,
  } = usePlayers({ active: true });
  const {
    data: variants = [],
    isLoading: variantsLoading,
    isError: variantsError,
    refetch: refetchVariants,
  } = useTicketToRideVariants({ enabled: game?.scoringType === 'TTR_CALCULATOR' });
  const {
    data: gameOptions = [],
    isLoading: gameOptionsLoading,
    isError: gameOptionsError,
    refetch: refetchGameOptions,
  } = useMultiplayerGameOptions(gameCode, {
    enabled:
      game?.scoringType === 'MANUAL_POINTS' ||
      game?.scoringType === 'TM_CALCULATOR' ||
      game?.scoringType === 'CUSTOM_CALCULATOR',
  });
  const {
    data: customCalculatorFields = [],
    isLoading: customCalculatorFieldsLoading,
    isError: customCalculatorFieldsError,
    refetch: refetchCustomCalculatorFields,
  } = useMultiplayerGameCustomFields(gameCode, {
    enabled: game?.scoringType === 'CUSTOM_CALCULATOR',
  });
  const createMatch = useCreateMultiplayerMatch();
  const useSimpleTmMode = featureFlags.simpleTmMode;

  if (!gameCode) {
    return <Navigate to="/games/overview" replace />;
  }

  if (
    gameLoading ||
    playersLoading ||
    (game?.scoringType === 'TTR_CALCULATOR' && variantsLoading) ||
    ((game?.scoringType === 'MANUAL_POINTS' ||
      game?.scoringType === 'TM_CALCULATOR' ||
      game?.scoringType === 'CUSTOM_CALCULATOR') &&
      gameOptionsLoading)
    || (game?.scoringType === 'CUSTOM_CALCULATOR' && customCalculatorFieldsLoading)
  ) {
    return (
      <section>
        <PageHeader title="Nowy mecz" description="Ładowanie danych formularza..." />
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie...</p>
        </div>
      </section>
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
  }

  if (
    gameError ||
    playersError ||
    variantsError ||
    gameOptionsError ||
    customCalculatorFieldsError
  ) {
    return (
      <section>
        <PageHeader title="Nowy mecz" description="Utwórz nowy mecz." />
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać danych gry lub graczy."
            onRetry={() => {
              refetchGame();
              refetchPlayers();
              refetchVariants();
              refetchGameOptions();
              refetchCustomCalculatorFields();
            }}
          />
        </div>
      </section>
    );
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

  if (
    game.scoringType !== 'MANUAL_POINTS' &&
    game.scoringType !== 'TTR_CALCULATOR' &&
    game.scoringType !== 'TM_CALCULATOR' &&
    game.scoringType !== 'CUSTOM_CALCULATOR'
  ) {
    return (
      <section>
        <PageHeader title={`Nowy mecz • ${game.displayName}`} />
        <div className="card">
          <EmptyState
            title="Formularz niedostępny"
            description="Ten widok obsługuje gry manualne, kalkulator własny i Pociągi."
            action={
              <Link className="button secondary" to={`/games/${game.code}/matches${location.search || ''}`}>
                Wróć do meczów
              </Link>
            }
          />
        </div>
      </section>
    );
  }

  const handleSubmitManual = async (values: {
    playedOn: string;
    notes: string;
    optionIds?: string[];
    players: { playerId: string; totalPoints: number }[];
  }) => {
    await createMatch.mutateAsync({
      gameId: game.id,
      optionIds: values.optionIds,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : undefined,
      players: values.players.map((player) => ({
        playerId: player.playerId,
        totalPoints: player.totalPoints,
      })),
    });
  };

  const handleSubmitTtr = async (values: {
    playedOn: string;
    notes: string;
    variantId: string;
    players: { playerId: string; ticketsPoints: number; bonusPoints: number; trainsCounts: Record<string, number> }[];
  }) => {
    await createMatch.mutateAsync({
      gameId: game.id,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : undefined,
      ticketToRide: { variantId: values.variantId },
      players: values.players.map((player) => ({
        playerId: player.playerId,
        ticketsPoints: player.ticketsPoints,
        bonusPoints: player.bonusPoints,
        trainsCounts: player.trainsCounts,
      })),
    });
  };

  const handleSubmitTm = async (values: {
    playedOn: string;
    notes: string;
    optionIds?: string[];
    players: {
      playerId: string;
      titlesCount: number;
      awardsFirstCount: number;
      awardsSecondCount: number;
      citiesPoints: number;
      forestsPoints: number;
      cardsPoints: number;
      trPoints: number;
    }[];
  }) => {
    await createMatch.mutateAsync({
      gameId: game.id,
      optionIds: values.optionIds,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : undefined,
      players: values.players.map((player) => ({
        playerId: player.playerId,
        titlesCount: player.titlesCount,
        awardsFirstCount: player.awardsFirstCount,
        awardsSecondCount: player.awardsSecondCount,
        citiesPoints: player.citiesPoints,
        forestsPoints: player.forestsPoints,
        cardsPoints: player.cardsPoints,
        trPoints: player.trPoints,
      })),
    });
  };

  const handleSubmitCustom = async (values: {
    playedOn: string;
    notes: string;
    optionIds?: string[];
    players: { playerId: string; calculatorValues: Record<string, number> }[];
  }) => {
    await createMatch.mutateAsync({
      gameId: game.id,
      optionIds: values.optionIds,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : undefined,
      players: values.players.map((player) => ({
        playerId: player.playerId,
        calculatorValues: player.calculatorValues,
      })),
    });
  };

  const handleSuccess = () => {
    notify('Mecz został zapisany.', 'success');
    navigate(`/games/${game.code}/matches${location.search || ''}`);
  };

  const useManualForm = game.scoringType === 'MANUAL_POINTS' || (useSimpleTmMode && game.scoringType === 'TM_CALCULATOR');

  return (
    <section>
      <PageHeader title={`Nowy mecz • ${game.displayName}`} description="Utwórz nowy mecz." />
      <div className="card">
        {useManualForm ? (
          <MultiplayerManualMatchForm
            game={game}
            players={players}
            gameOptions={gameOptions}
            onSubmit={handleSubmitManual}
            onSuccess={handleSuccess}
            submitLabel="Zapisz mecz"
          />
        ) : game.scoringType === 'TTR_CALCULATOR' ? (
          <MultiplayerTicketToRideMatchForm
            game={game}
            players={players}
            variants={variants}
            onSubmit={handleSubmitTtr}
            onSuccess={handleSuccess}
            submitLabel="Zapisz mecz"
          />
        ) : game.scoringType === 'CUSTOM_CALCULATOR' ? (
          <MultiplayerCustomCalculatorMatchForm
            game={game}
            players={players}
            calculatorFields={customCalculatorFields}
            gameOptions={gameOptions}
            onSubmit={handleSubmitCustom}
            onSuccess={handleSuccess}
            submitLabel="Zapisz mecz"
          />
        ) : (
          <MultiplayerTerraformingMarsMatchForm
            game={game}
            players={players}
            gameOptions={gameOptions}
            onSubmit={handleSubmitTm}
            onSuccess={handleSuccess}
            submitLabel="Zapisz mecz"
          />
        )}
      </div>
    </section>
  );
}
