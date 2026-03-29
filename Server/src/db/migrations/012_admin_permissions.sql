CREATE TABLE IF NOT EXISTS admin_permissions (
  id            SERIAL PRIMARY KEY,
  admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  module        TEXT NOT NULL,
  UNIQUE(admin_user_id, module)
);

-- Seed: grant all modules to existing admins
INSERT INTO admin_permissions (admin_user_id, module)
SELECT a.id, m.module FROM admin_users a
CROSS JOIN (VALUES
  ('dashboard'),('players'),('tracks'),('chat'),
  ('playlists'),('tags'),('track_manager'),('overseer'),
  ('scoring'),('competitions'),('auto_messages'),('users'),
  ('idle_kick')
) AS m(module)
ON CONFLICT DO NOTHING;

-- Make the first admin a superadmin
UPDATE admin_users SET role = 'superadmin'
WHERE id = (SELECT MIN(id) FROM admin_users);
