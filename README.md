# game-stats

Game Stats to aplikacja webowa do zapisywania wynikow gier planszowych 1v1
oraz multiplayer, z kalkulatorami punktacji, statystykami i narzedziami
administracyjnymi. Repozytorium zawiera monorepo z backendem (Node.js),
frontendem (React + Vite) oraz baza danych PostgreSQL uruchamiana w Dockerze.

Szczegoly zmian funkcjonalnych: `CHANGELOG.md`.

## Production Safety (ważne)
- Repo jest traktowane jako produkcyjne.
- Backend produkcyjny NIE powinien wykonywac automatycznych migracji i seedów przy starcie.
- Automatyczny bootstrap bazy uruchamia sie tylko gdy `DB_BOOTSTRAP=true`.
- Lokalny `.env.example` ma `DB_BOOTSTRAP=true`, zeby swiezy Docker Compose wystartowal od razu.
- Dla produkcji uzyj `.env.production.example` i ustaw `DB_BOOTSTRAP=false`.
- W produkcji ustaw `ADMIN_TOKEN`; bez tokenu backend odrzuci operacje zapisu.
- W produkcji nie uruchamiaj `npm run reset:dev` (usuwa cala baze i seeduje dane testowe).

Projekt jest przygotowany do uruchomienia lokalnie przez Docker Compose,
z migracjami i seedem danych w srodowisku DEV.

## Requirements
- Docker
- Docker Compose

## Uruchomienie (krok po kroku)
1. Skopiuj plik srodowiskowy:
   `cp .env.example .env`
2. Uruchom stack:
   `docker compose -f compose.yml up --build`
3. Otworz:
   - Frontend: http://localhost:8501
   - Backend API: http://localhost:8500/api/v1
   - Readiness: http://localhost:8500/api/v1/ready

## Seed danych
Seed uruchamia sie tylko przy jawnie ustawionym `DB_BOOTSTRAP=true`.
Domyslne gry w bazie:
- Rummikub (code: rummikub)
- Cortex (code: cortex)
- Boggle (code: boggle)
- Uno (code: uno)
- Ticket to Ride (code: ticket_to_ride)

Ręczny seed baseline (idempotentny, bez resetu danych):
`docker compose -f compose.yml exec backend npm run seed:baseline`

## Moduł multiplayer (Wieloosobowe)
Moduł multiplayer obsługuje gry 2–5+ graczy z punktacją:
- manualną (`MANUAL_POINTS`),
- Ticket to Ride (`TTR_CALCULATOR`),
- własnym kalkulatorem pól (`CUSTOM_CALCULATOR`),
- legacy TM (`TM_CALCULATOR`) z domyślnym uproszczeniem punktacji.

Dodane/wykorzystywane tabele:
- `multiplayer_games` (definicje gier + limity graczy + scoringType + tryb dodatków),
- `multiplayer_game_options` (opcje/dodatki gry),
- `multiplayer_matches` (nagłówki meczów),
- `multiplayer_match_options` (powiązania meczu z opcjami; wiele opcji na mecz),
- `multiplayer_match_players` (gracze i punkty),
- tabele szczegółowe kalkulatorów (`multiplayer_ticket_to_ride_*`, `multiplayer_terraforming_mars_player_details`, `multiplayer_custom_*`).

Uwaga o danych historycznych:
- Dane historyczne TM/TTR/custom nie są usuwane.
- W trybie uproszczonym TM aplikacja używa prostych punktów (`totalPoints`) i ignoruje legacy pola kalkulatora.
- Przy edycji legacy TM blokowana jest zmiana składu graczy, żeby nie usuwać historycznych rekordów szczegółowych.

### Ranking remisów (competition ranking)
Domyślnie miejsca liczone są w trybie olimpijskim:
- remis 2-osobowy o 1 miejsce => `1, 1`,
- jeśli dwóch graczy ma `1 miejsce`, kolejny ma `3`,
- jeśli trzech graczy ma `2 miejsce`, kolejny ma `5`.

