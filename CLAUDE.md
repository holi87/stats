# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Game Stats - aplikacja do śledzenia statystyk gier planszowych (1v1 i multiplayer). Monorepo: backend (Express.js), frontend (React+Vite+TypeScript), baza PostgreSQL 16.

## Commands

### Docker (dev)
```bash
cp .env.example .env
docker compose up --build          # Frontend :8501, Backend :8500, DB :5432
```

### Backend (z katalogu backend/)
```bash
npm start                          # Uruchomienie serwera
npm test                           # Wszystkie testy (Node.js native test runner, --test-concurrency=1)
npm run test:stats-1v1             # Pojedynczy suite testowy
npm run check:openapi-routes       # Walidacja pokrycia OpenAPI vs zaimplementowane endpointy
npm run migrate                    # Migracje SQL
npm run reset:dev                  # Reset bazy + seed (tylko DEV)
npm run seed:baseline              # Seed bazowych gier
npm run migrate:ttr-legacy         # Migracja legacy Ticket to Ride
```

### Frontend (z katalogu frontend/)
```bash
npm run dev                        # Vite dev server (:5173)
npm run build                      # tsc -b && vite build
npm run preview                    # Podgląd produkcyjnego builda
```

## Architecture

### Backend
- **Express.js** z raw SQL (pg, bez ORM). Migracje w `backend/db/migrations/` (001-017).
- Struktura: `routes/` (endpointy) → `services/` (logika biznesowa) → `db.js` (połączenie).
- API pod `/api/v1`, format błędów: `{ error: { code, message, details[] } }`.
- Testy używają Node.js native test runner (`node --test`). Wymagają `DB_BOOTSTRAP=true`.

### Frontend
- **React 18 + TypeScript + Vite**. Routing: React Router v6. Stan serwera: TanStack React Query.
- Hooki API w `src/api/hooks.ts`, typy kontraktów w `src/contracts/api.ts` (ręcznie utrzymywane).
- Stylowanie: jeden plik `src/index.css`.

### Multiplayer scoring types
- `MANUAL_POINTS` - ręczne punkty
- `TTR_CALCULATOR` - kalkulator Ticket to Ride
- `TM_CALCULATOR` - Terraforming Mars (uproszczony do totalPoints)
- `CUSTOM_CALCULATOR` - pola definiowane per gra z mnożnikami

### Feature flags (env vars)
`FEATURE_OLYMPIC_RANKING`, `FEATURE_SIMPLE_TM_MODE`, `FEATURE_MULTI_OPTIONS_MODE`, `FEATURE_ADMIN_DATA_EXPORT`, `FEATURE_ADMIN_DATA_IMPORT`, `FEATURE_ADMIN_DATA_IMPORT_APPLY`

### Key env vars
- `DB_BOOTSTRAP` - `true` tworzy tabele/seed przy starcie (nigdy w PROD)
- `DATABASE_URL` - connection string PostgreSQL
- `VITE_API_BASE_URL` - bazowy URL API dla frontendu
- `ADMIN_TOKEN` - token autoryzacji endpointów admin

## Workflow

Po każdej zmianie w kodzie wykonaj commit i push.

## Important Patterns

- Brak ORM - wszystkie zapytania to raw SQL w serwisach.
- Kontrakty API (OpenAPI + TS types) utrzymywane ręcznie - po zmianie endpointu zaktualizuj `openapi.yaml` i `frontend/src/contracts/api.ts`.
- Ranking olimpijski: remisy dzielą miejsce, kolejne jest pomijane (np. 1,1,3).
- Legacy Ticket to Ride: stare tabele (`ticket_to_ride_*`) współistnieją z nowymi (`multiplayer_*`), deprecated endpointy logują ostrzeżenia.
- Game options: `optionsExclusive=true` → radio, `false` → checkboxy.
