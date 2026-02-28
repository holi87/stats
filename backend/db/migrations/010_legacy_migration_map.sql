CREATE TABLE IF NOT EXISTS legacy_migration_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  source_id uuid NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_migration_map_source_unique UNIQUE (source_system, source_id)
);
