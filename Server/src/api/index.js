/**
 * API Server
 *
 * Owns all REST API endpoints (public + admin), authentication/sessions,
 * and database reads/writes (CRUD). Delegates plugin commands and domain
 * service operations to the realtime server via internal HTTP API.
 *
 * No WebSocket servers, no domain services, no in-memory state.
 */

require('dotenv').config();

const http = require('http');
const express = require('express');
const { initDatabase } = require('../database');
const { hashPassword } = require('../auth');

async function main() {
  // ── Database ──────────────────────────────────────────────────────────────
  await initDatabase();

  // Auto-seed the first admin user from env vars (only when no users exist)
  const { getUserCount, createUser } = require('../database');
  if ((await getUserCount()) === 0 && process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    const user = await createUser(process.env.ADMIN_USER, hashPassword(process.env.ADMIN_PASS));
    console.log(`[auth] Auto-created admin user: ${user.username}`);
  }

  // ── HTTP + Express ────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // Routes
  const adminRoutes = require('./routes/admin');
  const publicRoutes = require('./routes/public');

  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);

  // JSON error handler — must be after all routes
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  const server = http.createServer(app);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`[api] API server running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('[api] Fatal error during startup:', err);
  process.exit(1);
});
