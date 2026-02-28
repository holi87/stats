import { useEffect, useMemo, useState } from 'react';
import type { ApiError } from '../api/ApiProvider';
import { useCreatePlayer, useDeletePlayer, usePlayers, useUpdatePlayer } from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';

function getErrorMessage(error: unknown) {
  const apiError = error as ApiError;
  if (apiError?.code === 'CONFLICT' || apiError?.status === 409) {
    return 'Taki gracz już istnieje.';
  }
  if (Array.isArray(apiError?.details) && apiError.details.length > 0) {
    return apiError.details.map((detail) => detail.message).join(', ');
  }
  return apiError?.message || 'Wystąpił błąd.';
}

function validateName(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Pole wymagane';
  }
  if (trimmed.length > 60) {
    return 'Maksymalnie 60 znaków';
  }
  return null;
}

export function PlayersPage() {
  const { notify } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(handler);
  }, [searchTerm]);

  const active = !showInactive;
  const {
    data: players = [],
    isLoading,
    isError,
    refetch,
  } = usePlayers({
    active,
    q: debouncedSearch || undefined,
  });

  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();

  const sortedPlayers = useMemo(() => players, [players]);

  const handleCreate = async () => {
    setNewError(null);
    const error = validateName(newName);
    if (error) {
      setNewError(error);
      return;
    }

    try {
      await createPlayer.mutateAsync({ name: newName.trim() });
      setNewName('');
    } catch (err) {
      setNewError(getErrorMessage(err));
    }
  };

  const handleEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
    setEditingError(null);
  };

  const handleUpdate = async (id: string) => {
    setEditingError(null);
    const error = validateName(editingName);
    if (error) {
      setEditingError(error);
      return;
    }

    try {
      await updatePlayer.mutateAsync({ id, name: editingName.trim() });
      setEditingId(null);
    } catch (err) {
      setEditingError(getErrorMessage(err));
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await updatePlayer.mutateAsync({ id, isActive: !isActive });
    } catch (err) {
      notify('Nie udało się zaktualizować statusu.', 'error');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const shouldDelete = window.confirm(
      `Usunąć gracza "${name}"? Zostaną skasowane jego mecze i wpisy statystyk.`
    );
    if (!shouldDelete) {
      return;
    }

    try {
      const result = await deletePlayer.mutateAsync(id);
      notify(
        `Usunięto ${name}. Usunięte mecze: ${result.deletedOneVsOneMatches}, usunięte wpisy gracza: ${result.deletedMultiplayerParticipations}.`,
        'success'
      );
    } catch (err) {
      notify(getErrorMessage(err), 'error');
    }
  };

  return (
    <section>
      <PageHeader title="Gracze" description="Zarządzaj graczami i ich aktywnością." />

      <div className="card admin-toolbar-card">
        <div className="players-toolbar">
          <div className="search">
            <FormField label="Szukaj">
              <Input
                type="search"
                value={searchTerm}
                placeholder="Wpisz imię..."
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </FormField>
          </div>
          <label className="toggle checkbox-control">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Pokaż nieaktywnych
          </label>
        </div>

        <div className="player-create">
          {newError ? (
            <div className="player-create-alert">
              <Alert variant="error" title="Nie udało się dodać gracza.">
                {newError}
              </Alert>
            </div>
          ) : null}
          <FormField label="Nowy gracz" error={newError}>
            <Input
              type="text"
              value={newName}
              placeholder="Imię gracza"
              onChange={(event) => setNewName(event.target.value)}
              hasError={Boolean(newError)}
            />
          </FormField>
          <Button type="button" variant="primary" onClick={handleCreate}>
            Dodaj
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="card">
          <ErrorState description="Nie udało się pobrać listy graczy." onRetry={refetch} />
        </div>
      ) : isLoading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie graczy...</p>
        </div>
      ) : sortedPlayers.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Brak graczy"
            description="Dodaj pierwszego gracza, aby rozpocząć."
          />
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Gracz</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player) => (
                <tr key={player.id}>
                  <td>
                    {editingId === player.id ? (
                      <div className="inline-edit">
                        <Input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          hasError={Boolean(editingError)}
                        />
                        {editingError ? (
                          <span className="error-text">{editingError}</span>
                        ) : null}
                      </div>
                    ) : (
                      player.name
                    )}
                  </td>
                  <td>
                    <span className={player.isActive ? 'status active' : 'status inactive'}>
                      {player.isActive ? 'Aktywny' : 'Nieaktywny'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      {editingId === player.id ? (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => handleUpdate(player.id)}
                          >
                            Zapisz
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Anuluj
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleEdit(player.id, player.name)}
                        >
                          Edytuj
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleToggle(player.id, player.isActive)}
                      >
                        {player.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => handleDelete(player.id, player.name)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
