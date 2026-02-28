# MIGRATION LOG: game-stats (RPi5 -> Mac)

Date: 2026-02-26
Source host: rpi5 (gh@10.10.10.44)
Target host: mac (qualitycat@10.10.10.8)

## 1) Inwentaryzacja na RPi5
- Stack path: `/home/gh/srv/game-stats`
- Kontenery źródłowe (docker ps):
  - `game-stats-frontend-1` (5173)
  - `game-stats-backend-1` (3002)
  - `game-stats-postgres-1` (5432)
- Pliki konfiguracyjne:
  - `docker-compose.yml`
  - `.env`
- Snapshot na Macu:
  - `~/srv/tools/game-stats/rpi5_snapshot/`

## 2) Konfiguracja stacka (compose config)
Wykryte ustawienia:
- Domena hosta: `stats.sh.info.pl`
- Backend rule: `Host(stats.sh.info.pl) && PathPrefix(/api)`
- Frontend rule: `Host(stats.sh.info.pl)`
- DB service: `postgres`
- DB credentials:
  - `POSTGRES_DB=gamestats`
  - `POSTGRES_USER=gamestats`
  - `POSTGRES_PASSWORD=gamestats`
- Internal backend port: `3002`
- Internal frontend port: `5173`

## 3) Backup DB (NO DATA LOSS)
Wykonano backup na RPi5:
- `docker compose exec -T postgres pg_dump -U gamestats -d gamestats --format=custom > ./_backup/game-stats.pgdump`
- Plik: `/home/gh/srv/game-stats/_backup/game-stats.pgdump`
- Rozmiar: `55194 bytes`

Skopiowano backup na Mac:
- `~/srv/tools/game-stats/_backup/game-stats.pgdump`
- Rozmiar: `55194 bytes`

## 4) Inne dane trwałe
Mounty/wolumeny:
- `postgres`: named volume `game-stats_db-data` (trwałe dane)
- `backend`: bind `./backend` + anonymous volume `/app/node_modules`
- `frontend`: bind `./frontend` + anonymous volume `/app/node_modules`

Wniosek:
- Poza DB brak osobnych produkcyjnych danych typu uploads/storage do przeniesienia.

## 5) Przygotowanie stacka na Macu
Docelowy katalog:
- `~/srv/tools/game-stats`

Utworzony docelowy compose:
- `~/srv/tools/game-stats/compose.yml`

Zmiany względem RPi5:
- usunięte `traefik labels`
- usunięta sieć `proxy`
- host ports:
  - backend -> `8500:${BACKEND_PORT:-3002}`
  - frontend -> `8501:${FRONTEND_PORT:-5173}`
- DB bez publikacji portu na host
- DATABASE_URL zachowuje połączenie `@postgres:5432` (nie localhost)

Uruchomienie:
- `docker compose -f compose.yml pull`
- `docker compose -f compose.yml up -d`

## 6) Restore DB na Macu
Wykonano:
- stop `frontend`, `backend`
- `pg_restore --clean --if-exists` do kontenera postgres
- weryfikacja tabel (`\dt`)

Wynik `\dt`:
- 18 tabel, m.in. `games`, `players`, `matches`, `multiplayer_*`, `ticket_to_ride_*`, `schema_migrations`

## 7) Testy lokalne na Macu
- `curl -I http://127.0.0.1:8501` -> `HTTP/1.1 200 OK`
- `curl -I http://127.0.0.1:8500` -> `HTTP/1.1 404 Not Found` (port reachable)
- `curl http://127.0.0.1:8500/api/v1/health` -> `{"status":"ok"}`

## 8) Testy LAN (RPi5 -> Mac)
- `curl -I http://10.10.10.8:8501` -> `HTTP/1.1 200 OK`
- `curl -I http://10.10.10.8:8500` -> `HTTP/1.1 404 Not Found`
- `curl http://10.10.10.8:8500/api/v1/health` -> `{"status":"ok"}`

## 9) Traefik file provider na RPi5
Katalog dynamic:
- `/home/gh/srv/traefik/dynamic`

Dodany plik:
- `/home/gh/srv/traefik/dynamic/game-stats-mac.yml`

Konfiguracja routerów:
- `Host(stats.sh.info.pl)` -> `http://10.10.10.8:8501`
- `Host(stats.sh.info.pl) && PathPrefix(/api)` -> `http://10.10.10.8:8500`
- Priorytety ustawione wyżej (`200`/`300`) aby przejąć ruch przed wyłączeniem starego stacka.

## 10) Testy Host header (RPi5)
Przed wyłączeniem starego stacka:
- `curl -I -H "Host: stats.sh.info.pl" http://127.0.0.1` -> `HTTP/1.1 200 OK`
- `curl -I -H "Host: stats.sh.info.pl" http://127.0.0.1/api/v1/health` -> `HTTP/1.1 200 OK`

Po wyłączeniu starego stacka:
- `curl -I -H "Host: stats.sh.info.pl" http://127.0.0.1` -> `HTTP/1.1 200 OK`
- `curl -I -H "Host: stats.sh.info.pl" http://127.0.0.1/api/v1/health` -> `HTTP/1.1 200 OK`

## 11) Wyłączenie starej instancji na RPi5
Wykonano:
- `cd /home/gh/srv/game-stats && docker compose down`

Weryfikacja:
- `docker compose ps` -> brak kontenerów game-stats
- `docker ps | grep game-stats` -> brak uruchomionych kontenerów
- wolumen `game-stats_db-data` pozostał (nieusunięty)

## 12) Cloudflare / cloudflared
- Brak zmian (zgodnie z wymaganiami)

## 13) Final verification snapshot
- Mac services:
  - backend `0.0.0.0:8500->3002`
  - frontend `0.0.0.0:8501->5173`
  - postgres healthy (internal)
- RPi5 old stack:
  - `docker compose ps` in `/home/gh/srv/game-stats` -> no containers
- Curl checks from RPi5:
  - LAN frontend -> `HTTP/1.1 200 OK`
  - LAN backend -> `HTTP/1.1 404 Not Found`
  - LAN backend health -> `{"status":"ok"}`
  - Host frontend -> `HTTP/1.1 200 OK`
  - Host API health -> `HTTP/1.1 200 OK`
