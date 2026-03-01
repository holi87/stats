import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import type { ApiError } from '../api/ApiProvider';
import {
  useCreateMultiplayerGameOption,
  useCreateMultiplayerMatch,
  useCreatePlayer,
  useDeleteMultiplayerMatch,
  useMultiplayerGame,
  useMultiplayerGameOptions,
  useMultiplayerMatches,
  usePlayers,
} from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { MatchNoteHint } from '../components/MatchNoteHint';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/ToastProvider';
import { isBaseGameOption } from '../utils/multiplayerOptions';

function resolveCalculatorHref(rawUrl: string | null | undefined) {
  if (!rawUrl) {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (normalized.startsWith('//')) {
    return null;
  }

  return normalized;
}

function getTodayDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function slugifyOptionCode(input: string) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

type ImportedPlayer = {
  name: string;
  totalPoints: number;
  rank: number | null;
};

type ImportedTtrPayload = {
  editionCode: string;
  editionName: string;
  players: ImportedPlayer[];
};

function parseImportedTtrPayload(raw: unknown): ImportedTtrPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('JSON musi być obiektem.');
  }

  const payload = raw as Record<string, unknown>;
  const editionRaw =
    payload.edition && typeof payload.edition === 'object' && !Array.isArray(payload.edition)
      ? (payload.edition as Record<string, unknown>)
      : null;

  const editionId = typeof editionRaw?.id === 'string' ? editionRaw.id.trim() : '';
  const editionName = typeof editionRaw?.name === 'string' ? editionRaw.name.trim() : '';
  const editionCode = slugifyOptionCode(editionId || editionName);
  if (!editionCode) {
    throw new Error('Brak poprawnego edition.id / edition.name w JSON.');
  }

  const playersRaw = Array.isArray(payload.players) ? payload.players : [];
  const mappedFromPlayers = playersRaw
    .map((item) => {
      const row = item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
      const name = typeof row?.name === 'string' ? row.name.trim() : '';
      const total = typeof row?.total === 'number' ? row.total : null;
      const rank = typeof row?.rank === 'number' && Number.isInteger(row.rank) ? row.rank : null;
      if (!name || total === null || !Number.isInteger(total)) {
        return null;
      }
      return { name, totalPoints: total, rank };
    })
    .filter(Boolean) as ImportedPlayer[];

  const scoresRaw = Array.isArray(payload.scores) ? payload.scores : [];
  const mappedFromScores = scoresRaw
    .map((item) => {
      const row = item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
      const name = typeof row?.playerName === 'string' ? row.playerName.trim() : '';
      const total = typeof row?.totalScore === 'number' ? row.totalScore : null;
      const rank = typeof row?.rank === 'number' && Number.isInteger(row.rank) ? row.rank : null;
      if (!name || total === null || !Number.isInteger(total)) {
        return null;
      }
      return { name, totalPoints: total, rank };
    })
    .filter(Boolean) as ImportedPlayer[];

  const players = (mappedFromPlayers.length > 0 ? mappedFromPlayers : mappedFromScores).sort((a, b) => {
    if (a.rank !== null && b.rank !== null) {
      return a.rank - b.rank;
    }
    if (a.rank !== null) {
      return -1;
    }
    if (b.rank !== null) {
      return 1;
    }
    return a.name.localeCompare(b.name, 'pl');
  });

  if (players.length === 0) {
    throw new Error('JSON nie zawiera listy graczy z punktami końcowymi.');
  }

  return {
    editionCode,
    editionName: editionName || editionId || editionCode,
    players,
  };
}

