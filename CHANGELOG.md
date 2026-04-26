# Changelog

## 2026-04-26

### Operability and safety
- Added admin-token enforcement for write endpoints and a frontend admin-token control.
- Added `/api/v1/ready` to validate DB/schema readiness separately from liveness.
- Aligned local Docker Compose defaults around ports 8500/8501 and local API base URL.
- Switched Dockerfiles and Compose bootstrap commands toward `npm ci`.

### Contracts and delivery
- Documented admin data endpoints and option mutation endpoints in OpenAPI.
- Updated multiplayer game schemas and error codes in OpenAPI.
- Added CI test/build gate before Docker image publishing.
- Replaced frontend `tsc -b` build step with explicit typecheck scripts.

### Data and maintenance
- Stabilized multiplayer match pagination ordering and added supporting indexes.
- Added admin import diff preview and export collection metadata.
- Removed stale Prisma schema from the raw-SQL backend.

## 2026-02-28

### Data safety and rollout
- Added production-safe feature flags for ranking, TM simple mode, multi-option mode, and admin data transfer.
- Kept schema changes backward-compatible (`016_multiplayer_options_mode.sql`), with no backfill and no destructive data operations.
- Added safe behavior to preserve legacy calculator detail rows when editing TM matches in simple mode.

### Multiplayer ranking and TM behavior
- Switched tie handling to competition ranking (olympic ranking) by default.
- Changed default TM flow to simple points (`totalPoints`) in frontend and backend.
- Kept legacy TM calculator path behind feature flag for fast rollback.
- Updated multiplayer/TTR stats and podium aggregations to recompute places from `total_points`
  (ignoring legacy inconsistent stored `place` values).

### Game options (add-ons)
- Added support for both modes:
  - exclusive single option (`optionsExclusive=true`),
  - multi-select options (`optionsExclusive=false`).
- Extended match API payload support with `optionIds` (legacy `optionId` remains compatible).
- Updated UI rendering to use select/radio for exclusive mode and checkboxes for multi mode.
- Added dedicated game edit screen in admin and changed `Edytuj` action on games list to navigate to that screen.
- Added game option rename endpoint (`PATCH /api/v1/multiplayer/games/:code/options/:optionId`).
- Base option (`Podstawa`/`base`) is now treated as implicit:
  - not required in match create/edit forms,
  - hidden in option filters and option-specific stats sections.
- Added per-game calculator button configuration:
  - admin can set `calculatorButtonLabel` and `calculatorUrl`,
  - match results page shows calculator button when URL is configured,
  - local URL values are treated as app-relative paths (e.g. `costam` -> `/costam`).

### Admin export/import
- Added admin JSON export endpoint.
- Added admin JSON import endpoint with:
  - schema validation,
  - reference validation,
  - dry-run mode,
  - production safeguards (token, confirmation, payload limits, rate limiting).

### Tests
- Updated multiplayer tests for:
  - competition ranking ties,
  - multiple tie groups in one match,
  - TM simple mode,
  - option multi-select and exclusive validation,
  - preserving legacy TM detail rows on update in simple mode.
