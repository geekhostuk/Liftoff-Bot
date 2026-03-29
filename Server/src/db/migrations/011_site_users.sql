CREATE TABLE IF NOT EXISTS site_users (
  id                   SERIAL PRIMARY KEY,
  email                CITEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  nickname             CITEXT UNIQUE,
  nick_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  nick_verify_code     TEXT,
  nick_verify_expires  TIMESTAMPTZ,
  email_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  email_verify_token   TEXT,
  email_verify_expires TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_users_email ON site_users (email);
CREATE INDEX IF NOT EXISTS idx_site_users_nickname ON site_users (nickname);
CREATE INDEX IF NOT EXISTS idx_site_users_verify_token ON site_users (email_verify_token);