export function MultiplayerMatchesPage() {
  const { gameCode } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importPlayedOn, setImportPlayedOn] = useState(getTodayDate());
  const [importJsonText, setImportJsonText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileKey, setImportFileKey] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const { notify } = useToast();

  const filters = {
    playerId: searchParams.get('playerId') || undefined,
    optionId: searchParams.get('optionId') || undefined,
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
  };

  const offsetRaw = searchParams.get('offset');
  const offset = offsetRaw ? Math.max(0, Number(offsetRaw) || 0) : 0;
  const limit = 50;

  const {
    data: game,
    isLoading: gameLoading,
    isError: gameError,
    error: gameErrorPayload,
    refetch: refetchGame,
  } = useMultiplayerGame(gameCode);

  const {
    data: players = [],
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers,
  } = usePlayers({ active: true });
  const {
    data: gameOptions = [],
    isLoading: optionsLoading,
    isError: optionsError,
    refetch: refetchOptions,
  } = useMultiplayerGameOptions(gameCode);
  const selectableGameOptions = useMemo(
    () => gameOptions.filter((option) => !isBaseGameOption(option)),
    [gameOptions]
  );

  const {
    data: matchesData,
    isLoading: matchesLoading,
    isError: matchesError,
    refetch: refetchMatches,
  } = useMultiplayerMatches(
    {
      gameId: game?.id,
      ...filters,
      limit,
      offset,
    },
    { enabled: Boolean(game?.id) }
  );

  const deleteMatch = useDeleteMultiplayerMatch();
  const createMatch = useCreateMultiplayerMatch();
  const createOption = useCreateMultiplayerGameOption();
  const createPlayer = useCreatePlayer();

  if (!gameCode) {
    return <Navigate to="/games/overview" replace />;
  }

  if (gameLoading) {
    return (
      <div className="card center-content">
        <Spinner />
        <p>Ładowanie gry...</p>
      </div>
    );
  }

  if (gameError) {
    const error = gameErrorPayload as ApiError | null;
    if (error?.code === 'NOT_FOUND') {
      return (
        <EmptyState
          title="Nie znaleziono gry"
          description="Wybrana gra wieloosobowa nie istnieje lub jest nieaktywna."
          action={
            <Link className="button secondary" to="/games/overview">
              Wróć do przeglądu
            </Link>
          }
        />
      );
    }
    return <ErrorState onRetry={refetchGame} />;
  }

  if (!game) {
    return (
      <EmptyState
        title="Nie znaleziono gry"
        description="Wybrana gra wieloosobowa nie istnieje lub jest nieaktywna."
        action={
          <Link className="button secondary" to="/games/overview">
            Wróć do przeglądu
          </Link>
        }
      />
    );
  }

  const matches = matchesData?.items ?? [];
  const total = matchesData?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  const searchSuffix = location.search || (searchParams.toString() ? `?${searchParams.toString()}` : '');

  const updateSearchParams = (next: Partial<typeof filters> & { offset?: number }) => {
    const params = new URLSearchParams(searchParams);

    const setParam = (key: string, value?: string) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };

    if (next.playerId !== undefined) {
      setParam('playerId', next.playerId);
    }
    if (next.optionId !== undefined) {
      setParam('optionId', next.optionId);
    }
    if (next.dateFrom !== undefined) {
      setParam('dateFrom', next.dateFrom);
    }
    if (next.dateTo !== undefined) {
      setParam('dateTo', next.dateTo);
    }
    if (next.offset !== undefined) {
      if (next.offset <= 0) {
        params.delete('offset');
      } else {
        params.set('offset', String(next.offset));
      }
    }

    setSearchParams(params, { replace: true });
  };

  const handleClear = () => {
    setSearchParams({}, { replace: true });
  };

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) {
      return;
    }
    try {
      await deleteMatch.mutateAsync(pendingDeleteId);
      notify('Mecz został usunięty.', 'success');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const resolveImportedPlayerId = async (
    playerName: string,
    availablePlayers: Array<{ id: string; name: string }>
  ) => {
    const findByName = (name: string) =>
      availablePlayers.find((player) => player.name.trim().toLowerCase() === name.trim().toLowerCase());

    const exact = findByName(playerName);
    if (exact) {
      return exact.id;
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const mapExisting = window.confirm(
        `Nie znaleziono gracza "${playerName}".\nOK: mapuj do istniejącego\nAnuluj: dodaj nowego`
      );

      if (mapExisting) {
        const existingNames = availablePlayers.map((player) => player.name).join(', ');
        const mappedName = window.prompt(
          `Wpisz imię istniejącego gracza dla "${playerName}".\nDostępni: ${existingNames}`,
          playerName
        );
        if (mappedName === null) {
          return null;
        }
        const mapped = findByName(mappedName);
        if (mapped) {
          return mapped.id;
        }
        notify(`Brak gracza "${mappedName}". Spróbuj ponownie.`, 'error');
        continue;
      }

      const newNameRaw = window.prompt('Podaj imię nowego gracza:', playerName);
      if (newNameRaw === null) {
        return null;
      }
      const newName = newNameRaw.trim();
      if (!newName) {
        notify('Imię nowego gracza nie może być puste.', 'error');
        continue;
      }

      const existingByNewName = findByName(newName);
      if (existingByNewName) {
        return existingByNewName.id;
      }

      try {
        const created = await createPlayer.mutateAsync({ name: newName });
        availablePlayers.push({ id: created.id, name: created.name });
        notify(`Dodano gracza: ${created.name}.`, 'success');
        return created.id;
      } catch (error) {
        notify(
          (error as ApiError)?.message || `Nie udało się dodać gracza "${newName}".`,
          'error'
        );
      }
    }
  };

  const runImport = async () => {
    if (game.scoringType !== 'TTR_CALCULATOR') {
      notify('Import JSON jest dostępny tylko dla gry Pociągi.', 'error');
      return;
    }

    if (!importPlayedOn) {
      setImportError('Podaj datę meczu.');
      return;
    }

    const sourceText = importJsonText.trim();
    if (!sourceText && !importFile) {
      setImportError('Wklej JSON albo wybierz plik JSON.');
      return;
    }

    setImportError(null);

    let rawJson = sourceText;
    if (!rawJson && importFile) {
      rawJson = await importFile.text();
    }

    let parsed: ImportedTtrPayload;
    try {
      parsed = parseImportedTtrPayload(JSON.parse(rawJson));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Nieprawidłowy JSON.');
      return;
    }

    const availablePlayers = players.map((player) => ({ id: player.id, name: player.name }));
    const playersPayload: Array<{ playerId: string; totalPoints: number }> = [];
    for (const importedPlayer of parsed.players) {
      // Resolve each player step by step to keep mapping prompts deterministic.
      // eslint-disable-next-line no-await-in-loop
      const playerId = await resolveImportedPlayerId(importedPlayer.name, availablePlayers);
      if (!playerId) {
        setImportError('Import anulowany podczas mapowania graczy.');
        return;
      }
      playersPayload.push({
        playerId,
        totalPoints: importedPlayer.totalPoints,
      });
    }

    let optionId =
      selectableGameOptions.find((option) => option.code === parsed.editionCode)?.id ?? null;

    if (!optionId) {
      const shouldCreate = window.confirm(
        `Brak dodatku "${parsed.editionName}" (${parsed.editionCode}). Dodać go teraz?`
      );
      if (!shouldCreate) {
        setImportError('Import anulowany: brak dodatku dla tej edycji.');
        return;
      }
      try {
        const createdOption = await createOption.mutateAsync({
          code: game.code,
          displayName: parsed.editionName,
          optionCode: parsed.editionCode,
        });
        optionId = createdOption.id;
        notify(`Dodano dodatek: ${createdOption.displayName}.`, 'success');
      } catch (error) {
        setImportError((error as ApiError)?.message || 'Nie udało się dodać dodatku.');
        return;
      }
    }

    try {
      await createMatch.mutateAsync({
        gameId: game.id,
        playedOn: importPlayedOn,
        optionIds: optionId ? [optionId] : undefined,
        notes: `Import JSON (${parsed.editionName})`,
        players: playersPayload,
      });
      notify(`Zaimportowano mecz (${parsed.editionName}).`, 'success');
      setShowImportPanel(false);
      setImportJsonText('');
      setImportFile(null);
      setImportFileKey((prev) => prev + 1);
      setImportError(null);
    } catch (error) {
      setImportError((error as ApiError)?.message || 'Nie udało się zaimportować meczu.');
    }
  };

  const loading = matchesLoading || playersLoading || optionsLoading;
  const hasError = matchesError || playersError || optionsError;

  const comparePlayersForDisplay = (
    a: { playerId: string; place: number | null; totalPoints?: number },
    b: { playerId: string; place: number | null; totalPoints?: number }
  ) => {
    const placeDiff = (a.place ?? 0) - (b.place ?? 0);
    if (placeDiff !== 0) {
      return placeDiff;
    }

    const pointsDiff = (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
    if (pointsDiff !== 0) {
      return pointsDiff;
    }

    return a.playerId.localeCompare(b.playerId);
  };

  const formatParticipants = (
    players: Array<{ playerId: string; name: string; place: number | null; totalPoints: number }>
  ) => {
    const sorted = [...players].sort(comparePlayersForDisplay);
    return (
      <div className="participants-list">
        {sorted.map((player) => (
          <span key={player.playerId}>
            {player.place ?? '-'}.
            {' '}
            {player.name}
          </span>
        ))}
      </div>
    );
  };

  const formatPodium = (
    players: Array<{ playerId: string; name: string; place: number | null; totalPoints: number }>
  ) => {
    const sorted = [...players].sort(comparePlayersForDisplay);
    const podiumPlayers = sorted.filter((player) => player.place != null && player.place <= 3);
    if (podiumPlayers.length === 0) {
      return '-';
    }
    return podiumPlayers.map((player) => `${player.place}: ${player.name}`).join(', ');
  };

  const formatOptions = (options: Array<{ id: string; code?: string; displayName: string }>) => {
    const visibleOptions = Array.isArray(options)
      ? options.filter((option) => !isBaseGameOption(option))
      : [];
    if (visibleOptions.length === 0) {
      return '—';
    }
    return visibleOptions.map((option) => option.displayName).join(', ');
  };
  const calculatorHref = resolveCalculatorHref(game.calculatorUrl);
  const calculatorLabel = game.calculatorButtonLabel?.trim() || 'Kalkulator';
  const isExternalCalculator = Boolean(calculatorHref && /^https?:\/\//i.test(calculatorHref));

  return (
    <>
      <div className="page-header-row">
        <PageHeader title={`${game.displayName} • Mecze`} />
        <div className="page-header-actions">
          {calculatorHref ? (
            <a
              className="button secondary"
              href={calculatorHref}
              target={isExternalCalculator ? '_blank' : undefined}
              rel={isExternalCalculator ? 'noreferrer noopener' : undefined}
            >
              {calculatorLabel}
            </a>
          ) : null}
          {game.scoringType === 'TTR_CALCULATOR' ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowImportPanel((prev) => !prev)}
            >
              {showImportPanel ? 'Ukryj import' : 'Importuj mecz'}
            </Button>
          ) : null}
          <Link className="button primary" to={`/games/${game.code}/matches/new${searchSuffix}`}>
            Dodaj mecz
          </Link>
        </div>
      </div>

      {showImportPanel && game.scoringType === 'TTR_CALCULATOR' ? (
        <div className="card">
          <div className="form">
            <div className="form-grid">
              <FormField label="Data meczu" htmlFor="import-match-date">
                <Input
                  id="import-match-date"
                  type="date"
                  value={importPlayedOn}
                  onChange={(event) => setImportPlayedOn(event.target.value)}
                />
              </FormField>
              <FormField label="Plik JSON" htmlFor="import-match-file">
                <Input
                  key={importFileKey}
                  id="import-match-file"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                />
              </FormField>
            </div>
            <FormField label="Lub wklej JSON" htmlFor="import-match-json">
              <textarea
                id="import-match-json"
                className="textarea"
                rows={10}
                value={importJsonText}
                onChange={(event) => setImportJsonText(event.target.value)}
                placeholder='{"edition":{"id":"poland","name":"Polska"},"players":[...]}'
              />
            </FormField>
            {importError ? (
              <p className="muted" style={{ color: 'var(--danger)', margin: 0 }}>
                {importError}
              </p>
            ) : null}
            <div className="form-actions">
              <Button
                type="button"
                variant="primary"
                onClick={() => void runImport()}
                disabled={
                  createMatch.isPending ||
                  createOption.isPending ||
                  createPlayer.isPending
                }
              >
                {createMatch.isPending || createOption.isPending || createPlayer.isPending
                  ? 'Importowanie...'
                  : 'Importuj mecz z JSON'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="filters">
        <div className="filters-row">
          <FormField label="Gracz">
            <Select
              value={filters.playerId ?? ''}
              onChange={(event) =>
                updateSearchParams({ playerId: event.target.value || undefined, offset: 0 })
              }
            >
              <option value="">Wszyscy</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </Select>
          </FormField>
          {selectableGameOptions.length > 0 ? (
            <FormField label="Opcja gry">
              <Select
                value={filters.optionId ?? ''}
                onChange={(event) =>
                  updateSearchParams({ optionId: event.target.value || undefined, offset: 0 })
                }
              >
                <option value="">Wszystkie</option>
                {selectableGameOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.displayName}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label="Data od">
            <Input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(event) =>
                updateSearchParams({ dateFrom: event.target.value || undefined, offset: 0 })
              }
            />
          </FormField>
          <FormField label="Data do">
            <Input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(event) =>
                updateSearchParams({ dateTo: event.target.value || undefined, offset: 0 })
              }
            />
          </FormField>
          <Button type="button" variant="secondary" onClick={handleClear}>
            Wyczyść filtry
          </Button>
        </div>
      </div>

      {hasError ? (
        <div className="card">
          <ErrorState
            description="Nie udało się pobrać meczów multiplayer."
            onRetry={() => {
              refetchMatches();
              refetchPlayers();
              refetchOptions();
            }}
          />
        </div>
      ) : loading ? (
        <div className="card center-content">
          <Spinner />
          <p>Ładowanie meczów...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Brak meczów"
            description="Dodaj pierwszy mecz, aby rozpocząć statystyki."
            action={
              <Link className="button primary" to={`/games/${game.code}/matches/new${searchSuffix}`}>
                Dodaj mecz
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Opcja</th>
                  <th>Uczestnicy</th>
                  <th>Podium</th>
                  <th className="note-col">Notatka</th>
                  <th className="actions-col">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id}>
                    <td>{match.playedOn}</td>
                    <td>{formatOptions(match.options)}</td>
                    <td>{formatParticipants(match.players)}</td>
                    <td>{formatPodium(match.players)}</td>
                    <td className="note-col">
                      <MatchNoteHint note={match.notes} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <Link
                          className="button link"
                          to={`/games/${game.code}/matches/${match.id}/edit${searchSuffix}`}
                        >
                          Edytuj
                        </Link>
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => handleDelete(match.id)}
                        >
                          Usuń
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <Button
              type="button"
              variant="secondary"
              disabled={!canPrev}
              onClick={() => updateSearchParams({ offset: Math.max(0, offset - limit) })}
            >
              Poprzednie
            </Button>
            <div className="pagination-meta">
              {total > 0 ? `${offset + 1}-${Math.min(offset + limit, total)} z ${total}` : '0'}
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!canNext}
              onClick={() => updateSearchParams({ offset: offset + limit })}
            >
              Następne
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Usuń mecz multiplayer"
        description="Czy na pewno chcesz usunąć ten mecz? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}