Dla kompatybilności historycznej:
- statystyki i podia są liczone z `totalPoints` (SQL `RANK()`), nie z zapisanego `place`,
- dzięki temu stare rekordy z niespójnym `place` nie wymagają backfillu danych.

Włączanie/wyłączanie:
- backend flagą `FEATURE_OLYMPIC_RANKING` (domyślnie `true`).

### Dodatki: exclusive vs multi
Każda gra multiplayer ma tryb dodatków:
- `optionsExclusive=true` — wybór jednego dodatku/opcji,
- `optionsExclusive=false` — wybór wielu dodatków (multi-select).

API i UI:
- API akceptuje `optionIds` (oraz legacy `optionId` dla kompatybilności).
- API pozwala też zmieniać nazwy dodatków istniejących rekordów:
  - `PATCH /api/v1/multiplayer/games/:code/options/:optionId` (`displayName`).
- Dla gry można skonfigurować przycisk kalkulatora:
  - `calculatorButtonLabel` (etykieta przycisku),
  - `calculatorUrl` (link lokalny lub pełny `http/https`).
- Link lokalny (np. `costam`) jest normalizowany do ścieżki aplikacji (`/costam`).
- UI renderuje:
  - single select/radio dla `optionsExclusive=true`,
  - checkboxy dla `optionsExclusive=false`.
- Opcja bazowa (`Podstawa`/`Podstawka`/`base`) jest traktowana jako domyślna:
  - nie jest wymagana przy dodawaniu/edycji meczu,
  - nie jest osobno listowana w statystykach per-opcja i filtrach opcji.
- W panelu admin:
  - `Edytuj` z listy gier prowadzi do dedykowanego ekranu edycji gry,
  - ekran edycji gry umożliwia zmianę nazw dodatków bez tworzenia nowych rekordów.
- Domyślne zachowanie dla starych rekordów (`NULL`) jest kompatybilne: traktowane jako `exclusive=true`.

Migracja schematu:
- `016_multiplayer_options_mode.sql`:
  - dodaje nullable `multiplayer_games.options_exclusive`,
  - rozszerza `multiplayer_match_options` do klucza `(match_id, option_id)`,
  - dodaje indeks po `match_id`.
- Brak backfilli i brak dopisywania danych produkcyjnych podczas wdrożenia.

### Terraformacja Marsa (usunięcie kalkulatora z domyślnej ścieżki)
Zmiana domyślna:
- formularz TM w UI działa jak prosta punktacja (manual points),
- backend dla `TM_CALCULATOR` domyślnie przyjmuje `players[].totalPoints`.

Kompatybilność/rollback:
- legacy TM kalkulator pozostaje w kodzie pod flagą `FEATURE_SIMPLE_TM_MODE=false`.
- Historyczne rekordy i pola legacy pozostają w bazie bez usuwania.

## Eksport / Import danych (Admin)
Nowe endpointy:
- `GET /api/v1/admin/data/export` — eksport JSON snapshot.
- `POST /api/v1/admin/data/import` — import JSON z walidacją i trybem `dryRun`.

Zakres eksport/import (minimum):
- gry, gracze, mecze 1v1,
- gry multiplayer, dodatki/opcje, mecze, gracze, relacje mecz-opcja,
- szczegóły kalkulatorów (TTR/TM/custom).

Bezpieczeństwo importu:
- walidacja schematu i referencji,
- `dryRun=true` (bez zapisu),
- limity rozmiaru payload (`ADMIN_IMPORT_MAX_BYTES`),
- ograniczenie uprawnień tokenem `X-Admin-Token` (`ADMIN_TOKEN`),
- w PROD dodatkowe potwierdzenie (`IMPORT_PROD_CONFIRM`) i rate limit.

Format pliku:
- JSON z polami:
  - `version`,
  - `exportedAt`,
  - `data` (kolekcje tabelowe).

