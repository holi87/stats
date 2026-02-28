import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { ApiError, ApiErrorDetail } from '../api/ApiProvider';
import type { MultiplayerGame, Player } from '../api/hooks';
import type { MultiplayerCustomCalculatorField } from '../contracts/api';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { featureFlags } from '../utils/featureFlags';
import { isBaseGameOption } from '../utils/multiplayerOptions';

export type MultiplayerCustomCalculatorPlayer = {
  playerId: string;
  calculatorValues: Record<string, number>;
};

export type MultiplayerCustomCalculatorMatchFormValues = {
  playedOn: string;
  notes: string;
  optionIds?: string[];
  optionId?: string;
  players: MultiplayerCustomCalculatorPlayer[];
};

type MultiplayerCustomCalculatorMatchFormProps = {
  game: MultiplayerGame;
  players: Player[];
  calculatorFields: MultiplayerCustomCalculatorField[];
  gameOptions?: Array<{ id: string; code?: string; displayName: string }>;
  initialValues?: Partial<MultiplayerCustomCalculatorMatchFormValues>;
  onSubmit: (values: MultiplayerCustomCalculatorMatchFormValues) => Promise<void>;
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

function parseInteger(value: string) {
  if (value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : Math.trunc(parsed);
}

function buildPlayerDraft(
  source: MultiplayerCustomCalculatorPlayer | undefined,
  fields: MultiplayerCustomCalculatorField[]
) {
  const calculatorValues: Record<string, number> = {};
  fields.forEach((field) => {
    const rawValue = source?.calculatorValues?.[field.id];
    calculatorValues[field.id] =
      typeof rawValue === 'number' && Number.isInteger(rawValue) ? rawValue : 0;
  });
  return {
    playerId: source?.playerId ?? '',
    calculatorValues,
  };
}

function buildPlayers(
  initial: MultiplayerCustomCalculatorPlayer[] | undefined,
  count: number,
  fields: MultiplayerCustomCalculatorField[]
) {
  const safe = Array.isArray(initial) ? initial : [];
  const trimmed = safe.slice(0, count).map((player) => buildPlayerDraft(player, fields));
  while (trimmed.length < count) {
    trimmed.push(buildPlayerDraft(undefined, fields));
  }
  return trimmed;
}

function normalizeOptionIds(initialValues?: Partial<MultiplayerCustomCalculatorMatchFormValues>) {
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

export function MultiplayerCustomCalculatorMatchForm({
  game,
  players,
  calculatorFields,
  gameOptions = [],
  initialValues,
  onSubmit,
  onSuccess,
  submitLabel = 'Zapisz mecz',
}: MultiplayerCustomCalculatorMatchFormProps) {
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
  const [playersState, setPlayersState] = useState<MultiplayerCustomCalculatorPlayer[]>(() =>
    buildPlayers(initialValues?.players, initialCount, calculatorFields)
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
    setPlayersState(buildPlayers(initialValues?.players, nextCount, calculatorFields));
    setPlayedOn(initialValues?.playedOn ?? getTodayDate());
    setNotes(initialValues?.notes ?? '');
    setSelectedOptionIds(normalizeOptionIds(initialValues));
  }, [initialValues, game.id, game.minPlayers, game.maxPlayers, calculatorFields]);

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

  const playersWithTotals = useMemo(
    () =>
      playersState.map((player) => {
        const valueEntries = calculatorFields.map((field) => {
          const value = player.calculatorValues[field.id] ?? 0;
          const points = value * field.pointsPerUnit;
          return {
            fieldId: field.id,
            label: field.label,
            value,
            points,
            pointsPerUnit: field.pointsPerUnit,
          };
        });
        const totalPoints = valueEntries.reduce((sum, entry) => sum + entry.points, 0);
        return {
          ...player,
          valueEntries,
          totalPoints,
        };
      }),
    [playersState, calculatorFields]
  );

  const handlePlayersCountChange = (value: number) => {
    const nextCount = clamp(value, game.minPlayers, game.maxPlayers);
    setPlayersCount(nextCount);
    setPlayersState((prev) => buildPlayers(prev, nextCount, calculatorFields));
  };

  const updatePlayer = (index: number, patch: Partial<MultiplayerCustomCalculatorPlayer>) => {
    setPlayersState((prev) =>
      prev.map((player, idx) => (idx === index ? { ...player, ...patch } : player))
    );
  };

  const updatePlayerFieldValue = (index: number, fieldId: string, value: number) => {
    setPlayersState((prev) =>
      prev.map((player, idx) => {
        if (idx !== index) {
          return player;
        }
        return {
          ...player,
          calculatorValues: {
            ...player.calculatorValues,
            [fieldId]: value,
          },
        };
      })
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
      if (!player.playerId) {
        nextErrors[playerIdKey] = 'Wybierz gracza';
      } else if (duplicates.has(player.playerId)) {
        nextErrors[playerIdKey] = 'Gracz musi być unikalny';
      }

      calculatorFields.forEach((field) => {
        const key = `players[${index}].calculatorValues.${field.id}`;
        const value = player.calculatorValues[field.id];
        if (!Number.isInteger(value)) {
          nextErrors[key] = 'Podaj liczbę całkowitą';
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
    return toCompetitionPodiumLines(eligible, playersById);
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

      <div className="custom-calculator-players">
        {playersWithTotals.map((player, index) => (
          <div key={`player-${index}`} className="card custom-calculator-player-card">
            <div className="custom-calculator-player-header">
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
              <div className="custom-calculator-total">
                Razem: <strong>{player.totalPoints}</strong>
              </div>
            </div>

            <div className="custom-calculator-grid">
              {calculatorFields.map((field) => {
                const fieldKey = `players[${index}].calculatorValues.${field.id}`;
                return (
                  <div key={`${player.playerId || index}-${field.id}`} className="custom-calculator-field">
                    <FormField
                      label={`${field.label} (${field.pointsPerUnit > 0 ? '+' : ''}${field.pointsPerUnit} pkt)`}
                      htmlFor={`${idPrefix}-player-${index}-field-${field.id}`}
                      error={errors[fieldKey]}
                    >
                      <Input
                        id={`${idPrefix}-player-${index}-field-${field.id}`}
                        type="number"
                        step={1}
                        value={player.calculatorValues[field.id] ?? 0}
                        onChange={(event) =>
                          updatePlayerFieldValue(
                            index,
                            field.id,
                            parseInteger(event.target.value)
                          )
                        }
                        hasError={Boolean(errors[fieldKey])}
                      />
                    </FormField>
                    {field.description ? (
                      <p className="custom-calculator-field-description">{field.description}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="custom-calculator-summary">
              {player.valueEntries.map((entry) => (
                <div key={`${index}-${entry.fieldId}`} className="custom-calculator-summary-line">
                  {entry.label}: {entry.value} × {entry.pointsPerUnit} = <strong>{entry.points}</strong>
                </div>
              ))}
              <div className="custom-calculator-total">
                Razem: <strong>{player.totalPoints}</strong>
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
