import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { ApiError, ApiErrorDetail } from '../api/ApiProvider';
import type { MultiplayerGame, Player } from '../api/hooks';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { featureFlags } from '../utils/featureFlags';
import { isBaseGameOption } from '../utils/multiplayerOptions';

export type MultiplayerManualPlayer = {
  playerId: string;
  totalPoints: number;
};

export type MultiplayerManualMatchFormValues = {
  playedOn: string;
  notes: string;
  optionIds?: string[];
  optionId?: string;
  players: MultiplayerManualPlayer[];
};

type MultiplayerManualMatchFormProps = {
  game: MultiplayerGame;
  players: Player[];
  gameOptions?: Array<{ id: string; code?: string; displayName: string }>;
  initialValues?: Partial<MultiplayerManualMatchFormValues>;
  onSubmit: (values: MultiplayerManualMatchFormValues) => Promise<void>;
  onSuccess?: () => void;
  submitLabel?: string;
};

function getTodayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
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

function buildPlayers(initial: MultiplayerManualPlayer[] | undefined, count: number) {
  const safe = Array.isArray(initial) ? initial : [];
  const trimmed = safe.slice(0, count);
  while (trimmed.length < count) {
    trimmed.push({ playerId: '', totalPoints: 0 });
  }
  return trimmed;
}

function normalizeOptionIds(initialValues?: Partial<MultiplayerManualMatchFormValues>) {
  const fromArray = Array.isArray(initialValues?.optionIds) ? initialValues.optionIds : [];
  const fromSingle = initialValues?.optionId ? [initialValues.optionId] : [];
  const merged = [...fromArray, ...fromSingle].filter(Boolean);
  return [...new Set(merged)];
}

function toCompetitionPodiumLines(
  players: Array<{ playerId: string; totalPoints: number }>,
  playersById: Map<string, { name: string }>
) {
  if (players.length === 0) {
    return null;
  }

  const sorted = [...players].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.playerId.localeCompare(b.playerId);
  });

  let previousPoints: number | null = null;
  let currentPlace = 0;
  const podium: string[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const player = sorted[index];
    if (previousPoints === null || player.totalPoints !== previousPoints) {
      currentPlace = index + 1;
      previousPoints = player.totalPoints;
    }

    if (currentPlace > 3) {
      continue;
    }

    const name = playersById.get(player.playerId)?.name ?? '—';
    podium.push(`${currentPlace}: ${name}`);
  }

  return podium.length > 0 ? podium : null;
}

