# Propozycje poprawek i usprawnien

Data przegladu: 2026-04-26

Zakres: backend Express/PostgreSQL, frontend React/Vite/TypeScript, kontrakty OpenAPI/TS, Docker/CI, dokumentacja i podstawowe komendy walidacyjne.

## Zweryfikowane wyniki

- `cd backend && npm run check:openapi-routes` konczy sie bledem:
  - `GET /admin/data/export` brakuje w `openapi.yaml`,
  - `POST /admin/data/import` brakuje w `openapi.yaml`,
  - `POST /multiplayer/games/{code}/options` brakuje w `openapi.yaml`,
  - `PATCH /multiplayer/games/{code}/options/{optionId}` brakuje w `openapi.yaml`.
- `cd frontend && npm run build` nie zakonczyl sie w rozsadnym czasie; proces zatrzymal sie na `tsc -b` i zostal przerwany po ponad 2 minutach bez diagnostyki.
- `backend/node_modules` nie bylo zainstalowane, wiec pelne testy backendu nie byly uruchamiane lokalnie.
- W repo sa lokalne zmiany niezalezne od tego przegladu: zmodyfikowany `CLAUDE.md` i nie sledzony `AGENTS.md`.

## Priorytet P0/P1

### 1. Naprawic lokalny start Docker/Compose

Problem:
- `.env.example` ustawia `DB_BOOTSTRAP=false`, a backend przy starcie bez bootstrapu robi tylko `SELECT 1`. Swieza baza z `docker compose up --build` nie dostanie schematu ani seedow.
- `compose.yml` wystawia backend na `8500` i frontend na `8501`, ale `.env.example`, `frontend/.env.example` i README wskazuja `http://localhost:3002` oraz `http://localhost:5173`.
- `compose.yml` domyslnie ustawia `VITE_API_BASE_URL=https://stats.sh.info.pl`, wiec lokalny frontend moze uderzac w produkcyjny backend, jezeli uzytkownik nie nadpisze env.

Propozycja:
- Rozdzielic konfiguracje `local` i `prod` albo ustawic jeden domyslny lokalny flow.
- Dla lokalnego compose ustawic `DB_BOOTSTRAP=true` albo dodac jednorazowy job `migrate + seed`.
- Ujednolic porty w README, `.env.example`, `compose.yml` i `docker-compose.yml`.
- Dla frontendu w Dockerze ustawic lokalnie `VITE_API_BASE_URL=http://localhost:8500` albo wystawic backend na `3002`.

### 2. Przywrocic zgodnosc OpenAPI z backendem i typami TS

Problem:
- Obecny check OpenAPI juz wykrywa brak czterech endpointow.
- `openapi.yaml` opisuje `MultiplayerGame` polami `inOneVsOne` i `inMultiplayer`, a backend i frontend faktycznie uzywaja `showInQuickMenu`, `optionsExclusive`, `calculatorButtonLabel`, `calculatorUrl`.
- `ErrorPayload.code` w OpenAPI nie zawiera `FORBIDDEN` i `TOO_MANY_REQUESTS`, mimo ze backend je zwraca.
- Schemat TM w OpenAPI/TS nie oddaje jednoznacznie dwoch trybow pod flaga `FEATURE_SIMPLE_TM_MODE`.

Propozycja:
- Uzupelnic brakujace endpointy admin/options w OpenAPI.
- Zaktualizowac schematy `MultiplayerGame*`, error codes i payloady TM.
- Dodac generator TS z OpenAPI albo przynajmniej test porownujacy kontrakty `openapi.yaml` z `frontend/src/contracts/api.ts`.
- Rozszerzyc `check-openapi-routes` o walidacje schematow, nie tylko metod i sciezek.

### 3. Dodac realna ochrone mutacji w produkcji

Problem:
- Repo jest opisane jako produkcyjne, ale mutacje graczy, gier i meczow sa publiczne. Token jest wymagany tylko dla eksportu/importu admin.
- CORS ogranicza przegladarkowe originy, ale nie jest mechanizmem autoryzacji API.

