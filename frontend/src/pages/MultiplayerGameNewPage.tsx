import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError } from '../api/ApiProvider';
import { useCreateMultiplayerGame } from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useToast } from '../components/ui/ToastProvider';

const CUSTOM_FIELDS_MIN = 1;
const CUSTOM_FIELDS_MAX = 12;

type GameScoringType = 'MANUAL_POINTS' | 'CUSTOM_CALCULATOR';

type CustomFieldDraft = {
  label: string;
  code: string;
  description: string;
  pointsPerUnit: number;
};

function slugifyCode(input: string) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createEmptyField(index: number): CustomFieldDraft {
  return {
    label: '',
    code: '',
    description: '',
    pointsPerUnit: index === 0 ? 5 : 1,
  };
}

function buildFields(count: number, source: CustomFieldDraft[]) {
  const safeCount = clamp(count, CUSTOM_FIELDS_MIN, CUSTOM_FIELDS_MAX);
  const next = source.slice(0, safeCount);
  while (next.length < safeCount) {
    next.push(createEmptyField(next.length));
  }
  return next;
}

export function MultiplayerGameNewPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const createGame = useCreateMultiplayerGame();

  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [calculatorButtonLabel, setCalculatorButtonLabel] = useState('');
  const [calculatorUrl, setCalculatorUrl] = useState('');
  const [minPlayers, setMinPlayers] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [showInQuickMenu, setShowInQuickMenu] = useState(true);
  const [optionsExclusive, setOptionsExclusive] = useState(true);
  const [scoringType, setScoringType] = useState<GameScoringType>('MANUAL_POINTS');
  const [customFieldsCount, setCustomFieldsCount] = useState(3);
  const [customFields, setCustomFields] = useState<CustomFieldDraft[]>(() =>
    buildFields(3, [])
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');

  const customFieldsPreview = useMemo(() => {
    if (scoringType !== 'CUSTOM_CALCULATOR') {
      return null;
    }
    return customFields.map((field, index) => {
      const label = field.label.trim() || `Pole ${index + 1}`;
      const points = Number.isInteger(field.pointsPerUnit) ? field.pointsPerUnit : 0;
      return `${label}: wartość × ${points}`;
    });
  }, [scoringType, customFields]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    let normalizedCustomFields: Array<{
      code: string;
      label: string;
      description?: string;
      pointsPerUnit: number;
    }> = [];

    if (!displayName.trim()) {
      nextErrors.displayName = 'Pole wymagane';
    }

    if (!Number.isInteger(minPlayers) || minPlayers < 1) {
      nextErrors.minPlayers = 'Podaj liczbę całkowitą >= 1';
    }

    if (!Number.isInteger(maxPlayers) || maxPlayers < 1) {
      nextErrors.maxPlayers = 'Podaj liczbę całkowitą >= 1';
    }

    if (minPlayers > maxPlayers) {
      nextErrors.minPlayers = 'Musi być <= maksymalnej liczby graczy';
    }

    const normalizedCalculatorUrl = calculatorUrl.trim();
    const normalizedCalculatorButtonLabel = calculatorButtonLabel.trim();
    if (normalizedCalculatorButtonLabel.length > 40) {
      nextErrors.calculatorButtonLabel = 'Maksymalnie 40 znaków';
    }
    if (normalizedCalculatorUrl.length > 400) {
      nextErrors.calculatorUrl = 'Maksymalnie 400 znaków';
    }
    if (normalizedCalculatorUrl.includes(' ')) {
      nextErrors.calculatorUrl = 'Adres nie może zawierać spacji';
    }

    if (scoringType === 'CUSTOM_CALCULATOR') {
      const normalizedCount = clamp(customFieldsCount, CUSTOM_FIELDS_MIN, CUSTOM_FIELDS_MAX);
      const fieldsToValidate = buildFields(normalizedCount, customFields);
      const usedCodes = new Set<string>();

      if (normalizedCount !== customFieldsCount) {
        nextErrors.customFieldsCount = `Liczba pól musi być w zakresie ${CUSTOM_FIELDS_MIN}-${CUSTOM_FIELDS_MAX}`;
      }

      normalizedCustomFields = fieldsToValidate.map((field, index) => {
        const label = field.label.trim();
        if (!label) {
          nextErrors[`customCalculator.fields[${index}].label`] = 'Podaj nazwę pola';
        } else if (label.length > 80) {
          nextErrors[`customCalculator.fields[${index}].label`] = 'Maksymalnie 80 znaków';
        }

        const pointsPerUnit = Number(field.pointsPerUnit);
        if (!Number.isInteger(pointsPerUnit)) {
          nextErrors[`customCalculator.fields[${index}].pointsPerUnit`] = 'Podaj liczbę całkowitą';
        } else if (pointsPerUnit < -1000 || pointsPerUnit > 1000) {
          nextErrors[`customCalculator.fields[${index}].pointsPerUnit`] = 'Zakres: -1000 do 1000';
        } else if (pointsPerUnit === 0) {
          nextErrors[`customCalculator.fields[${index}].pointsPerUnit`] = 'Nie może być 0';
        }

        const codeRaw = field.code.trim() || label;
        const normalizedCode = slugifyCode(codeRaw);
        if (!/^[a-z0-9_]{2,40}$/.test(normalizedCode)) {
          nextErrors[`customCalculator.fields[${index}].code`] =
            'Kod musi mieć 2-40 znaków (a-z, 0-9, _)';
        } else if (usedCodes.has(normalizedCode)) {
          nextErrors[`customCalculator.fields[${index}].code`] = 'Kod pola musi być unikalny';
        } else {
          usedCodes.add(normalizedCode);
        }

        const description = field.description.trim();
        if (description.length > 240) {
          nextErrors[`customCalculator.fields[${index}].description`] = 'Maksymalnie 240 znaków';
        }

        return {
          code: normalizedCode,
          label,
          description: description || undefined,
          pointsPerUnit,
        };
      });
    }

    return { nextErrors, normalizedCustomFields };
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setGeneralError('');

    const { nextErrors, normalizedCustomFields } = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      const created = await createGame.mutateAsync({
        displayName: displayName.trim(),
        code: code.trim() || undefined,
        calculatorButtonLabel: calculatorButtonLabel.trim() || undefined,
        calculatorUrl: calculatorUrl.trim() || undefined,
        scoringType,
        minPlayers,
        maxPlayers,
        showInQuickMenu,
        optionsExclusive,
        customCalculator:
          scoringType === 'CUSTOM_CALCULATOR'
            ? { fields: normalizedCustomFields }
            : undefined,
      });
      notify('Gra została dodana.', 'success');
      navigate(`/games/${created.code}/matches`);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError?.details?.length) {
        const fieldErrors: Record<string, string> = {};
        apiError.details.forEach((detail) => {
          if (detail.field) {
            fieldErrors[detail.field] = detail.message;
          }
        });
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
      }
      setGeneralError(apiError?.message || 'Nie udało się utworzyć gry.');
    }
  };

  return (
    <section>
      <PageHeader
        title="Nowa gra"
        description="Dodaj grę manualną albo z dedykowanym kalkulatorem pól punktowych."
      />
      <div className="card">
        <form className="form" onSubmit={onSubmit}>
          {generalError ? (
            <Alert title="Nie udało się zapisać gry." variant="error">
              {generalError}
            </Alert>
          ) : null}

          <div className="form-grid">
            <FormField label="Nazwa" htmlFor="multiplayer-game-name" error={errors.displayName}>
              <Input
                id="multiplayer-game-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Np. Terraformacja Family"
                hasError={Boolean(errors.displayName)}
              />
            </FormField>
            <FormField label="Kod (opcjonalnie)" htmlFor="multiplayer-game-code" error={errors.code}>
              <Input
                id="multiplayer-game-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Np. terraformacja_family"
                hasError={Boolean(errors.code)}
              />
            </FormField>
            <FormField label="Typ punktacji" htmlFor="multiplayer-game-scoring-type" error={errors.scoringType}>
              <Select
                id="multiplayer-game-scoring-type"
                value={scoringType}
                onChange={(event) => setScoringType(event.target.value as GameScoringType)}
                hasError={Boolean(errors.scoringType)}
              >
                <option value="MANUAL_POINTS">Manualna (jedno pole punktów)</option>
                <option value="CUSTOM_CALCULATOR">Specjalny kalkulator (wiele pól)</option>
              </Select>
            </FormField>
            <FormField label="Min. graczy" htmlFor="multiplayer-game-min" error={errors.minPlayers}>
              <Input
                id="multiplayer-game-min"
                type="number"
                min={1}
                step={1}
                value={minPlayers}
                onChange={(event) => setMinPlayers(Math.trunc(Number(event.target.value || 0)))}
                hasError={Boolean(errors.minPlayers)}
              />
            </FormField>
            <FormField label="Maks. graczy" htmlFor="multiplayer-game-max" error={errors.maxPlayers}>
              <Input
                id="multiplayer-game-max"
                type="number"
                min={1}
                step={1}
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(Math.trunc(Number(event.target.value || 0)))}
                hasError={Boolean(errors.maxPlayers)}
              />
            </FormField>
            <FormField label="Tryb dodatków" htmlFor="multiplayer-game-options-mode">
              <Select
                id="multiplayer-game-options-mode"
                value={optionsExclusive ? 'exclusive' : 'multi'}
                onChange={(event) => setOptionsExclusive(event.target.value !== 'multi')}
              >
                <option value="exclusive">Wykluczające się (wybór jednego)</option>
                <option value="multi">Łączone (wiele dodatków)</option>
              </Select>
            </FormField>
            <FormField
              label="Przycisk kalkulatora (opcjonalnie)"
              htmlFor="multiplayer-game-calculator-label"
              error={errors.calculatorButtonLabel}
            >
              <Input
                id="multiplayer-game-calculator-label"
                value={calculatorButtonLabel}
                onChange={(event) => setCalculatorButtonLabel(event.target.value)}
                placeholder="Np. Kalkulator punktów końcowych"
                hasError={Boolean(errors.calculatorButtonLabel)}
              />
            </FormField>
            <FormField
              label="Adres kalkulatora (opcjonalnie)"
              htmlFor="multiplayer-game-calculator-url"
              error={errors.calculatorUrl}
            >
              <Input
                id="multiplayer-game-calculator-url"
                value={calculatorUrl}
                onChange={(event) => setCalculatorUrl(event.target.value)}
                placeholder="Np. costam albo https://twoja-domena.pl/kalkulator"
                hasError={Boolean(errors.calculatorUrl)}
              />
            </FormField>
            <div className="visibility-options">
              <p className="visibility-options-title">Widoczność gry</p>
              <label className="visibility-option checkbox-control" htmlFor="multiplayer-game-quick-menu">
                <input
                  id="multiplayer-game-quick-menu"
                  type="checkbox"
                  className="table-checkbox"
                  checked={showInQuickMenu}
                  onChange={(event) => setShowInQuickMenu(event.target.checked)}
                />
                <span>Pokazuj bezpośrednio w szybkim menu</span>
              </label>
            </div>
          </div>

          {scoringType === 'CUSTOM_CALCULATOR' ? (
            <div className="calculator-builder">
              <div className="calculator-builder-head">
                <h3>Kreator kalkulatora</h3>
                <p className="muted">
                  Zdefiniuj pola punktowe: nazwa, opcjonalny opis i mnożnik punktów.
                </p>
              </div>

              <div className="form-grid">
                <FormField
                  label="Liczba pól punktowanych"
                  htmlFor="custom-fields-count"
                  error={errors.customFieldsCount}
                >
                  <Input
                    id="custom-fields-count"
                    type="number"
                    min={CUSTOM_FIELDS_MIN}
                    max={CUSTOM_FIELDS_MAX}
                    value={customFieldsCount}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      const safeValue = Number.isInteger(parsed) ? parsed : CUSTOM_FIELDS_MIN;
                      const nextCount = clamp(safeValue, CUSTOM_FIELDS_MIN, CUSTOM_FIELDS_MAX);
                      setCustomFieldsCount(nextCount);
                      setCustomFields((prev) => buildFields(nextCount, prev));
                    }}
                    hasError={Boolean(errors.customFieldsCount)}
                  />
                </FormField>
              </div>

              <div className="calculator-fields-list">
                {buildFields(customFieldsCount, customFields).map((field, index) => (
                  <div key={`custom-field-${index}`} className="calculator-field-card">
                    <h4>Pole {index + 1}</h4>
                    <div className="calculator-field-grid">
                      <FormField
                        label="Nazwa pola"
                        htmlFor={`custom-field-label-${index}`}
                        error={errors[`customCalculator.fields[${index}].label`]}
                      >
                        <Input
                          id={`custom-field-label-${index}`}
                          value={field.label}
                          onChange={(event) =>
                            setCustomFields((prev) =>
                              prev.map((item, idx) =>
                                idx === index ? { ...item, label: event.target.value } : item
                              )
                            )
                          }
                          placeholder="Np. Bonus misji"
                          hasError={Boolean(errors[`customCalculator.fields[${index}].label`])}
                        />
                      </FormField>

                      <FormField
                        label="Kod pola (opcjonalnie)"
                        htmlFor={`custom-field-code-${index}`}
                        error={errors[`customCalculator.fields[${index}].code`]}
                      >
                        <Input
                          id={`custom-field-code-${index}`}
                          value={field.code}
                          onChange={(event) =>
                            setCustomFields((prev) =>
                              prev.map((item, idx) =>
                                idx === index ? { ...item, code: event.target.value } : item
                              )
                            )
                          }
                          placeholder="Np. bonus_misji"
                          hasError={Boolean(errors[`customCalculator.fields[${index}].code`])}
                        />
                      </FormField>

                      <FormField
                        label="Punkty za 1 jednostkę"
                        htmlFor={`custom-field-points-${index}`}
                        error={errors[`customCalculator.fields[${index}].pointsPerUnit`]}
                      >
                        <Input
                          id={`custom-field-points-${index}`}
                          type="number"
                          min={-1000}
                          max={1000}
                          step={1}
                          value={field.pointsPerUnit}
                          onChange={(event) =>
                            setCustomFields((prev) =>
                              prev.map((item, idx) => {
                                if (idx !== index) {
                                  return item;
                                }
                                const parsed = Number(event.target.value);
                                return {
                                  ...item,
                                  pointsPerUnit: Number.isNaN(parsed) ? 0 : Math.trunc(parsed),
                                };
                              })
                            )
                          }
                          hasError={Boolean(
                            errors[`customCalculator.fields[${index}].pointsPerUnit`]
                          )}
                        />
                      </FormField>
                    </div>

                    <FormField
                      label="Opis pola (opcjonalnie)"
                      htmlFor={`custom-field-description-${index}`}
                      error={errors[`customCalculator.fields[${index}].description`]}
                    >
                      <Input
                        id={`custom-field-description-${index}`}
                        value={field.description}
                        onChange={(event) =>
                          setCustomFields((prev) =>
                            prev.map((item, idx) =>
                              idx === index ? { ...item, description: event.target.value } : item
                            )
                          )
                        }
                        placeholder="Kiedy naliczać punkty z tego pola"
                        hasError={Boolean(errors[`customCalculator.fields[${index}].description`])}
                      />
                    </FormField>

                    <p className="calculator-field-preview">
                      Podgląd: <strong>{field.label.trim() || `Pole ${index + 1}`}</strong> = wartość ×{' '}
                      <strong>{Number.isInteger(field.pointsPerUnit) ? field.pointsPerUnit : 0}</strong>
                    </p>
                  </div>
                ))}
              </div>

              {customFieldsPreview && customFieldsPreview.length > 0 ? (
                <div className="podium-preview">
                  <strong>Podgląd reguł kalkulatora</strong>
                  <p>{customFieldsPreview.join(', ')}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={createGame.isPending}>
              {createGame.isPending ? 'Zapisywanie...' : 'Dodaj grę'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
