-- Custom roles for site users to access admin modules
CREATE TABLE IF NOT EXISTS custom_roles (
  id          SERIAL PRIMARY KEY,
  name        CITEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_role_permissions (
  id       SERIAL PRIMARY KEY,
  role_id  INTEGER NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  module   TEXT NOT NULL,
  UNIQUE(role_id, module)
);

-- Allow site users to be assigned a role (nullable = no admin access)
ALTER TABLE site_users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES custom_roles(id) ON DELETE SET NULL;