Propozycja:
- Wprowadzic co najmniej prosty `ADMIN_TOKEN`/session middleware dla `POST/PATCH/DELETE` i panelu administracyjnego.
- Rozdzielic publiczny read-only API od endpointow administracyjnych.
- Dodac testy 401/403 dla mutacji i opis operacyjny w `SECURITY.md`.

### 4. Uporzadkowac CI i Dockerfile

Problem:
- Workflow `.github/workflows/docker-build.yml` tylko buduje/publikuje obrazy, bez testow i bez `check:openapi-routes`.
- Dockerfile nie kopiuja lockfile przed instalacja i uzywaja `npm install`, nie `npm ci`.
- Frontendowy Dockerfile startuje dev serverem; compose nadpisuje to buildem i preview, ale sam obraz nie jest produkcyjny.

Propozycja:
- W CI uruchamiac: backend OpenAPI route check, backend tests na PostgreSQL service, frontend build/typecheck.
- W Dockerfile kopiowac `package-lock.json` i uzywac `npm ci`.
- Zrobic multi-stage frontend: build artefaktu i serwowanie statycznych plikow przez nginx/caddy albo lekki Node static server.

### 5. Wyjasnic i naprawic zawieszajacy sie frontend build

Problem:
- `npm run build` zatrzymal sie na `tsc -b` bez wyniku. Projekt ma ok. 60 plikow w `src`, wiec taki czas nie wyglada normalnie.

Propozycja:
- Uruchomic osobno `tsc -b --verbose --extendedDiagnostics` i zidentyfikowac etap blokady.
- Sprawdzic konfiguracje projektu referencyjnego Vite/TS oraz ewentualne problemy z lokalnym cache `tsconfig.tsbuildinfo`.
- Dodac osobne skrypty `typecheck` i `build:vite`, zeby CI pokazywalo dokladny etap awarii.

## Priorytet P1/P2

### 6. Ustabilizowac paginacje multiplayer

Problem:
- `listMultiplayerMatches` wybiera ID z `ORDER BY m.played_on DESC` bez drugiego klucza. Przy wielu meczach z ta sama data kolejnosc stron moze byc niestabilna.
- Dla 1v1 jest juz stabilniej: `ORDER BY m.played_on DESC, m.id DESC`.

Propozycja:
- Dodac `m.id DESC` do sortowania ID w multiplayer.
- Dopasowac indeks, jezeli lista urosnie: `(played_on DESC, id DESC)` oraz wariant z `game_id`.

### 7. Zmniejszyc ryzyko regresji w duzych plikach backendu

Problem:
- `backend/src/services/multiplayer-matches-service.js` ma ok. 1900 linii.
- `backend/src/routes/multiplayer-matches.js` ma ok. 1200 linii.
- `backend/src/services/admin-data-transfer-service.js` ma ok. 1600 linii.

Propozycja:
- Podzielic logike multiplayer na moduly per scoring type: manual, TTR, TM, custom.
- Wyciagnac wspolne walidatory dat, UUID, paging, optionIds i ranking.
- Import/export admin rozbic na: snapshot readers, validators, normalizers, apply writers.

### 8. Ujednolic walidacje i limity

Problem:
- Walidatory UUID, daty, boolean query i paging sa kopiowane w wielu routes.
- `validateBody` jest prosty i nie lapie nadmiarowych pol ani zagniezdzonych schematow.

Propozycja:
- Wprowadzic wspolny modul walidacji requestow.
- Rozwazyc Zod/Ajv lub walidacje wygenerowana z OpenAPI.
- Dodac testy kontraktowe dla niepoprawnych payloadow: optionIds, custom calculator, TM simple/legacy, admin import.

### 9. Zdecydowac co z `backend/prisma/schema.prisma`

Problem:
- Aplikacja deklaruje brak ORM i uzywa raw SQL, ale repo zawiera schemat Prisma.
- Schemat Prisma wyglada na niepelny wzgledem aktualnych migracji: brakuje m.in. opcji gier, custom calculator values, flag widocznosci i linku kalkulatora.

Propozycja:
- Jesli Prisma nie jest uzywana, usunac schemat i generator z repo.
- Jesli ma zostac narzedziem diagnostycznym, zsynchronizowac go z migracjami i dodac check driftu.