export function MultiplayerManualMatchForm({
  game,
  players,
  gameOptions = [],
  initialValues,
  onSubmit,
  onSuccess,
  submitLabel = 'Zapisz mecz',
}: MultiplayerManualMatchFormProps) {
  const idPrefix = useId();
  const initialCount = clamp(
    initialValues?.players?.length ?? game.minPlayers,
    game.minPlayers,
    game.maxPlayers
  );

  const [playedOn, setPlayedOn] = useState(initialValues?.playedOn ?? getTodayDate());
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(() =>
    normalizeOptionIds(initialValues)
  );
  const [playersCount, setPlayersCount] = useState(initialCount);
  const [playersState, setPlayersState] = useState<MultiplayerManualPlayer[]>(() =>
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
    setSelectedOptionIds(normalizeOptionIds(initialValues));
  }, [initialValues, game.id, game.minPlayers, game.maxPlayers]);

  const supportsMultiOptions = featureFlags.multiOptionsMode && game.optionsExclusive === false;
  const selectableGameOptions = useMemo(
    () => gameOptions.filter((option) => !isBaseGameOption(option)),
    [gameOptions]
  );
  const selectableOptionIdSet = useMemo(
    () => new Set(selectableGameOptions.map((option) => option.id)),
    [selectableGameOptions]
  );
  const requiresSelectableOption = game.requiresOption && selectableGameOptions.length > 0;
  const selectedOptionId = selectedOptionIds[0] ?? '';

  useEffect(() => {
    setSelectedOptionIds((prev) => {
      const filtered = prev.filter((id) => selectableOptionIdSet.has(id));
      if (filtered.length === prev.length) {
        return prev;
      }
      return filtered;
    });
  }, [selectableOptionIdSet]);

  useEffect(() => {
    if (!selectableGameOptions.length) {
      if (selectedOptionIds.length > 0) {
        setSelectedOptionIds([]);
      }
      return;
    }

    if (supportsMultiOptions) {
      if (requiresSelectableOption && selectedOptionIds.length === 0) {
        setSelectedOptionIds([selectableGameOptions[0].id]);
      }
      return;
    }

    if (selectedOptionIds.length === 0) {
      if (requiresSelectableOption) {
        setSelectedOptionIds([selectableGameOptions[0].id]);
      }
      return;
    }

    if (selectedOptionIds.length > 1) {
      setSelectedOptionIds([selectedOptionIds[0]]);
    }
  }, [requiresSelectableOption, selectableGameOptions, selectedOptionIds, supportsMultiOptions]);

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const handlePlayersCountChange = (value: number) => {
    const nextCount = clamp(value, game.minPlayers, game.maxPlayers);
    setPlayersCount(nextCount);
    setPlayersState((prev) => buildPlayers(prev, nextCount));
  };

  const updatePlayer = (index: number, patch: Partial<MultiplayerManualPlayer>) => {
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

    if (requiresSelectableOption && selectedOptionIds.length === 0) {
      nextErrors.optionIds = 'Wybierz co najmniej jedną opcję gry';
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
      const totalPointsKey = `players[${index}].totalPoints`;

      if (!player.playerId) {
        nextErrors[playerIdKey] = 'Wybierz gracza';
      } else if (duplicates.has(player.playerId)) {
        nextErrors[playerIdKey] = 'Gracz musi być unikalny';
      }

      if (!Number.isInteger(player.totalPoints)) {
        nextErrors[totalPointsKey] = 'Podaj liczbę całkowitą';
      }
    });

    if (duplicates.size > 0) {
      summary.push({ message: 'Gracze muszą być unikalni.' });
    }

    return { nextErrors, summary };
  };

  const podiumPreview = useMemo(() => {
    const eligible = playersState.filter((player) => player.playerId);
    return toCompetitionPodiumLines(eligible, playersById);
  }, [playersState, playersById]);

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
        optionIds: selectedOptionIds.length > 0 ? selectedOptionIds : undefined,
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
        <FormField label="Liczba graczy" htmlFor={`${idPrefix}-playersCount`} error={errors.playersCount}>
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
        {selectableGameOptions.length > 0 ? (
          <FormField
            label={supportsMultiOptions ? 'Dodatki (wiele)' : 'Opcja gry'}
            htmlFor={`${idPrefix}-optionId`}
            error={errors.optionIds}
          >
            {supportsMultiOptions ? (
              <div className="checkbox-list">
                {selectableGameOptions.map((option) => {
                  const checked = selectedOptionIds.includes(option.id);
                  return (
                    <label key={option.id} className="checkbox-control">
                      <input
                        type="checkbox"
                        className="table-checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedOptionIds((prev) => [...new Set([...prev, option.id])]);
                            return;
                          }
                          setSelectedOptionIds((prev) => prev.filter((value) => value !== option.id));
                        }}
                      />
                      <span>{option.displayName}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Select
                id={`${idPrefix}-optionId`}
                value={selectedOptionId}
                onChange={(event) => setSelectedOptionIds(event.target.value ? [event.target.value] : [])}
                hasError={Boolean(errors.optionIds)}
              >
                <option value="">{requiresSelectableOption ? 'Wybierz opcję' : 'Brak opcji'}</option>
                {selectableGameOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.displayName}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : null}
      </div>

      <div className="form-section">
        <h3>Uczestnicy</h3>
        <div className="multiplayer-players">
          {playersState.map((player, index) => {
            const playerIdKey = `players[${index}].playerId`;
            const totalPointsKey = `players[${index}].totalPoints`;
            return (
              <div key={`player-${index}`} className="multiplayer-player-row">
                <FormField
                  label={`Gracz ${index + 1}`}
                  htmlFor={`${idPrefix}-player-${index}`}
                  error={errors[playerIdKey]}
                >
                  <Select
                    id={`${idPrefix}-player-${index}`}
                    value={player.playerId}
                    onChange={(event) => updatePlayer(index, { playerId: event.target.value })}
                    hasError={Boolean(errors[playerIdKey])}
                  >
                    <option value="">Wybierz gracza</option>
                    {players.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label="Punkty"
                  htmlFor={`${idPrefix}-points-${index}`}
                  error={errors[totalPointsKey]}
                >
                  <Input
                    id={`${idPrefix}-points-${index}`}
                    type="number"
                    step="1"
                    value={player.totalPoints}
                    onChange={(event) =>
                      updatePlayer(index, { totalPoints: parseNumber(event.target.value) })
                    }
                    hasError={Boolean(errors[totalPointsKey])}
                  />
                </FormField>
              </div>
            );
          })}
        </div>
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
