-- Create a separate database for Umami analytics
SELECT 'CREATE DATABASE umami OWNER liftoff'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec
