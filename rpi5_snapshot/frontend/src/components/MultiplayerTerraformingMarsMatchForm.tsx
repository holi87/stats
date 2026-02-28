import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { ApiError, ApiErrorDetail } from '../api/ApiProvider';
import type { MultiplayerGame, Player } from '../api/hooks';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';

export type MultiplayerTerraformingMarsPlayer = {
  playerId: string;
  titlesCount: number;
  awardsFirstCount: number;
  awardsSecondCount: number;
  citiesPoints: number;
  forestsPoints: number;
  cardsPoints: number;
  trPoints: number;
};

export type MultiplayerTerraformingMarsMatchFormValues = {
  playedOn: string;
  notes: string;
  optionId?: string;
  players: MultiplayerTerraformingMarsPlayer[];
};

type MultiplayerTerraformingMarsMatchFormProps = {
  game: MultiplayerGame;
  players: Player[];
  gameOptions?: Array<{ id: string; displayName: string }>;
  initialValues?: Partial<MultiplayerTerraformingMarsMatchFormValues>;
  onSubmit: (values: MultiplayerTerraformingMarsMatchFormValues) => Promise<void>;
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

function buildPlayers(initial: MultiplayerTerraformingMarsPlayer[] | undefined, count: number) {
  const safe = Array.isArray(initial) ? initial : [];
  const trimmed = safe.slice(0, count).map((player) => ({
    playerId: player.playerId ?? '',
    titlesCount: player.titlesCount ?? 0,
    awardsFirstCount: player.awardsFirstCount ?? 0,
    awardsSecondCount: player.awardsSecondCount ?? 0,
    citiesPoints: player.citiesPoints ?? 0,
    forestsPoints: player.forestsPoints ?? 0,
    cardsPoints: player.cardsPoints ?? 0,
    trPoints: player.trPoints ?? 0,
  }));
  while (trimmed.length < count) {
    trimmed.push({
      playerId: '',
      titlesCount: 0,
      awardsFirstCount: 0,
      awardsSecondCount: 0,
      citiesPoints: 0,
      forestsPoints: 0,
      cardsPoints: 0,
      trPoints: 0,
    });
  }
  return trimmed;
}

function parseNumber(value: string) {
  if (value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function MultiplayerTerraformingMarsMatchForm({
  game,
  players,
  gameOptions = [],
  initialValues,
  onSubmit,
  onSuccess,
  submitLabel = 'Zapisz mecz',
}: MultiplayerTerraformingMarsMatchFormProps) {
  const idPrefix = useId();
  const initialCount = clamp(
    initialValues?.players?.length ?? game.minPlayers,
    game.minPlayers,
    game.maxPlayers
  );

  const [playedOn, setPlayedOn] = useState(initialValues?.playedOn ?? getTodayDate());
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [optionId, setOptionId] = useState(initialValues?.optionId ?? '');
  const [playersCount, setPlayersCount] = useState(initialCount);
  const [playersState, setPlayersState] = useState<MultiplayerTerraformingMarsPlayer[]>(() =>
    buildPlayers(initialValues?.players, initialCount)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorSummary, setErrorSummary] = useState<ApiErrorDetail[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const nextCount = clamp(
      initialValues?.players?.length ?? game.minPlayers,
      game.minPlayers,
      game.maxPlayers
    );
    setPlayersCount(nextCount);
    setPlayersState(buildPlayers(initialValues?.players, nextCount));
    setPlayedOn(initialValues?.playedOn ?? getTodayDate());
    setNotes(initialValues?.notes ?? '');
    setOptionId(initialValues?.optionId ?? '');
  }, [initialValues, game.id, game.minPlayers, game.maxPlayers]);

  useEffect(() => {
    if (game.requiresOption && gameOptions.length > 0 && !optionId) {
      setOptionId(gameOptions[0].id);
    }
  }, [game.requiresOption, gameOptions, optionId]);

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const playersWithTotals = useMemo(
    () =>
      playersState.map((player) => {
        const titlesPoints = player.titlesCount * 5;
        const awardsFirstPoints = player.awardsFirstCount * 5;
        const awardsSecondPoints = player.awardsSecondCount * 2;
        const totalPoints =
          titlesPoints +
          awardsFirstPoints +
          awardsSecondPoints +
          player.citiesPoints +
          player.forestsPoints +
          player.cardsPoints +
          player.trPoints;
        return {
          ...player,
          titlesPoints,
          awardsFirstPoints,
          awardsSecondPoints,
          totalPoints,
        };
      }),
    [playersState]
  );

  const handlePlayersCountChange = (value: number) => {
    const nextCount = clamp(value, game.minPlayers, game.maxPlayers);
    setPlayersCount(nextCount);
    setPlayersState((prev) => buildPlayers(prev, nextCount));
  };

  const updatePlayer = (index: number, patch: Partial<MultiplayerTerraformingMarsPlayer>) => {
    setPlayersState((prev) =>
      prev.map((player, idx) => (idx === index ? { ...player, ...patch } : player))
    );
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const summary: ApiErrorDetail[] = [];

    if (!playedOn) {
      nextErrors.playedOn = 'Pole wymagane';
    }

    if (notes.length > 2000) {
      nextErrors.notes = 'Maksymalnie 2000 znaków';
    }

    if (game.requiresOption && gameOptions.length > 0 && !optionId) {
      nextErrors.optionId = 'Wybierz opcję gry';
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

    const numericFields = [
      'titlesCount',
      'awardsFirstCount',
      'awardsSecondCount',
      'citiesPoints',
      'forestsPoints',
      'cardsPoints',
      'trPoints',
    ] as const;

    playersState.forEach((player, index) => {
      const playerIdKey = `players[${index}].playerId`;
      if (!player.playerId) {
        nextErrors[playerIdKey] = 'Wybierz gracza';
      } else if (duplicates.has(player.playerId)) {
        nextErrors[playerIdKey] = 'Gracz musi być unikalny';
      }

      numericFields.forEach((field) => {
        const key = `players[${index}].${field}`;
        const value = player[field];
        if (!Number.isInteger(value) || value < 0) {
          nextErrors[key] = 'Musi być >= 0';
        }
      });
    });

    if (duplicates.size > 0) {
      summary.push({ message: 'Gracze muszą być unikalni.' });
    }

    return { nextErrors, summary };
  };

  const podiumPreview = useMemo(() => {
    const eligible = playersWithTotals.filter((player) => player.playerId);
    if (eligible.length === 0) {
      return null;
    }
    const sorted = [...eligible].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.trPoints !== a.trPoints) {
        return b.trPoints - a.trPoints;
      }
      if (b.citiesPoints !== a.citiesPoints) {
        return b.citiesPoints - a.citiesPoints;
      }
      if (b.forestsPoints !== a.forestsPoints) {
        return b.forestsPoints - a.forestsPoints;
      }
      if (b.cardsPoints !== a.cardsPoints) {
        return b.cardsPoints - a.cardsPoints;
      }
      return a.playerId.localeCompare(b.playerId);
    });

    return sorted.slice(0, 3).map((player, index) => {
      const name = playersById.get(player.playerId)?.name ?? '—';
      return `${index + 1}: ${name}`;
    });
  }, [playersWithTotals, playersById]);

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
        notes,
        optionId: optionId || undefined,
        players: playersState,
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
        {game.requiresOption && gameOptions.length > 0 ? (
          <FormField label="Opcja gry" htmlFor={`${idPrefix}-optionId`} error={errors.optionId}>
            <Select
              id={`${idPrefix}-optionId`}
              value={optionId}
              onChange={(event) => setOptionId(event.target.value)}
              hasError={Boolean(errors.optionId)}
            >
              <option value="">Wybierz opcję</option>
              {gameOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </div>

      <div className="terraforming-mars-players">
        {playersWithTotals.map((player, index) => (
          <div key={`player-${index}`} className="card terraforming-mars-player-card">
            <div className="terraforming-mars-player-header">
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
              <div className="terraforming-mars-total">
                Razem: <strong>{player.totalPoints}</strong>
              </div>
            </div>

            <div className="terraforming-mars-grid">
              <div className="terraforming-mars-inputs">
                <FormField
                  label="Tytuły"
                  error={errors[`players[${index}].titlesCount`]}
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.titlesCount}
                    onChange={(event) =>
                      updatePlayer(index, { titlesCount: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[`players[${index}].titlesCount`])}
                  />
                </FormField>
                <FormField
                  label="Nagrody 1. miejsce"
                  error={errors[`players[${index}].awardsFirstCount`]}
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.awardsFirstCount}
                    onChange={(event) =>
                      updatePlayer(index, { awardsFirstCount: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[`players[${index}].awardsFirstCount`])}
                  />
                </FormField>
                <FormField
                  label="Nagrody 2. miejsce"
                  error={errors[`players[${index}].awardsSecondCount`]}
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.awardsSecondCount}
                    onChange={(event) =>
                      updatePlayer(index, { awardsSecondCount: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[`players[${index}].awardsSecondCount`])}
                  />
                </FormField>
                <FormField
                  label="Miasta"
                  error={errors[`players[${index}].citiesPoints`]}
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.citiesPoints}
                    onChange={(event) =>
                      updatePlayer(index, { citiesPoints: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[`players[${index}].citiesPoints`])}
                  />
                </FormField>
                <FormField
                  label="Lasy"
                  error={errors[`players[${index}].forestsPoints`]}
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.forestsPoints}
                    onChange={(event) =>
                      updatePlayer(index, { forestsPoints: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[`players[${index}].forestsPoints`])}
                  />
                </FormField>
                <FormField
                  label="Karty"
                  error={errors[`players[${index}].cardsPoints`]}
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.cardsPoints}
                    onChange={(event) =>
                      updatePlayer(index, { cardsPoints: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[`players[${index}].cardsPoints`])}
                  />
                </FormField>
                <FormField
                  label="WT/TR"
                  error={errors[`players[${index}].trPoints`]}
                >
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={player.trPoints}
                    onChange={(event) =>
                      updatePlayer(index, { trPoints: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[`players[${index}].trPoints`])}
                  />
                </FormField>
              </div>

              <div className="terraforming-mars-summary">
                <div className="terraforming-mars-line">
                  Tytuły (x5): <strong>{player.titlesPoints}</strong>
                </div>
                <div className="terraforming-mars-line">
                  Nagrody 1. miejsce (x5): <strong>{player.awardsFirstPoints}</strong>
                </div>
                <div className="terraforming-mars-line">
                  Nagrody 2. miejsce (x2): <strong>{player.awardsSecondPoints}</strong>
                </div>
                <div className="terraforming-mars-line">
                  Miasta: <strong>{player.citiesPoints}</strong>
                </div>
                <div className="terraforming-mars-line">
                  Lasy: <strong>{player.forestsPoints}</strong>
                </div>
                <div className="terraforming-mars-line">
                  Karty: <strong>{player.cardsPoints}</strong>
                </div>
                <div className="terraforming-mars-line">
                  WT/TR: <strong>{player.trPoints}</strong>
                </div>
                <div className="terraforming-mars-total">
                  Razem: <strong>{player.totalPoints}</strong>
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

      <div className="podium-preview">
        <strong>Podgląd podium</strong>
        {podiumPreview && podiumPreview.length > 0 ? (
          <p>{podiumPreview.join(', ')}</p>
        ) : (
          <p className="muted">Uzupełnij uczestników, aby zobaczyć podgląd podium.</p>
        )}
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Zapisywanie...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