### 10. Odnowic dokumentacje

Problem:
- README na koncu nadal ma "Znane ograniczenia (Iteracja 1)": brak autoryzacji, tylko mecze 1v1, gry read-only. To jest juz niezgodne z obecnym modulem multiplayer i admin CRUD.
- README wskazuje lokalne porty 5173/3002, a `compose.yml` mapuje 8501/8500.
- `FEATURE_*` sa czytane przy starcie procesu, a rollback opisany jako przelaczenie flag moze wymagac restartu backendu/frontendu.

Propozycja:
- Przepisac sekcje startu lokalnego, deploymentu i znanych ograniczen.
- Dodac checklisty: pierwszy start, migracja produkcyjna, rollback z restartem uslug, test zdrowia i gotowosci.

### 11. Dodac frontendowe testy i smoke e2e

Problem:
- Backend ma 25 plikow testowych, frontend nie ma testow komponentow ani e2e.
- Najbardziej ryzykowne UI to formularze meczow i admin data import/export.

Propozycja:
- Dodac Vitest + React Testing Library dla formularzy: manual, TTR, custom, TM simple.
- Dodac Playwright smoke na lokalnym stacku: wejscie w gre, dodanie meczu, edycja, filtrowanie, eksport/import dry-run.
- W CI uruchamiac przynajmniej smoke bez pelnego seeda produkcyjnego.

### 12. Poprawic health/readiness

Problem:
- `/api/v1/health` zwraca `ok` bez sprawdzenia bazy i bez informacji o migracjach.
- Po starcie bez migracji backend moze przejsc health, ale aplikacja nadal bedzie niesprawna.

Propozycja:
- Zostawic `/health` jako liveness.
- Dodac `/ready`, ktore sprawdza polaczenie DB i obecnosc kluczowych tabel/migracji.
- W Compose/CI uzywac readiness do smoke testow.

### 13. Uporzadkowac import/export admin

Problem:
- Import jest transakcyjny, ale bardzo duzy i trudny do audytu.
- UI pokazuje summary, ale nie ma roznic per rekord ani ostrzezen przed nadpisaniem istniejacych danych.

Propozycja:
- Dodac "diff preview" w dry-run: kolekcja, id/code, operacja, najwazniejsze pola zmieniane.
- Dodac eksport metadanych: wersja schematu/migracji, checksum, liczba rekordow per tabela.
- Dodac testy round-trip: export -> import dry-run -> apply na czystej bazie -> porownanie snapshotow.

### 14. Poprawic frontend API defaults i UX bledow

Problem:
- `VITE_API_BASE_URL` jest wymagane zawsze. Przy deploymentach same-origin to dodatkowy punkt awarii.
- Globalny toast pokazuje blad, a formularze czasem pokazuja dodatkowo blad lokalny. To moze dublowac komunikaty.

Propozycja:
- Domyslnie uzywac pustego base URL (`''`) dla same-origin, a env tylko do override.
- Rozdzielic globalne bledy sieciowe od bledow formularzy.
- Dodac stan "backend niedostepny" z linkiem do diagnostyki lokalnego startu.

### 15. Utrzymac legacy TTR/TM z terminem wygaszenia

Problem:
- Legacy endpointy TTR i legacy TM zostaly zachowane, ale nie ma egzekwowalnego terminu usuniecia.

Propozycja:
- Dodac metryke/licznik uzyc deprecated endpointow.
- Dopisac docelowa date lub warunek usuniecia.
- Dodac test, ze nowe UI nie korzysta z legacy endpointow poza zamierzonymi ekranami.

## Sugerowana kolejnosc prac

1. Naprawic lokalny Docker/README/env, zeby nowa osoba mogla uruchomic aplikacje bez recznych domyslow.
2. Zaktualizowac OpenAPI + TS i doprowadzic `npm run check:openapi-routes` do zielonego wyniku.
3. Dodac CI z minimalnym zestawem: OpenAPI check, backend tests, frontend typecheck/build.
4. Rozstrzygnac security model dla mutacji.
5. Dopiero potem robic wiekszy refactor backendu i frontendowe testy komponentow.
