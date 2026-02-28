import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { ApiError, ApiErrorDetail } from '../api/ApiProvider';
import type { Game, Player } from '../api/hooks';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';
import { Alert } from './ui/Alert';

export type MatchFormValues = {
  playedOn: string;
  gameId: string;
  playerAId: string;
  scoreA: number;
  playerBId: string;
  scoreB: number;
  notes: string;
};

type MatchFormProps = {
  games: Game[];
  players: Player[];
  initialValues?: Partial<MatchFormValues>;
  onSubmit: (values: MatchFormValues) => Promise<void>;
  onSuccess?: () => void;
  submitLabel?: string;
};

function getTodayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function normalizeValues(values?: Partial<MatchFormValues>): MatchFormValues {
  return {
    playedOn: values?.playedOn ?? getTodayDate(),
    gameId: values?.gameId ?? '',
    playerAId: values?.playerAId ?? '',
    scoreA: values?.scoreA ?? 0,
    playerBId: values?.playerBId ?? '',
    scoreB: values?.scoreB ?? 0,
    notes: values?.notes ?? '',
  };
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

function validate(values: MatchFormValues) {
  const errors: Record<string, string> = {};

  if (!values.playedOn) {
    errors.playedOn = 'Pole wymagane';
  }
  if (!values.gameId) {
    errors.gameId = 'Pole wymagane';
  }
  if (!values.playerAId) {
    errors.playerAId = 'Pole wymagane';
  }
  if (!values.playerBId) {
    errors.playerBId = 'Pole wymagane';
  }
  if (values.playerAId && values.playerBId && values.playerAId === values.playerBId) {
    errors.playerBId = 'Gracze muszą być różni';
  }
  if (Number.isNaN(values.scoreA) || values.scoreA < 0) {
    errors.scoreA = 'Wynik musi być >= 0';
  }
  if (Number.isNaN(values.scoreB) || values.scoreB < 0) {
    errors.scoreB = 'Wynik musi być >= 0';
  }
  if (values.notes.length > 2000) {
    errors.notes = 'Maksymalnie 2000 znaków';
  }

  return errors;
}

export function MatchForm({
  games,
  players,
  initialValues,
  onSubmit,
  onSuccess,
  submitLabel = 'Zapisz',
}: MatchFormProps) {
  const [values, setValues] = useState<MatchFormValues>(() => normalizeValues(initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorSummary, setErrorSummary] = useState<ApiErrorDetail[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const idPrefix = useId();

  useEffect(() => {
    if (initialValues) {
      setValues(normalizeValues(initialValues));
    }
  }, [initialValues]);

  const playersOptions = useMemo(() => players, [players]);

  const handleChange = (patch: Partial<MatchFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorSummary([]);

    const nextErrors = validate(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await onSubmit(values);
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
            value={values.playedOn}
            onChange={(event) => handleChange({ playedOn: event.target.value })}
            hasError={Boolean(errors.playedOn)}
          />
        </FormField>
        <FormField label="Gra" htmlFor={`${idPrefix}-gameId`} error={errors.gameId}>
          <Select
            id={`${idPrefix}-gameId`}
            value={values.gameId}
            onChange={(event) => handleChange({ gameId: event.target.value })}
            hasError={Boolean(errors.gameId)}
          >
            <option value="">Wybierz grę</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Gracz A" htmlFor={`${idPrefix}-playerA`} error={errors.playerAId}>
          <Select
            id={`${idPrefix}-playerA`}
            value={values.playerAId}
            onChange={(event) => handleChange({ playerAId: event.target.value })}
            hasError={Boolean(errors.playerAId)}
          >
            <option value="">Wybierz gracza</option>
            {playersOptions.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Wynik A" htmlFor={`${idPrefix}-scoreA`} error={errors.scoreA}>
          <Input
            id={`${idPrefix}-scoreA`}
            type="number"
            min={0}
            value={values.scoreA}
            onChange={(event) => {
              const value = event.target.value;
              handleChange({ scoreA: value === '' ? 0 : Number(value) });
            }}
            hasError={Boolean(errors.scoreA)}
          />
        </FormField>
        <FormField label="Gracz B" htmlFor={`${idPrefix}-playerB`} error={errors.playerBId}>
          <Select
            id={`${idPrefix}-playerB`}
            value={values.playerBId}
            onChange={(event) => handleChange({ playerBId: event.target.value })}
            hasError={Boolean(errors.playerBId)}
          >
            <option value="">Wybierz gracza</option>
            {playersOptions.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Wynik B" htmlFor={`${idPrefix}-scoreB`} error={errors.scoreB}>
          <Input
            id={`${idPrefix}-scoreB`}
            type="number"
            min={0}
            value={values.scoreB}
            onChange={(event) => {
              const value = event.target.value;
              handleChange({ scoreB: value === '' ? 0 : Number(value) });
            }}
            hasError={Boolean(errors.scoreB)}
          />
        </FormField>
      </div>

      <FormField
        label="Notatki"
        htmlFor={`${idPrefix}-notes`}
        error={errors.notes}
        className="full"
      >
        <Textarea
          id={`${idPrefix}-notes`}
          value={values.notes}
          rows={4}
          onChange={(event) => handleChange({ notes: event.target.value })}
          hasError={Boolean(errors.notes)}
        />
      </FormField>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Zapisywanie...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
