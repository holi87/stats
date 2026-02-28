# ROLLBACK: game-stats migration (Mac -> RPi5)

## Cel
Cofnąć routing z Maca i przywrócić działanie stacka `game-stats` na RPi5.

## 1) Cofnięcie Traefik dynamic (RPi5)
Wyłącz plik dynamic kierujący na Maca:
```bash
ssh rpi5 'mv /home/gh/srv/traefik/dynamic/game-stats-mac.yml /home/gh/srv/traefik/dynamic/game-stats-mac.yml.disabled'
```

## 2) Ponowne uruchomienie starego stacka na RPi5
```bash
ssh rpi5 'cd /home/gh/srv/game-stats && docker compose up -d && docker compose ps'
```

Uwaga:
- Wolumen danych DB (`game-stats_db-data`) pozostał na RPi5, więc dane powinny wrócić wraz ze stackiem.

## 3) Testy po rollbacku (Host header na RPi5)
```bash
ssh rpi5 'curl -sS -I -H "Host: stats.sh.info.pl" http://127.0.0.1 | head -n 20'
ssh rpi5 'curl -sS -I -H "Host: stats.sh.info.pl" http://127.0.0.1/api/v1/health | head -n 20'
```

Oczekiwane:
- Frontend: `HTTP/1.1 200 OK`
- API health: `HTTP/1.1 200 OK`

## 4) (Opcjonalnie) zatrzymanie stacka na Macu po rollbacku
```bash
cd ~/srv/tools/game-stats
docker compose -f compose.yml down
```