Przykład (fragment):
```json
{
  "version": 1,
  "exportedAt": "2026-02-28T12:00:00.000Z",
  "data": {
    "players": [
      { "id": "uuid", "name": "Ada", "isActive": true }
    ],
    "multiplayerMatches": [
      { "id": "uuid", "gameId": "uuid", "playedOn": "2026-02-28" }
    ]
  }
}
```

## Feature Flags
Backend (`.env`, `backend/.env.example`):
- `FEATURE_OLYMPIC_RANKING=true`
- `FEATURE_SIMPLE_TM_MODE=true`
- `FEATURE_MULTI_OPTIONS_MODE=true`
- `FEATURE_ADMIN_DATA_EXPORT=true`
- `FEATURE_ADMIN_DATA_IMPORT` (zalecane `false` w PROD)
- `FEATURE_ADMIN_DATA_IMPORT_APPLY` (zalecane `false` w PROD)

Frontend (`frontend/.env.example`):
- `VITE_FEATURE_SIMPLE_TM_MODE=true`
- `VITE_FEATURE_MULTI_OPTIONS_MODE=true`

Uwaga:
- rollout flag frontend/backend powinien być skoordynowany.
- szybki rollback: przełącz odpowiednią flagę bez zmian w danych DB i zrestartuj usługi.

## Migracja legacy Ticket to Ride -> multiplayer
Migracja jest idempotentna i używa tabeli `legacy_migration_map`, dzięki czemu można ją bezpiecznie uruchamiać wielokrotnie.

Uruchomienie (na działającym backendzie):
`docker compose -f compose.yml exec backend npm run migrate:ttr-legacy`

Opcjonalnie można sterować wielkością batcha:
`MIGRATION_BATCH_SIZE=100 docker compose -f compose.yml exec backend npm run migrate:ttr-legacy`

## Legacy Ticket to Ride deprecation plan
Legacy dotyczy dawnych tabel i endpointów dla Pociągów (Ticket to Ride).

Legacy tabele:
- `ticket_to_ride_matches`
- `ticket_to_ride_match_players`

Legacy endpointy (tymczasowo kompatybilne):
- `/api/v1/ticket-to-ride/matches`
- `/api/v1/ticket-to-ride/matches/:id`
- `/api/v1/ticket-to-ride/variants`
- `/api/v1/ticket-to-ride/stats/players`

Od EPIC 3/4 dane Pociągów są przechowywane w modelu multiplayer:
- `multiplayer_matches`
- `multiplayer_match_players`
- `multiplayer_ticket_to_ride_matches`
- `multiplayer_ticket_to_ride_player_details`

Usunięcie legacy:
- po zakończeniu rolloutu i potwierdzeniu braku ruchu na legacy endpointach,
- po wykonaniu i zweryfikowaniu migracji historycznych danych,
- nie wcześniej niż po ustalonym oknie obserwacji w produkcji.

Jak zweryfikować brak użycia legacy endpointów:
- sprawdzaj logi backendu pod kątem wpisów: `DEPRECATED endpoint used: ...`
- jeśli przez ustalony okres (np. 2–4 tygodnie) nie ma takich logów, można planować usunięcie legacy.

## Kontrakty API (OpenAPI + TS)
- Specyfikacja OpenAPI: `openapi.yaml`
- Aktualizacja: przy zmianach endpointow, walidacji lub payloadow zaktualizuj `openapi.yaml` oraz typy TS.
- Typy TS (frontend): `frontend/src/contracts/api.ts` (utrzymywane recznie; brak generatora w tym repo).
- Check pokrycia endpointow backend vs OpenAPI: `cd backend && npm run check:openapi-routes`

## Plan wdrożenia PROD (safe)
1. Wykonaj tylko migracje schematu (bez seed/backfill):
   - `docker compose -f compose.yml exec backend npm run migrate`
