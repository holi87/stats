import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { ApiError, ApiErrorDetail } from '../api/ApiProvider';
import type { MultiplayerGame, Player, TicketToRideVariant } from '../api/hooks';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';

const TRAIN_POINTS = [
  { length: '1', points: 1 },
  { length: '2', points: 2 },
  { length: '3', points: 4 },
  { length: '4', points: 7 },
  { length: '5', points: 10 },
  { length: '6', points: 15 },
  { length: '7', points: 18 },
  { length: '8', points: 21 },
  { length: '9', points: 27 },
];

export type MultiplayerTicketToRidePlayer = {
  playerId: string;
  ticketsPoints: number;
  bonusPoints: number;
  trainsCounts: Record<string, number>;
};

export type MultiplayerTicketToRideMatchFormValues = {
  playedOn: string;
  variantId: string;
  notes: string;
  players: MultiplayerTicketToRidePlayer[];
};

type MultiplayerTicketToRideMatchFormProps = {
  game: MultiplayerGame;
  players: Player[];
  variants: TicketToRideVariant[];
  initialValues?: Partial<MultiplayerTicketToRideMatchFormValues>;
  onSubmit: (values: MultiplayerTicketToRideMatchFormValues) => Promise<void>;
  onSuccess?: () => void;
  submitLabel?: string;
};

function getTodayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parseNumber(value: string) {
  if (value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function createEmptyCounts() {
  return TRAIN_POINTS.reduce<Record<string, number>>((acc, row) => {
    acc[row.length] = 0;
    return acc;
  }, {});
}

function normalizeCounts(counts?: Record<string, number>) {
  return {
    ...createEmptyCounts(),
    ...(counts ?? {}),
  };
}

function buildPlayers(initial: MultiplayerTicketToRidePlayer[] | undefined, count: number) {
  const safe = Array.isArray(initial) ? initial : [];
  const trimmed = safe.slice(0, count).map((player) => ({
    ...player,
    trainsCounts: normalizeCounts(player.trainsCounts),
  }));
  while (trimmed.length < count) {
    trimmed.push({
      playerId: '',
      ticketsPoints: 0,
      bonusPoints: 0,
      trainsCounts: createEmptyCounts(),
    });
  }
  return trimmed;
}

function parseApiError(error: unknown) {
  const apiError = error as ApiError;
  const details = apiError?.details || [];
  const fieldErrors: Record<string, string> = {};
  details.forEach((detail) => {
    if (detail.field) {
      fieldErrors[detail.field] = detail.message;
    }
  });

  return {
    message: apiError?.message || 'Wystąpił błąd',
    details,
    fieldErrors,
  };
}

const computeTrainsPoints = (counts: Record<string, number>) =>
  TRAIN_POINTS.reduce((sum, row) => sum + (counts[row.length] ?? 0) * row.points, 0);

const computeTotalPoints = (counts: Record<string, number>, tickets: number, bonus: number) =>
  computeTrainsPoints(counts) + tickets + bonus;

export function MultiplayerTicketToRideMatchForm({
  game,
  players,
  variants,
  initialValues,
  onSubmit,
  onSuccess,
  submitLabel = 'Zapisz mecz',
}: MultiplayerTicketToRideMatchFormProps) {
  const idPrefix = useId();
  const initialCount = clamp(
    initialValues?.players?.length ?? game.minPlayers,
    game.minPlayers,
    game.maxPlayers
  );

  const [playedOn, setPlayedOn] = useState(initialValues?.playedOn ?? getTodayDate());
  const [variantId, setVariantId] = useState(initialValues?.variantId ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [playersCount, setPlayersCount] = useState(initialCount);
  const [playersState, setPlayersState] = useState<MultiplayerTicketToRidePlayer[]>(() =>
    buildPlayers(initialValues?.players, initialCount)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorSummary, setErrorSummary] = useState<ApiErrorDetail[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [podiumVisible, setPodiumVisible] = useState(false);

  useEffect(() => {
    const nextCount = clamp(
      initialValues?.players?.length ?? game.minPlayers,
      game.minPlayers,
      game.maxPlayers
    );
    setPlayersCount(nextCount);
    setPlayersState(buildPlayers(initialValues?.players, nextCount));
    setPlayedOn(initialValues?.playedOn ?? getTodayDate());
    setVariantId(initialValues?.variantId ?? '');
    setNotes(initialValues?.notes ?? '');
  }, [initialValues, game.id, game.minPlayers, game.maxPlayers]);

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const playersWithTotals = useMemo(
    () =>
      playersState.map((player) => {
        const trainsPoints = computeTrainsPoints(player.trainsCounts);
        const totalPoints = trainsPoints + player.ticketsPoints + player.bonusPoints;
        return { ...player, trainsPoints, totalPoints };
      }),
    [playersState]
  );

  const handlePlayersCountChange = (value: number) => {
    const nextCount = clamp(value, game.minPlayers, game.maxPlayers);
    setPlayersCount(nextCount);
    setPlayersState((prev) => buildPlayers(prev, nextCount));
  };

  const updatePlayer = (index: number, patch: Partial<MultiplayerTicketToRidePlayer>) => {
    setPlayersState((prev) =>
      prev.map((player, idx) => (idx === index ? { ...player, ...patch } : player))
    );
  };

  const updateTrainsCount = (index: number, key: string, value: number) => {
    setPlayersState((prev) =>
      prev.map((player, idx) =>
        idx === index
          ? {
              ...player,
              trainsCounts: {
                ...player.trainsCounts,
                [key]: value,
              },
            }
          : player
      )
    );
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const summary: ApiErrorDetail[] = [];

    if (!playedOn) {
      nextErrors.playedOn = 'Pole wymagane';
    }
    if (!variantId) {
      nextErrors.variantId = 'Wybierz wariant';
    }
    if (notes.length > 2000) {
      nextErrors.notes = 'Maksymalnie 2000 znaków';
    }
    if (playersState.length < game.minPlayers || playersState.length > game.maxPlayers) {
      nextErrors.playersCount = `Liczba graczy musi być w zakresie ${game.minPlayers}-${game.maxPlayers}.`;
      summary.push({ message: 'Liczba graczy poza dozwolonym zakresem.' });
    }

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    playersState.forEach((player) => {
      if (player.playerId) {
        if (seen.has(player.playerId)) {
          duplicates.add(player.playerId);
        } else {
          seen.add(player.playerId);
        }
      }
    });

    playersState.forEach((player, index) => {
      const playerIdKey = `players[${index}].playerId`;
      const ticketsKey = `players[${index}].ticketsPoints`;
      const bonusKey = `players[${index}].bonusPoints`;

      if (!player.playerId) {
        nextErrors[playerIdKey] = 'Wybierz gracza';
      } else if (duplicates.has(player.playerId)) {
        nextErrors[playerIdKey] = 'Gracz musi być unikalny';
      }

      if (!Number.isInteger(player.ticketsPoints)) {
        nextErrors[ticketsKey] = 'Podaj liczbę całkowitą';
      }

      if (!Number.isInteger(player.bonusPoints) || player.bonusPoints < 0) {
        nextErrors[bonusKey] = 'Musi być >= 0';
      }

      TRAIN_POINTS.forEach((row) => {
        const value = player.trainsCounts[row.length];
        if (!Number.isInteger(value) || value < 0) {
          nextErrors[`players[${index}].trainsCounts.${row.length}`] = 'Musi być >= 0';
        }
      });
    });

    if (duplicates.size > 0) {
      summary.push({ message: 'Gracze muszą być unikalni.' });
    }

    return { nextErrors, summary };
  };

  const podiumPreview = useMemo(() => {
    if (!podiumVisible) {
      return null;
    }
    const eligible = playersWithTotals.filter((player) => player.playerId);
    if (eligible.length === 0) {
      return null;
    }
    const sorted = [...eligible].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.trainsPoints !== a.trainsPoints) {
        return b.trainsPoints - a.trainsPoints;
      }
      if (b.bonusPoints !== a.bonusPoints) {
        return b.bonusPoints - a.bonusPoints;
      }
      if (b.ticketsPoints !== a.ticketsPoints) {
        return b.ticketsPoints - a.ticketsPoints;
      }
      return a.playerId.localeCompare(b.playerId);
    });

    return sorted.slice(0, 3).map((player, index) => {
      const name = playersById.get(player.playerId)?.name ?? '—';
      return `${index + 1}: ${name}`;
    });
  }, [podiumVisible, playersWithTotals, playersById]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorSummary([]);

    const { nextErrors, summary } = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (summary.length > 0) {
        setErrorSummary(summary);
      }
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await onSubmit({
        playedOn,
        variantId,
        notes,
        players: playersState.map((player) => ({
          ...player,
          trainsCounts: normalizeCounts(player.trainsCounts),
        })),
      });
      onSuccess?.();
    } catch (error) {
      const parsed = parseApiError(error);
      if (parsed.details.length > 0) {
        setErrorSummary(parsed.details);
      } else {
        setErrorSummary([{ message: parsed.message }]);
      }
      setErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {errorSummary.length > 0 ? (
        <Alert title="Nie udało się zapisać meczu." variant="error">
          <ul>
            {errorSummary.map((item, index) => (
              <li key={`${item.field ?? 'general'}-${index}`}>{item.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="form-grid">
        <FormField label="Data" htmlFor={`${idPrefix}-playedOn`} error={errors.playedOn}>
          <Input
            id={`${idPrefix}-playedOn`}
            type="date"
            value={playedOn}
            onChange={(event) => setPlayedOn(event.target.value)}
            hasError={Boolean(errors.playedOn)}
          />
        </FormField>
        <FormField label="Wariant" htmlFor={`${idPrefix}-variant`} error={errors.variantId}>
          <Select
            id={`${idPrefix}-variant`}
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
            hasError={Boolean(errors.variantId)}
          >
            <option value="">Wybierz wariant</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Liczba graczy"
          htmlFor={`${idPrefix}-playersCount`}
          error={errors.playersCount}
        >
          <Select
            id={`${idPrefix}-playersCount`}
            value={playersCount}
            onChange={(event) => handlePlayersCountChange(Number(event.target.value))}
            hasError={Boolean(errors.playersCount)}
          >
            {Array.from({ length: game.maxPlayers - game.minPlayers + 1 }, (_, index) => {
              const value = game.minPlayers + index;
              return (
                <option key={value} value={value}>
                  {value}
                </option>
              );
            })}
          </Select>
        </FormField>
      </div>

      <div className="ticket-to-ride-actions ticket-to-ride-actions-top">
        <Button type="button" variant="secondary" onClick={() => setPodiumVisible((prev) => !prev)}>
          Wynik gry
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Zapisywanie...' : submitLabel}
        </Button>
      </div>

      {podiumVisible && podiumPreview ? (
        <Alert variant="info" title="Podium">
          {podiumPreview.join(', ')}
        </Alert>
      ) : null}

      <div className="ticket-to-ride-players">
        {playersWithTotals.map((player, index) => (
          <div key={`player-${index}`} className="card ticket-to-ride-player-card">
            <div className="ticket-to-ride-player-header">
              <div className="ticket-to-ride-player-header-main">
                <FormField
                  label={`Gracz ${index + 1}`}
                  htmlFor={`${idPrefix}-player-${index}`}
                  error={errors[`players[${index}].playerId`]}
                >
                  <Select
                    id={`${idPrefix}-player-${index}`}
                    value={player.playerId}
                    onChange={(event) => updatePlayer(index, { playerId: event.target.value })}
                    hasError={Boolean(errors[`players[${index}].playerId`])}
                  >
                    <option value="">Wybierz gracza</option>
                    {players.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="ticket-to-ride-player-controls">
                <div className="ticket-to-ride-total">Pociągi: <strong>{player.trainsPoints}</strong></div>
                <div className="ticket-to-ride-total">Razem: <strong>{player.totalPoints}</strong></div>
              </div>
            </div>

            <div className="ticket-to-ride-points-grid">
              <div className="ticket-to-ride-trains">
                <table className="ticket-to-ride-trains-table">
                  <thead>
                    <tr>
                      <th>Długość</th>
                      <th>Ilość</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TRAIN_POINTS.map((row) => (
                      <tr key={row.length}>
                        <td>{row.length}</td>
                        <td>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={player.trainsCounts[row.length]}
                              onChange={(event) => {
                              updateTrainsCount(index, row.length, parseNumber(event.target.value));
                              }}
                              hasError={Boolean(errors[`players[${index}].trainsCounts.${row.length}`])}
                            />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ticket-to-ride-summary">
                <FormField label="Punkty za bilety" error={errors[`players[${index}].ticketsPoints`]}>
                  <Input
                    type="number"
                    step={1}
                    value={player.ticketsPoints}
                    onChange={(event) => {
                      updatePlayer(index, { ticketsPoints: parseNumber(event.target.value) });
                    }}
                    hasError={Boolean(errors[`players[${index}].ticketsPoints`])}
                  />
                </FormField>
                <FormField label="Punkty dodatkowe" error={errors[`players[${index}].bonusPoints`]}>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.bonusPoints}
                    onChange={(event) => {
                      updatePlayer(index, { bonusPoints: parseNumber(event.target.value) });
                    }}
                    hasError={Boolean(errors[`players[${index}].bonusPoints`])}
                  />
                </FormField>
                <div className="ticket-to-ride-total">
                  Wynik gracza: <strong>{player.totalPoints}</strong>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <FormField label="Notatki" htmlFor={`${idPrefix}-notes`} error={errors.notes}>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          placeholder="Opcjonalnie"
          hasError={Boolean(errors.notes)}
        />
      </FormField>

      <div className="ticket-to-ride-actions ticket-to-ride-actions-bottom">
        <Button
          type="button"
          variant="secondary"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑ Na górę
        </Button>
      </div>
    </form>
  );
}
