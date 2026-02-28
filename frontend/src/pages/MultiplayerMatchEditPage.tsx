import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ApiError } from '../api/ApiProvider';
import {
  useMultiplayerMatch,
  useMultiplayerGameCustomFields,
  useMultiplayerGameOptions,
  usePlayers,
  useTicketToRideVariants,
  useUpdateMultiplayerMatch,
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

export function MultiplayerMatchEditPage() {
  const { gameCode, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const {
    data: match,
    isLoading: matchLoading,
    isError: matchError,
    error: matchErrorPayload,
    refetch: refetchMatch,
  } = useMultiplayerMatch(id);
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
  } = useTicketToRideVariants({ enabled: match?.game?.scoringType === 'TTR_CALCULATOR' });
  const {
    data: gameOptions = [],
    isLoading: gameOptionsLoading,
    isError: gameOptionsError,
    refetch: refetchGameOptions,
  } = useMultiplayerGameOptions(gameCode, {
    enabled:
      match?.game?.scoringType === 'MANUAL_POINTS' ||
      match?.game?.scoringType === 'TM_CALCULATOR' ||
      match?.game?.scoringType === 'CUSTOM_CALCULATOR',
  });
  const {
    data: customCalculatorFields = [],
    isLoading: customCalculatorFieldsLoading,
    isError: customCalculatorFieldsError,
    refetch: refetchCustomCalculatorFields,
  } = useMultiplayerGameCustomFields(gameCode, {
    enabled: match?.game?.scoringType === 'CUSTOM_CALCULATOR',
  });
  const updateMatch = useUpdateMultiplayerMatch();
  const useSimpleTmMode = featureFlags.simpleTmMode;

  if (!gameCode) {
    return <Navigate to="/games/overview" replace />;
  }

  if (
    matchLoading ||
    playersLoading ||
    (match?.game?.scoringType === 'TTR_CALCULATOR' && variantsLoading) ||
    ((match?.game?.scoringType === 'MANUAL_POINTS' ||
      match?.game?.scoringType === 'TM_CALCULATOR' ||
      match?.game?.scoringType === 'CUSTOM_CALCULATOR') &&
      gameOptionsLoading)
    || (match?.game?.scoringType === 'CUSTOM_CALCULATOR' && customCalculatorFieldsLoading)
  ) {
    return (
      <section>
        <PageHeader title="Edycja meczu" description="Ładowanie danych meczu..." />
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie...</p>
        </div>
      </section>
    );
  }

  if (matchError) {
    const error = matchErrorPayload as ApiError | null;
    if (error?.code === 'NOT_FOUND') {
      return (
        <EmptyState
          title="Nie znaleziono meczu"
          description="Wybrany mecz nie istnieje."
          action={
            <Link
              className="button secondary"
              to={`/games/${gameCode}/matches${location.search || ''}`}
            >
              Wróć do meczów
            </Link>
          }
        />
      );
    }
  }

  if (
    matchError ||
    playersError ||
    variantsError ||
    gameOptionsError ||
    customCalculatorFieldsError
  ) {
    return (
      <section>
        <PageHeader title="Edycja meczu" description="Nie udało się pobrać danych." />
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać danych meczu lub graczy."
            onRetry={() => {
              refetchMatch();
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

  if (!match) {
    return (
      <EmptyState
        title="Nie znaleziono meczu"
        description="Wybrany mecz nie istnieje."
        action={
          <Link
            className="button secondary"
            to={`/games/${gameCode}/matches${location.search || ''}`}
          >
            Wróć do meczów
          </Link>
        }
      />
    );
  }

  if (match.game.code !== gameCode) {
    return (
      <EmptyState
        title="Nieprawidłowy adres"
        description="Ten mecz nie należy do wybranej gry."
        action={
          <Link
            className="button secondary"
            to={`/games/${match.game.code}/matches${location.search || ''}`}
          >
            Przejdź do właściwej gry
          </Link>
        }
      />
    );
  }

  if (
    match.game.scoringType !== 'MANUAL_POINTS' &&
    match.game.scoringType !== 'TTR_CALCULATOR' &&
    match.game.scoringType !== 'TM_CALCULATOR' &&
    match.game.scoringType !== 'CUSTOM_CALCULATOR'
  ) {
    return (
      <section>
        <PageHeader title={`Edycja meczu • ${match.game.displayName}`} />
        <div className="card">
          <EmptyState
            title="Formularz niedostępny"
            description="Ten widok obsługuje gry manualne, kalkulator własny i Pociągi."
            action={
              <Link
                className="button secondary"
                to={`/games/${match.game.code}/matches${location.search || ''}`}
              >
                Wróć do meczów
              </Link>
            }
          />
        </div>
      </section>
    );
  }

  const sortByPlaceThenPoints = (
    a: { place: number | null; totalPoints: number; playerId: string },
    b: { place: number | null; totalPoints: number; playerId: string }
  ) => {
    const placeDiff = (a.place ?? 0) - (b.place ?? 0);
    if (placeDiff !== 0) {
      return placeDiff;
    }
    const pointsDiff = b.totalPoints - a.totalPoints;
    if (pointsDiff !== 0) {
      return pointsDiff;
    }
    return a.playerId.localeCompare(b.playerId);
  };

  const initialPlayers = [...match.players].sort(sortByPlaceThenPoints);
  const isTicketToRide =
    match.game.scoringType === 'TTR_CALCULATOR' && 'ticketToRide' in match && match.ticketToRide;
  const ticketToRidePlayers = isTicketToRide
    ? [...match.ticketToRide.playersDetails].sort(sortByPlaceThenPoints)
    : [];
  const isTerraformingMars =
    match.game.scoringType === 'TM_CALCULATOR' && 'terraformingMars' in match && match.terraformingMars;
  const terraformingPlayers = isTerraformingMars
    ? [...match.terraformingMars.playersDetails].sort(sortByPlaceThenPoints)
    : [];
  const isCustomCalculator =
    match.game.scoringType === 'CUSTOM_CALCULATOR' && 'customCalculator' in match && match.customCalculator;
  const customCalculatorPlayers = isCustomCalculator
    ? [...match.customCalculator.playersDetails].sort(sortByPlaceThenPoints)
    : [];

  const handleSubmitManual = async (values: {
    playedOn: string;
    notes: string;
    optionIds?: string[];
    players: { playerId: string; totalPoints: number }[];
  }) => {
    if (!id) {
      return;
    }
    await updateMatch.mutateAsync({
      id,
      optionIds: values.optionIds,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : null,
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
    if (!id) {
      return;
    }
    await updateMatch.mutateAsync({
      id,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : null,
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
    if (!id) {
      return;
    }
    await updateMatch.mutateAsync({
      id,
      optionIds: values.optionIds,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : null,
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
    if (!id) {
      return;
    }
    await updateMatch.mutateAsync({
      id,
      optionIds: values.optionIds,
      playedOn: values.playedOn,
      notes: values.notes.trim() ? values.notes : null,
      players: values.players.map((player) => ({
        playerId: player.playerId,
        calculatorValues: player.calculatorValues,
      })),
    });
  };

  const handleSuccess = () => {
    notify('Mecz został zaktualizowany.', 'success');
    navigate(`/games/${match.game.code}/matches${location.search || ''}`);
  };

  const useManualForm =
    match.game.scoringType === 'MANUAL_POINTS' ||
    (useSimpleTmMode && match.game.scoringType === 'TM_CALCULATOR');

  return (
    <section>
      <PageHeader
        title={`Edycja meczu • ${match.game.displayName}`}
        description="Zaktualizuj dane meczu."
      />
      <div className="card">
        {useManualForm ? (
          <MultiplayerManualMatchForm
            game={match.game}
            players={players}
            gameOptions={gameOptions}
            initialValues={{
              playedOn: match.playedOn,
              notes: match.notes ?? '',
              optionIds: match.options?.map((option) => option.id) ?? [],
              players: initialPlayers.map((player) => ({
                playerId: player.playerId,
                totalPoints: player.totalPoints,
              })),
            }}
            onSubmit={handleSubmitManual}
            onSuccess={handleSuccess}
            submitLabel="Zapisz zmiany"
          />
        ) : match.game.scoringType === 'TTR_CALCULATOR' ? (
          <MultiplayerTicketToRideMatchForm
            game={match.game}
            players={players}
            variants={variants}
            initialValues={{
              playedOn: match.playedOn,
              notes: match.notes ?? '',
              variantId: isTicketToRide ? match.ticketToRide.variant?.id ?? '' : '',
              players: isTicketToRide
                ? ticketToRidePlayers.map((detail) => ({
                    playerId: detail.playerId,
                    ticketsPoints: detail.ticketsPoints,
                    bonusPoints: detail.bonusPoints,
                    trainsCounts: detail.trainsCounts,
                  }))
                : [],
            }}
            onSubmit={handleSubmitTtr}
            onSuccess={handleSuccess}
            submitLabel="Zapisz zmiany"
          />
        ) : match.game.scoringType === 'CUSTOM_CALCULATOR' ? (
          <MultiplayerCustomCalculatorMatchForm
            game={match.game}
            players={players}
            calculatorFields={customCalculatorFields}
            gameOptions={gameOptions}
            initialValues={{
              playedOn: match.playedOn,
              notes: match.notes ?? '',
              optionIds: match.options?.map((option) => option.id) ?? [],
              players: customCalculatorPlayers.map((player) => ({
                playerId: player.playerId,
                calculatorValues: Object.fromEntries(
                  player.values.map((value) => [value.fieldId, value.value])
                ),
              })),
            }}
            onSubmit={handleSubmitCustom}
            onSuccess={handleSuccess}
            submitLabel="Zapisz zmiany"
          />
        ) : (
          <MultiplayerTerraformingMarsMatchForm
            game={match.game}
            players={players}
            gameOptions={gameOptions}
            initialValues={{
              playedOn: match.playedOn,
              notes: match.notes ?? '',
              optionIds: match.options?.map((option) => option.id) ?? [],
              players: terraformingPlayers.map((detail) => ({
                playerId: detail.playerId,
                titlesCount: detail.titlesCount,
                awardsFirstCount: detail.awardsFirstCount,
                awardsSecondCount: detail.awardsSecondCount,
                citiesPoints: detail.citiesPoints,
                forestsPoints: detail.forestsPoints,
                cardsPoints: detail.cardsPoints,
                trPoints: detail.trPoints,
              })),
            }}
            onSubmit={handleSubmitTm}
            onSuccess={handleSuccess}
            submitLabel="Zapisz zmiany"
          />
        )}
      </div>
    </section>
  );
}
