import { useMemo, useState } from 'react';
import type { ApiError } from '../api/ApiProvider';
import {
  useAdminDataExport,
  useAdminDataImport,
  type AdminDataImportResponse,
  type AdminDataSnapshot,
} from '../api/hooks';
import { PageHeader } from '../components/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/ToastProvider';

const PROD_CONFIRM_TOKEN = 'IMPORT_PROD_CONFIRM';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function makeExportFileName() {
  const safe = new Date().toISOString().replace(/[:.]/g, '-');
  return `game-stats-export-${safe}.json`;
}

function downloadJson(payload: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toApiErrorMessage(error: unknown) {
  const apiError = error as ApiError;
  if (Array.isArray(apiError?.details) && apiError.details.length > 0) {
    return apiError.details.map((detail) => `${detail.field || 'body'}: ${detail.message}`).join('; ');
  }
  return apiError?.message || 'Wystąpił błąd.';
}

function renderSummaryRows(summary: AdminDataImportResponse['summary']) {
  const keys = Object.keys(summary.received).sort();
  return keys.map((key) => ({
    key,
    received: summary.received[key] ?? 0,
    toInsert: summary.toInsert[key] ?? 0,
    toUpdate: summary.toUpdate[key] ?? 0,
  }));
}

export function AdminDataTransferPage() {
  const { notify } = useToast();
  const exportMutation = useAdminDataExport();
  const importMutation = useAdminDataImport();

  const [adminToken, setAdminToken] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [payload, setPayload] = useState<AdminDataSnapshot | null>(null);
  const [localError, setLocalError] = useState('');
  const [importResult, setImportResult] = useState<AdminDataImportResponse | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');

  const isBusy = exportMutation.isPending || importMutation.isPending;

  const summaryRows = useMemo(() => {
    if (!importResult?.summary) {
      return [];
    }
    return renderSummaryRows(importResult.summary);
  }, [importResult]);

  const handleExport = async () => {
    setLocalError('');
    try {
      const snapshot = await exportMutation.mutateAsync({
        adminToken: adminToken.trim() || undefined,
      });
      const fileName = makeExportFileName();
      downloadJson(snapshot, fileName);
      notify('Eksport danych został przygotowany.', 'success');
    } catch (error) {
      const message = toApiErrorMessage(error);
      setLocalError(message);
      notify(message, 'error');
    }
  };

  const handleFileChange = async (file: File | null) => {
    setLocalError('');
    setImportResult(null);
    setConfirmationInput('');

    if (!file) {
      setSelectedFileName('');
      setSelectedFileSize(0);
      setPayload(null);
      return;
    }

    setSelectedFileName(file.name);
    setSelectedFileSize(file.size);

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as AdminDataSnapshot;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
        throw new Error('Plik nie ma poprawnego formatu eksportu.');
      }
      setPayload(parsed);
      notify('Plik importu został wczytany.', 'info');
    } catch (error) {
      setPayload(null);
      const message = error instanceof Error ? error.message : 'Nie udało się odczytać pliku JSON.';
      setLocalError(message);
      notify(message, 'error');
    }
  };

  const runImport = async (dryRun: boolean) => {
    if (!payload) {
      const message = 'Najpierw wybierz poprawny plik JSON.';
      setLocalError(message);
      notify(message, 'error');
      return;
    }

    setLocalError('');

    try {
      const result = await importMutation.mutateAsync({
        adminToken: adminToken.trim() || undefined,
        dryRun,
        payload,
        confirmation: dryRun ? undefined : confirmationInput.trim() || undefined,
      });
      setImportResult(result);

      if (dryRun) {
        notify('Dry-run importu zakończony.', 'success');
      } else {
        notify('Import danych został wykonany.', 'success');
      }
    } catch (error) {
      const message = toApiErrorMessage(error);
      setLocalError(message);
      notify(message, 'error');
    }
  };

  const handleApplyImport = async () => {
    const confirmed = window.confirm(
      'To wykona rzeczywisty import i zapisze dane w bazie. Kontynuować?'
    );
    if (!confirmed) {
      return;
    }

    await runImport(false);
  };

  return (
    <section>
      <PageHeader
        title="Eksport / Import danych"
        description="Narzędzia administracyjne do bezpiecznego eksportu i importu danych (JSON)."
      />

      <div className="card">
        <div className="form">
          <FormField label="Token administratora" htmlFor="admin-token">
            <Input
              id="admin-token"
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Wymagany gdy ADMIN_TOKEN jest ustawiony"
            />
          </FormField>

          {localError ? (
            <Alert title="Błąd" variant="error">
              {localError}
            </Alert>
          ) : null}

          <div className="form-actions">
            <Button type="button" variant="primary" disabled={isBusy} onClick={handleExport}>
              {exportMutation.isPending ? 'Eksportowanie...' : 'Eksportuj JSON'}
            </Button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="form">
          <FormField label="Plik importu (JSON)" htmlFor="import-file">
            <Input
              id="import-file"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleFileChange(file);
              }}
            />
          </FormField>

          {selectedFileName ? (
            <p className="muted">
              Wybrany plik: <strong>{selectedFileName}</strong> ({formatBytes(selectedFileSize)})
            </p>
          ) : (
            <p className="muted">Nie wybrano pliku.</p>
          )}

          <div className="form-actions">
            <Button type="button" variant="secondary" disabled={isBusy || !payload} onClick={() => void runImport(true)}>
              {importMutation.isPending ? 'Przetwarzanie...' : 'Dry-run importu'}
            </Button>
          </div>

          {importResult?.confirmationRequired ? (
            <>
              <Alert title="Wymagane potwierdzenie" variant="info">
                Dla importu zapisywanego w PROD wpisz token potwierdzenia i uruchom import.
              </Alert>

              <FormField label={`Potwierdzenie (${importResult.confirmationToken || PROD_CONFIRM_TOKEN})`} htmlFor="import-confirmation">
                <Input
                  id="import-confirmation"
                  value={confirmationInput}
                  onChange={(event) => setConfirmationInput(event.target.value)}
                  placeholder={importResult.confirmationToken || PROD_CONFIRM_TOKEN}
                />
              </FormField>
            </>
          ) : null}

          <div className="form-actions">
            <Button
              type="button"
              variant="danger"
              disabled={isBusy || !payload}
              onClick={() => void handleApplyImport()}
            >
              {importMutation.isPending ? 'Importowanie...' : 'Wykonaj import'}
            </Button>
          </div>

          {importResult ? (
            <div className="table-card">
              <h3>Podsumowanie importu</h3>
              {importResult.warnings.length > 0 ? (
                <Alert title="Ostrzeżenia" variant="info">
                  <ul>
                    {importResult.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}

              <table className="table">
                <thead>
                  <tr>
                    <th>Kolekcja</th>
                    <th>Odebrane</th>
                    <th>Do dodania</th>
                    <th>Do aktualizacji</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key}</td>
                      <td>{row.received}</td>
                      <td>{row.toInsert}</td>
                      <td>{row.toUpdate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="muted">
                Tryb: <strong>{importResult.dryRun ? 'dry-run (bez zapisu)' : 'zapis do bazy'}</strong>
                {' • '}
                Czas wykonania: <strong>{importResult.appliedAt || '—'}</strong>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
