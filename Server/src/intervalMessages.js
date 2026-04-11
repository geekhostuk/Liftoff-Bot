/**
 * IntervalScheduler — fires interval-based chat templates per-room.
 *
 * Templates with trigger='interval' repeat every interval_ms milliseconds,
 * but only when the room has online players. Each room gets its own set of
 * timers so variables resolve to room-specific data (playlist, standings, etc.).
 */

const db = require('./database');

class IntervalScheduler {
  /**
   * @param {object} roomManager - RoomManager singleton
   * @param {object} state - global state module (for online player counts)
   * @param {Function} fireTemplatesFn - pluginSocket.fireTemplates function
   */
  constructor(roomManager, state, fireTemplatesFn) {
    this._roomManager = roomManager;
    this._state = state;
    this._fireTemplates = fireTemplatesFn;
    // Map<templateId, intervalHandle>
    this._timers = new Map();
  }

  async init() {
    await this._startTimers();
    console.log(`[IntervalScheduler] Initialised with ${this._timers.size} timer(s)`);
  }

  /** Reload templates from DB and restart all timers. Call after template CRUD. */
  async refresh() {
    this._clearAll();
    await this._startTimers();
    console.log(`[IntervalScheduler] Refreshed — ${this._timers.size} timer(s) active`);
  }

  stop() {
    this._clearAll();
    console.log('[IntervalScheduler] Stopped');
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  async _startTimers() {
    let templates;
    try {
      templates = await db.getIntervalTemplates();
    } catch (err) {
      console.error('[IntervalScheduler] Failed to load interval templates:', err.message);
      return;
    }

    for (const tmpl of templates) {
      const intervalMs = tmpl.interval_ms;
      if (!intervalMs || intervalMs < 10_000) continue; // Safety: minimum 10s

      const handle = setInterval(() => this._tick(tmpl), intervalMs);
      this._timers.set(tmpl.id, handle);
    }
  }

  /**
   * Fires a template into every room that has online players.
   * Each room resolves its own variables (playlist, standings, etc.).
   */
  async _tick(tmpl) {
    const ps = require('./pluginSocket');
    const connectedSet = new Set(ps.getConnectedBotIds());
    const rooms = this._roomManager.getAllRooms();

    for (const room of rooms) {
      // Only fire when players are online in this room
      const playerCount = this._state.getOnlinePlayerCountForRoom(room.botIds);
      if (playerCount === 0) continue;

      // Find a connected bot in this room for sending
      const connectedBots = [...room.botIds].filter(id => connectedSet.has(id));
      if (connectedBots.length === 0) continue;

      this._fireForRoom(tmpl, connectedBots, room.id);
    }
  }

  async _fireForRoom(tmpl, connectedBots, roomId) {
    try {
      const { buildTemplateVars, sendCommandToBot } = require('./pluginSocket');
      const enriched = await buildTemplateVars({}, roomId);

      let message = tmpl.template;
      for (const [key, val] of Object.entries(enriched)) {
        message = message.replaceAll(`{${key}}`, val ?? '');
      }
      message = message.trim();
      if (!message) return;

      // Send to all connected bots in this room
      for (const botId of connectedBots) {
        sendCommandToBot(botId, { cmd: 'send_chat', message });
      }
    } catch (err) {
      console.error(`[IntervalScheduler] Error firing template ${tmpl.id} in room "${roomId}":`, err.message);
    }
  }

  _clearAll() {
    for (const handle of this._timers.values()) {
      clearInterval(handle);
    }
    this._timers.clear();
  }
}

module.exports = IntervalScheduler;
