-- Stelic Dashboard Template Builder schema.
-- The API creates these tables automatically on first use. Running this file by hand
-- (Neon console, SQL editor) is optional.

CREATE TABLE IF NOT EXISTS projects (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  data        jsonb NOT NULL,          -- { name, by, sheets: [{ id, title, items: [...] }] }
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

CREATE TABLE IF NOT EXISTS visuals (
  id          text PRIMARY KEY,
  def         jsonb NOT NULL,          -- custom visual definition from the builder
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects (updated_at DESC);
