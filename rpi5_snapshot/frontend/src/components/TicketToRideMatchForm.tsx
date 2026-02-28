import { useMemo, useState } from 'react';
import type { ApiError } from '../api/ApiProvider';
import type { Player, TicketToRideVariant } from '../api/hooks';
import type { TrainsCounts } from '../contracts/api';
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
 ] as const;

const getTodayDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

const createEmptyCounts = (): TrainsCounts => ({
  '1': 0,
  '2': 0,
  '3': 0,
  '4': 0,
  '5': 0,
  '6': 0,
  '7': 0,
  '8': 0,
  '9': 0,
});

const normalizeCounts = (counts?: Partial<TrainsCounts>): TrainsCounts => ({
  ...createEmptyCounts(),
  ...(counts ?? {}),
});

export type TicketToRideFormPlayer = {
  playerId: string;
  ticketsPoints: number;
  bonusPoints: number;
  trainsCounts: TrainsCounts;
};

export type TicketToRideMatchFormValues = {
  playedOn: string;
  variantId: string;
  notes: string;
  players: TicketToRideFormPlayer[];
};

type TicketToRideMatchFormProps = {
  variants: TicketToRideVariant[];
  players: Player[];
  initialValues?: Partial<TicketToRideMatchFormValues>;
  onSubmit: (values: TicketToRideMatchFormValues) => Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
};

const createEmptyPlayer = (): TicketToRideFormPlayer => ({
  playerId: '',
  ticketsPoints: 0,
  bonusPoints: 0,
  trainsCounts: createEmptyCounts(),
});

const computeTrainsPoints = (counts: TrainsCounts) =>
  TRAIN_POINTS.reduce((sum, row) => sum + (counts[row.length] ?? 0) * row.points, 0);

const computeTotalPoints = (counts: TrainsCounts, tickets: number, bonus: number) =>
  computeTrainsPoints(counts) + tickets + bonus;

const sortPlayersForPodium = (
  players: Array<TicketToRideFormPlayer & { totalPoints: number; trainsPoints: number }>
) =>
  [...players].sort((a, b) => {
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

export function TicketToRideMatchForm({
  variants,
  players,
  initialValues,
  onSubmit,
  submitLabel = 'Zapisz mecz',
  isSubmitting = false,
}: TicketToRideMatchFormProps) {
  const [playedOn, setPlayedOn] = useState(initialValues?.playedOn ?? getTodayDate());
  const [variantId, setVariantId] = useState(initialValues?.variantId ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [playersState, setPlayersState] = useState<TicketToRideFormPlayer[]>(
    () =>
      initialValues?.players?.length
        ? initialValues.players.map((player) => ({
            ...player,
            trainsCounts: normalizeCounts(player.trainsCounts),
          }))
        : [createEmptyPlayer(), createEmptyPlayer()]
  );
  const [collapsedPlayers, setCollapsedPlayers] = useState<boolean[]>(
    () => (initialValues?.players?.length ? initialValues.players.map(() => false) : [false, false])
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [podiumVisible, setPodiumVisible] = useState(false);

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const playersWithTotals = playersState.map((player) => {
    const trainsPoints = computeTrainsPoints(player.trainsCounts);
    const totalPoints = trainsPoints + player.ticketsPoints + player.bonusPoints;
    return { ...player, trainsPoints, totalPoints };
  });

  const podium = useMemo(() => {
    if (!podiumVisible) {
      return null;
    }
    const eligible = playersWithTotals.filter((player) => player.playerId);
    if (eligible.length < 2) {
      return null;
    }
    const sorted = sortPlayersForPodium(eligible);
    const names = sorted
      .map((player) => playersById.get(player.playerId)?.name)
      .filter(Boolean) as string[];

    const labels = [
      ['Zwycięzca', names[0]],
      ['Drugie miejsce', names[1]],
      ['Trzecie miejsce', names[2]],
    ];

    return labels
      .filter(([, name]) => Boolean(name))
      .map(([label, name]) => `${label}: ${name}`)
      .join(', ');
  }, [podiumVisible, playersWithTotals, playersById]);

  const setPlayerPatch = (index: number, patch: Partial<TicketToRideFormPlayer>) => {
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

  const handleAddPlayer = () => {
    if (playersState.length >= 5) {
      return;
    }
    setPlayersState((prev) => [...prev, createEmptyPlayer()]);
    setCollapsedPlayers((prev) => [...prev, false]);
  };

  const handleRemovePlayer = (index: number) => {
    if (playersState.length <= 2) {
      return;
    }
    setPlayersState((prev) => prev.filter((_, idx) => idx !== index));
    setCollapsedPlayers((prev) => prev.filter((_, idx) => idx !== index));
  };

  const validate = () => {
    const validationErrors: string[] = [];

    if (!playedOn) {
      validationErrors.push('Wybierz datę meczu.');
    }
    if (!variantId) {
      validationErrors.push('Wybierz wariant Pociągów.');
    }
    if (notes.length > 2000) {
      validationErrors.push('Notatki mogą mieć maksymalnie 2000 znaków.');
    }

    if (playersState.length < 2 || playersState.length > 5) {
      validationErrors.push('Liczba graczy musi być między 2 a 5.');
    }

    const seen = new Set();
    playersState.forEach((player, index) => {
      if (!player.playerId) {
        validationErrors.push(`Wybierz gracza #${index + 1}.`);
      } else if (seen.has(player.playerId)) {
        validationErrors.push('Gracze muszą być unikalni.');
      } else {
        seen.add(player.playerId);
      }

      if (!Number.isInteger(player.ticketsPoints)) {
        validationErrors.push(`Punkty za bilety (#${index + 1}) muszą być liczbą całkowitą.`);
      }
      if (!Number.isInteger(player.bonusPoints) || player.bonusPoints < 0) {
        validationErrors.push(`Punkty dodatkowe (#${index + 1}) muszą być >= 0.`);
      }

      TRAIN_POINTS.forEach((row) => {
        const value = player.trainsCounts[row.length];
        if (!Number.isInteger(value) || value < 0) {
          validationErrors.push(`Pociągi ${row.length} (#${index + 1}) muszą być >= 0.`);
        }
      });
    });

    return validationErrors;
  };

  const parseApiError = (error: unknown) => {
    const apiError = error as ApiError;
    if (Array.isArray(apiError?.details) && apiError.details.length > 0) {
      return apiError.details.map((detail) => detail.message);
    }
    return [apiError?.message || 'Nie udało się zapisać meczu.'];
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
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
    } catch (error) {
      setErrors(parseApiError(error));
    }
  };

  return (
    <>
      {errors.length > 0 ? (
        <Alert variant="error" title="Formularz zawiera błędy.">
          <ul>
            {errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="card">
        <div className="form-grid">
          <FormField label="Data">
            <Input type="date" value={playedOn} onChange={(event) => setPlayedOn(event.target.value)} />
          </FormField>
          <FormField label="Wariant">
            <Select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
              <option value="">Wybierz wariant</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </div>

      <div className="ticket-to-ride-actions ticket-to-ride-actions-top">
        <Button type="button" variant="secondary" onClick={() => setPodiumVisible((prev) => !prev)}>
          Wynik gry
        </Button>
        <Button type="button" variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </div>

      {podiumVisible && podium ? (
        <Alert variant="info" title="Podium">
          {podium}
        </Alert>
      ) : null}

      <div className="ticket-to-ride-players">
        {playersWithTotals.map((player, index) => {
          const selectedName = playersById.get(player.playerId)?.name;
          const isCollapsed = collapsedPlayers[index];
          const label = selectedName ?? `Gracz ${index + 1}`;
          return (
          <div key={`player-${index}`} className="card ticket-to-ride-player-card">
            <div className="ticket-to-ride-player-header">
              <div className="ticket-to-ride-player-header-main">
                <FormField label={label}>
                  <Select
                    value={player.playerId}
                    onChange={(event) => setPlayerPatch(index, { playerId: event.target.value })}
                  >
                    <option value="">Wybierz gracza</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="ticket-to-ride-player-controls">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setCollapsedPlayers((prev) =>
                      prev.map((value, idx) => (idx === index ? !value : value))
                    )
                  }
                >
                  {isCollapsed ? 'Rozwiń' : 'Zwiń'}
                </Button>
                {playersState.length > 2 ? (
                  <Button type="button" variant="secondary" onClick={() => handleRemovePlayer(index)}>
                    Usuń
                  </Button>
                ) : null}
              </div>
            </div>

            {!isCollapsed ? (
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
                                const value = event.target.value === '' ? 0 : Number(event.target.value);
                                updateTrainsCount(index, row.length, Number.isNaN(value) ? 0 : value);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="ticket-to-ride-total">
                    Punkty za pociągi: <strong>{player.trainsPoints}</strong>
                  </div>
                </div>

                <div className="ticket-to-ride-summary">
                  <FormField label="Punkty za bilety">
                    <Input
                      type="number"
                      step={1}
                      value={player.ticketsPoints}
                      onChange={(event) => {
                        const value = event.target.value === '' ? 0 : Number(event.target.value);
                        setPlayerPatch(index, { ticketsPoints: Number.isNaN(value) ? 0 : value });
                      }}
                    />
                  </FormField>
                  <FormField label="Punkty dodatkowe">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={player.bonusPoints}
                      onChange={(event) => {
                        const value = event.target.value === '' ? 0 : Number(event.target.value);
                        setPlayerPatch(index, { bonusPoints: Number.isNaN(value) ? 0 : value });
                      }}
                    />
                  </FormField>
                  <div className="ticket-to-ride-total">
                    Wynik gracza: <strong>{player.totalPoints}</strong>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          );
        })}
        <Button type="button" variant="ghost" onClick={handleAddPlayer} disabled={playersState.length >= 5}>
          Dodaj gracza
        </Button>
      </div>

      <div className="card">
        <FormField label="Notatki">
          <Textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </FormField>
      </div>

      <div className="ticket-to-ride-actions ticket-to-ride-actions-bottom">
        <Button
          type="button"
          variant="secondary"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Wróć na górę"
        >
          ↑ Na górę
        </Button>
      </div>
    </>
  );
}
