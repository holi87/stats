# game-stats

Game Stats to prosta aplikacja webowa do zapisywania wynikow gier 1v1 oraz
przegladania statystyk. Repozytorium zawiera monorepo z backendem (Node.js),
frontendem (React + Vite) oraz baza danych PostgreSQL uruchamiana w Dockerze.

## Production Safety (ważne)
- Repo jest traktowane jako produkcyjne.
- Backend NIE wykonuje automatycznie migracji i seedów przy starcie.
- Automatyczny bootstrap bazy uruchamia sie tylko gdy `DB_BOOTSTRAP=true`.
- Domyślnie ustaw `DB_BOOTSTRAP=false` (tak jak w `docker-compose.yml` i `.env.example`).
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
   `docker compose up --build`
3. Otworz:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3002/api/v1

## Seed danych
Seed uruchamia sie tylko przy jawnie ustawionym `DB_BOOTSTRAP=true`.
Domyslne gry w bazie:
- Rummikub (code: rummikub)
- Cortex (code: cortex)
- Boggle (code: boggle)
- Uno (code: uno)
- Ticket to Ride (code: ticket_to_ride)

Ręczny seed baseline (idempotentny, bez resetu danych):
`docker compose exec backend npm run seed:baseline`

## Moduł multiplayer (Wieloosobowe)
Wprowadzony został osobny moduł dla gier 2–5 graczy z obsługą:
- gier manualnych (bez kalkulatorów),
- kalkulatorów (Ticket to Ride, Terraformacja Marsa),
- opcji gry (wariantów) oraz statystyk zbiorczych i per opcja.

Dodane tabele:
- `multiplayer_games` (definicje gier + limity graczy + scoringType)
- `multiplayer_game_options` (opcje/konfiguracje gry, np. warianty)
- `multiplayer_matches` (nagłówki meczów wieloosobowych)
- `multiplayer_match_options` (wybrana opcja dla danego meczu)
- `multiplayer_match_players` (gracze i punkty w meczach wieloosobowych)

Seedowane gry multiplayer:
- Pociągi (code: ticket_to_ride, scoringType: TTR_CALCULATOR)
- Uno (code: uno, scoringType: MANUAL_POINTS)
- Rummikub (code: rummikub, scoringType: MANUAL_POINTS)
- Dobble (code: dobble, scoringType: MANUAL_POINTS)
- Terraformacja Marsa (code: terraforming_mars, scoringType: TM_CALCULATOR)

Endpoint:
- `GET /api/v1/multiplayer/games` — zwraca aktywne gry multiplayer dla UI (do budowania submenu oraz wyboru scoringType/limitów graczy).
- `POST /api/v1/multiplayer/games` — dodaje nową grę manualną (bez kalkulatora).
- `GET /api/v1/multiplayer/games/:code/options` — zwraca aktywne opcje gry.
- `GET /api/v1/multiplayer/stats/players-by-option?gameId=...` — zwraca statystyki `overall` oraz `byOption`.

Uwaga: moduł 1v1 pozostaje bez zmian. W tym epiku nie migrujemy ani nie modyfikujemy istniejących danych 1v1.

## Migracja legacy Ticket to Ride -> multiplayer
Migracja jest idempotentna i używa tabeli `legacy_migration_map`, dzięki czemu można ją bezpiecznie uruchamiać wielokrotnie.

Uruchomienie (na działającym backendzie):
`docker compose exec backend npm run migrate:ttr-legacy`

Opcjonalnie można sterować wielkością batcha:
`MIGRATION_BATCH_SIZE=100 docker compose exec backend npm run migrate:ttr-legacy`

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

## Reset srodowiska DEV
Reset usuwa wszystkie dane, odtwarza schemat i wykonuje seed:
`docker compose exec backend npm run reset:dev`

Migracje bez seedu (zalecane dla produkcji):
`docker compose exec backend npm run migrate`

Migracje + baseline seed (bez kasowania danych):
1. `docker compose exec backend npm run migrate`
2. `docker compose exec backend npm run seed:baseline`

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
- `docker-compose.yml` - lokalny stack (Postgres + backend + frontend)

## Konwencje jezykowe
- Identyfikatory w kodzie sa po angielsku (zmienne, endpointy, nazwy tabel i plikow).
- Warstwa UI i dane wyswietlane uzytkownikowi pozostaja po polsku.

## Znane ograniczenia (Iteracja 1)
- brak autoryzacji i logowania
- tylko mecze 1v1
- gry sa read-only (brak CRUD dla gier)
