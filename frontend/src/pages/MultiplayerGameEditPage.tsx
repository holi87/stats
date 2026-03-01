import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { ApiError } from '../api/ApiProvider';
import {
  useCreateMultiplayerGameOption,
  useMultiplayerGame,
  useMultiplayerGameOptions,
  useUpdateMultiplayerGame,
  useUpdateMultiplayerGameOption,
} from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';

type EditDraft = {
  displayName: string;
  calculatorButtonLabel: string;
  calculatorUrl: string;
  minPlayers: string;
  maxPlayers: string;
  isActive: boolean;
  showInQuickMenu: boolean;
  optionsExclusive: boolean;
};

function createEmptyDraft(): EditDraft {
  return {
    displayName: '',
    calculatorButtonLabel: '',
    calculatorUrl: '',
    minPlayers: '',
    maxPlayers: '',
    isActive: true,
    showInQuickMenu: true,
    optionsExclusive: true,
  };
}

function getErrorMessage(error: unknown) {
  const apiError = error as ApiError;
  if (Array.isArray(apiError?.details) && apiError.details.length > 0) {
    return apiError.details.map((detail) => detail.message).join(', ');
  }
  return apiError?.message || 'Wystąpił błąd.';
}

export function MultiplayerGameEditPage() {
  const { code } = useParams();
  const { notify } = useToast();

  const {
    data: game,
    isLoading: gameLoading,
    isError: gameError,
    refetch: refetchGame,
  } = useMultiplayerGame(code, { includeInactive: true });
  const {
    data: options = [],
    isLoading: optionsLoading,
    isError: optionsError,
    refetch: refetchOptions,
  } = useMultiplayerGameOptions(code, { includeInactive: true });

  const updateGame = useUpdateMultiplayerGame();
  const updateOption = useUpdateMultiplayerGameOption();
  const createOption = useCreateMultiplayerGameOption();

  const [draft, setDraft] = useState<EditDraft>(createEmptyDraft);
  const [optionNames, setOptionNames] = useState<Record<string, string>>({});
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionCode, setNewOptionCode] = useState('');

  useEffect(() => {
    if (!game) {
      return;
    }
    setDraft({
      displayName: game.displayName,
      calculatorButtonLabel: game.calculatorButtonLabel ?? '',
      calculatorUrl: game.calculatorUrl ?? '',
      minPlayers: String(game.minPlayers),
      maxPlayers: String(game.maxPlayers),
      isActive: game.isActive,
      showInQuickMenu: game.showInQuickMenu,
      optionsExclusive: game.optionsExclusive,
    });
  }, [game]);

  useEffect(() => {
    const next: Record<string, string> = {};
    options.forEach((option) => {
      next[option.id] = option.displayName;
    });
    setOptionNames(next);
  }, [options]);

  const hasOptionChanges = useMemo(
    () =>
      options.some(
        (option) =>
          (optionNames[option.id] ?? option.displayName).trim() !== option.displayName
      ),
    [options, optionNames]
  );

  if (!code) {
    return <Navigate to="/admin/games" replace />;
  }

  if (gameLoading || optionsLoading) {
    return (
      <section>
        <PageHeader title="Edycja gry" description="Ładowanie danych gry..." />
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie...</p>
        </div>
      </section>
    );
  }

  if (gameError || optionsError) {
    return (
      <section>
        <PageHeader title="Edycja gry" description="Nie udało się pobrać danych." />
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać gry lub dodatków."
            onRetry={() => {
              refetchGame();
              refetchOptions();
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
        description="Wybrana gra nie istnieje."
        action={
          <Link className="button secondary" to="/admin/games">
            Wróć do listy gier
          </Link>
        }
      />
    );
  }

  const isBusy = updateGame.isPending || updateOption.isPending || createOption.isPending;

  const saveGame = async () => {
    const displayName = draft.displayName.trim();
    const minPlayers = Number(draft.minPlayers);
    const maxPlayers = Number(draft.maxPlayers);

    if (!displayName) {
      notify('Nazwa gry nie może być pusta.', 'error');
      return;
    }
    if (!Number.isInteger(minPlayers) || minPlayers < 1) {
      notify('Minimalna liczba graczy musi być liczbą całkowitą >= 1.', 'error');
      return;
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1) {
      notify('Maksymalna liczba graczy musi być liczbą całkowitą >= 1.', 'error');
      return;
    }
    if (minPlayers > maxPlayers) {
      notify('Minimalna liczba graczy nie może być większa od maksymalnej.', 'error');
      return;
    }
    const calculatorButtonLabel = draft.calculatorButtonLabel.trim();
    const calculatorUrl = draft.calculatorUrl.trim();
    if (calculatorButtonLabel.length > 40) {
      notify('Nazwa przycisku kalkulatora może mieć maksymalnie 40 znaków.', 'error');
      return;
    }
    if (calculatorUrl.length > 400) {
      notify('Adres kalkulatora może mieć maksymalnie 400 znaków.', 'error');
      return;
    }
    if (calculatorUrl.includes(' ')) {
      notify('Adres kalkulatora nie może zawierać spacji.', 'error');
      return;
    }

    const payload: {
      code: string;
      displayName?: string;
      calculatorButtonLabel?: string | null;
      calculatorUrl?: string | null;
      minPlayers?: number;
      maxPlayers?: number;
      isActive?: boolean;
      showInQuickMenu?: boolean;
      optionsExclusive?: boolean;
    } = { code: game.code };

    let hasChanges = false;
    if (displayName !== game.displayName) {
      payload.displayName = displayName;
      hasChanges = true;
    }
    if (calculatorButtonLabel !== (game.calculatorButtonLabel ?? '')) {
      payload.calculatorButtonLabel = calculatorButtonLabel || null;
      hasChanges = true;
    }
    if (calculatorUrl !== (game.calculatorUrl ?? '')) {
      payload.calculatorUrl = calculatorUrl || null;
      hasChanges = true;
    }
    if (minPlayers !== game.minPlayers) {
      payload.minPlayers = minPlayers;
      hasChanges = true;
    }
    if (maxPlayers !== game.maxPlayers) {
      payload.maxPlayers = maxPlayers;
      hasChanges = true;
    }
    if (draft.isActive !== game.isActive) {
      payload.isActive = draft.isActive;
      hasChanges = true;
    }
    if (draft.showInQuickMenu !== game.showInQuickMenu) {
      payload.showInQuickMenu = draft.showInQuickMenu;
      hasChanges = true;
    }
    if (draft.optionsExclusive !== game.optionsExclusive) {
      payload.optionsExclusive = draft.optionsExclusive;
      hasChanges = true;
    }

    if (!hasChanges) {
      notify('Brak zmian do zapisania.', 'info');
      return;
    }

    try {
      await updateGame.mutateAsync(payload);
      notify('Zmiany gry zostały zapisane.', 'success');
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

  const saveOption = async (optionId: string) => {
    const option = options.find((item) => item.id === optionId);
    if (!option) {
      return;
    }

    const nextDisplayName = (optionNames[optionId] ?? option.displayName).trim();
    if (!nextDisplayName) {
      notify('Nazwa dodatku nie może być pusta.', 'error');
      return;
    }
    if (nextDisplayName.length > 80) {
      notify('Nazwa dodatku może mieć maksymalnie 80 znaków.', 'error');
      return;
    }
    if (nextDisplayName === option.displayName) {
      notify('Brak zmian w nazwie dodatku.', 'info');
      return;
    }

    try {
      await updateOption.mutateAsync({
        code: game.code,
        optionId,
        displayName: nextDisplayName,
      });
      notify(`Zapisano nazwę dodatku: ${nextDisplayName}.`, 'success');
      setOptionNames((prev) => ({ ...prev, [optionId]: nextDisplayName }));
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

  const saveAllOptions = async () => {
    const changed = options.filter((option) => {
      const nextDisplayName = (optionNames[option.id] ?? option.displayName).trim();
      return nextDisplayName !== option.displayName;
    });

    if (changed.length === 0) {
      notify('Brak zmian w dodatkach.', 'info');
      return;
    }

    for (const option of changed) {
      const nextDisplayName = (optionNames[option.id] ?? option.displayName).trim();
      if (!nextDisplayName) {
        notify('Nazwa dodatku nie może być pusta.', 'error');
        return;
      }
      if (nextDisplayName.length > 80) {
        notify('Każda nazwa dodatku może mieć maksymalnie 80 znaków.', 'error');
        return;
      }
    }

    try {
      for (const option of changed) {
        const nextDisplayName = (optionNames[option.id] ?? option.displayName).trim();
        // Sequential update keeps requests predictable and easy to stop on first error.
        // eslint-disable-next-line no-await-in-loop
        await updateOption.mutateAsync({
          code: game.code,
          optionId: option.id,
          displayName: nextDisplayName,
        });
      }
      notify(`Zapisano ${changed.length} zmian dodatków.`, 'success');
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

  const saveNewOption = async () => {
    const displayName = newOptionName.trim();
    const optionCode = newOptionCode.trim();

    if (!displayName) {
      notify('Nazwa dodatku nie może być pusta.', 'error');
      return;
    }
    if (displayName.length > 80) {
      notify('Nazwa dodatku może mieć maksymalnie 80 znaków.', 'error');
      return;
    }
    if (optionCode.length > 0 && optionCode.length > 64) {
      notify('Kod dodatku może mieć maksymalnie 64 znaki.', 'error');
      return;
    }

    try {
      const created = await createOption.mutateAsync({
        code: game.code,
        displayName,
        optionCode: optionCode || undefined,
      });
      notify(`Dodano dodatek: ${created.displayName}.`, 'success');
      setNewOptionName('');
      setNewOptionCode('');
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  };

  return (
    <section>
      <PageHeader
        title={`Edycja gry • ${game.displayName}`}
        description="Edytuj ustawienia gry i nazwy dodatków bezpośrednio z panelu administracyjnego."
      />

      <div className="card admin-toolbar-card">
        <div className="players-toolbar">
          <Link className="button secondary" to="/admin/games">
            Wróć do listy gier
          </Link>
          <Link className="button ghost" to={`/games/${game.code}/matches`}>
            Przejdź do meczów gry
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="form">
          <div className="form-grid">
            <label className="form-field">
              <span>Nazwa gry</span>
              <Input
                value={draft.displayName}
                maxLength={80}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, displayName: event.target.value }))
                }
              />
            </label>
            <label className="form-field">
              <span>Kod gry</span>
              <Input value={game.code} disabled />
            </label>
            <label className="form-field">
              <span>Nazwa przycisku kalkulatora</span>
              <Input
                value={draft.calculatorButtonLabel}
                maxLength={40}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, calculatorButtonLabel: event.target.value }))
                }
                placeholder="Domyślnie: Kalkulator"
              />
            </label>
            <label className="form-field">
              <span>Adres kalkulatora</span>
              <Input
                value={draft.calculatorUrl}
                maxLength={400}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, calculatorUrl: event.target.value }))
                }
                placeholder="Np. costam albo https://twoja-domena.pl/kalkulator"
              />
            </label>
            <label className="form-field">
              <span>Min. gracze</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={draft.minPlayers}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, minPlayers: event.target.value }))
                }
              />
            </label>
            <label className="form-field">
              <span>Maks. gracze</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={draft.maxPlayers}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, maxPlayers: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="visibility-options">
            <p className="visibility-options-title">Ustawienia gry</p>
            <label className="visibility-option checkbox-control" htmlFor="game-active">
              <input
                id="game-active"
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, isActive: event.target.checked }))
                }
              />
              Gra aktywna
            </label>
            <label className="visibility-option checkbox-control" htmlFor="game-quick-menu">
              <input
                id="game-quick-menu"
                type="checkbox"
                checked={draft.showInQuickMenu}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, showInQuickMenu: event.target.checked }))
                }
              />
              Widoczna w szybkim menu
            </label>
            <label className="visibility-option" htmlFor="game-options-exclusive">
              <input
                id="game-options-exclusive"
                type="checkbox"
                checked={draft.optionsExclusive}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, optionsExclusive: event.target.checked }))
                }
              />
              Dodatki wykluczające się
            </label>
          </div>

          <div className="form-actions">
            <Button type="button" variant="primary" disabled={isBusy} onClick={() => void saveGame()}>
              {updateGame.isPending ? 'Zapisywanie...' : 'Zapisz ustawienia gry'}
            </Button>
          </div>
        </div>
      </div>

      <div className="card table-card">
        <div className="form-grid" style={{ marginBottom: '14px' }}>
          <label className="form-field">
            <span>Nowy dodatek</span>
            <Input
              value={newOptionName}
              maxLength={80}
              onChange={(event) => setNewOptionName(event.target.value)}
              placeholder="Np. Polska, Europa 1912, Big Box"
            />
          </label>
          <label className="form-field">
            <span>Kod dodatku (opcjonalnie)</span>
            <Input
              value={newOptionCode}
              maxLength={64}
              onChange={(event) => setNewOptionCode(event.target.value)}
              placeholder="Np. poland_1912"
            />
          </label>
          <div className="form-field" style={{ alignSelf: 'end' }}>
            <Button type="button" variant="primary" disabled={isBusy} onClick={() => void saveNewOption()}>
              {createOption.isPending ? 'Dodawanie...' : 'Dodaj dodatek'}
            </Button>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Nazwa dodatku</th>
              <th>Kod</th>
              <th>Status</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {options.length === 0 ? (
              <tr>
                <td colSpan={4}>Ta gra nie ma dodatków do edycji.</td>
              </tr>
            ) : (
              options.map((option) => {
                const value = optionNames[option.id] ?? option.displayName;
                const isChanged = value.trim() !== option.displayName;
                return (
                  <tr key={option.id}>
                    <td>
                      <Input
                        value={value}
                        maxLength={80}
                        onChange={(event) =>
                          setOptionNames((prev) => ({
                            ...prev,
                            [option.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>{option.code}</td>
                    <td>{option.isActive ? 'aktywny' : 'nieaktywny'}</td>
                    <td>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isBusy || !isChanged}
                        onClick={() => void saveOption(option.id)}
                      >
                        Zapisz nazwę
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions">
        <Button
          type="button"
          variant="primary"
          disabled={isBusy || !hasOptionChanges}
          onClick={() => void saveAllOptions()}
        >
          {updateOption.isPending ? 'Zapisywanie...' : 'Zapisz wszystkie zmiany dodatków'}
        </Button>
      </div>
    </section>
  );
}