2. Wdróż backend + frontend z flagami:
   - `FEATURE_SIMPLE_TM_MODE=true`
   - `FEATURE_OLYMPIC_RANKING=true`
   - `FEATURE_MULTI_OPTIONS_MODE=true`
3. Import danych admin:
   - domyślnie wyłączony w PROD (`FEATURE_ADMIN_DATA_IMPORT=false`, `FEATURE_ADMIN_DATA_IMPORT_APPLY=false`).
4. Zweryfikuj endpointy zdrowia i gotowosci:
   - `GET /api/v1/health`
   - `GET /api/v1/ready`
5. Zweryfikuj ręcznie UI:
   - tworzenie/edycja meczów z remisami,
   - dodatki exclusive/multi,
   - eksport admin.

Gwarancje wdrożenia:
- brak kasowania kolumn/tabel produkcyjnych,
- brak backfillu danych,
- brak automatycznego importu/seedu przy starcie (`DB_BOOTSTRAP=false`).

Rollback plan:
1. Przełącz flagi na poprzednie zachowanie (bez migracji danych):
   - `FEATURE_SIMPLE_TM_MODE=false`
   - `FEATURE_OLYMPIC_RANKING=false` (jeśli wymagane)
   - `FEATURE_MULTI_OPTIONS_MODE=false` (jeśli wymagane)
2. Jeśli trzeba, wyłącz endpointy importu:
   - `FEATURE_ADMIN_DATA_IMPORT=false`
   - `FEATURE_ADMIN_DATA_IMPORT_APPLY=false`
3. W razie rollbacku aplikacji użyj standardowego rollbacku artefaktu/kontenera.
   Migracja `016` jest backward-compatible i może pozostać.
4. Zrestartuj backend/frontend po zmianie flag, bo sa czytane przy starcie procesu.

## Reset srodowiska DEV
Reset usuwa wszystkie dane, odtwarza schemat i wykonuje seed:
`docker compose -f compose.yml exec backend npm run reset:dev`

Migracje bez seedu (zalecane dla produkcji):
`docker compose -f compose.yml exec backend npm run migrate`

Migracje + baseline seed (bez kasowania danych):
1. `docker compose -f compose.yml exec backend npm run migrate`
2. `docker compose -f compose.yml exec backend npm run seed:baseline`

## Reverse proxy (Nginx Proxy Manager)
Przy wystawieniu przez Nginx Proxy Manager (np. stats.holak.net.pl):
- Proxy Host: `stats.holak.net.pl` -> frontend (port 5173)
- Custom Location: `/api` -> backend (port 3002)
- W frontendzie ustaw `VITE_API_BASE_URL` na bazowy adres bez `/api/v1`, np. `https://stats.holak.net.pl`

Uwaga: w kodzie sciezki API juz zaczynaja sie od `/api/v1`, wiec `VITE_API_BASE_URL` nie powinno zawierac `/api/v1`.

## Struktura projektu (skrot)
- `backend/` - API + migracje + seed
- `frontend/` - aplikacja React + Vite
- `docker/` - pliki pomocnicze dla kontenerow (jesli beda potrzebne)
- `compose.yml` - lokalny stack (Postgres + backend + frontend)
- `docker-compose.yml` - alternatywny stack z konfiguracja reverse proxy

## Konwencje jezykowe
- Identyfikatory w kodzie sa po angielsku (zmienne, endpointy, nazwy tabel i plikow).
- Warstwa UI i dane wyswietlane uzytkownikowi pozostaja po polsku.

## Znane ograniczenia (Iteracja 1)
- brak pelnego systemu kont uzytkownikow; ochrona zapisu opiera sie na `ADMIN_TOKEN`,
- legacy endpointy Ticket to Ride pozostaja tymczasowo dla kompatybilnosci,
- stare rekordy TM moga nadal zawierac szczegoly legacy kalkulatora,
- OpenAPI i typy TS sa utrzymywane recznie, dlatego po zmianach API trzeba uruchamiac `npm run check:openapi-routes`.
