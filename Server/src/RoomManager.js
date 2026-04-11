/**
 * RoomManager — central registry for rooms and their per-room service instances.
 *
 * Loaded at startup, it:
 *  1. Reads rooms + bot assignments from the database
 *  2. Creates a RoomContext for each room (overseer, votes, state)
 *  3. Wires the backward-compatible facades (trackOverseer, skipVote, etc.)
 *     to the default room's instances
 *  4. Provides fast getRoomForBot(botId) lookup used on every plugin event
 */

const db = require('./database');
const globalState = require('./state');
const RoomState = require('./RoomState');
const { TrackOverseerInstance, setCatalogCache, clearCatalogCache } = require('./TrackOverseerInstance');
const SkipVoteInstance = require('./SkipVoteInstance');
const ExtendVoteInstance = require('./ExtendVoteInstance');
const TagVoteInstance = require('./TagVoteInstance');

class RoomContext {
  constructor(roomId, config) {
    this.id = roomId;
    this.label = config.label || '';
    this.scoringMode = config.scoring_mode || 'room';
    this.botIds = new Set();
    this.roomState = new RoomState(roomId);

    // Service instances are created after deps are available (see _createServices)
    this.overseer = null;
    this.skipVote = null;
    this.extendVote = null;
    this.tagVote = null;
  }
}

class RoomManager {
  constructor() {
    this._rooms = new Map();       // roomId → RoomContext
    this._botToRoom = new Map();   // botId → roomId
    this._pluginSocketDeps = null; // set by wirePluginSocket()
  }

  /**
   * Provide pluginSocket functions needed by per-room services.
   * Must be called before init().
   */
  wirePluginSocket(deps) {
    this._pluginSocketDeps = deps;
  }

  /**
   * Load rooms and bots from DB, create per-room service instances,
   * wire backward-compatible facades to the default room.
   */
  async init() {
    if (!this._pluginSocketDeps) {
      throw new Error('RoomManager.wirePluginSocket() must be called before init()');
    }

    const rooms = await db.getAllRooms();
    const bots = await db.getAllBots();

    // Ensure default room exists
    if (!rooms.find(r => r.id === 'default')) {
      await db.addRoom('default', 'Main Room', 'global');
      rooms.push({ id: 'default', label: 'Main Room', scoring_mode: 'global' });
    }

    // Create room contexts
    for (const room of rooms) {
      const ctx = new RoomContext(room.id, room);
      this._createServices(ctx);
      this._rooms.set(room.id, ctx);
    }

    // Assign bots to rooms
    for (const bot of bots) {
      const roomId = bot.room_id || 'default';
      this._botToRoom.set(bot.id, roomId);
      const room = this._rooms.get(roomId);
      if (room) room.botIds.add(bot.id);
    }

    // Wire backward-compatible facades to default room
    const defaultRoom = this._rooms.get('default');
    if (defaultRoom) {
      require('./trackOverseer').setDefaultOverseer(defaultRoom.overseer);
      require('./skipVote').setDefaultSkipVote(defaultRoom.skipVote);
      require('./extendVote').setDefaultExtendVote(defaultRoom.extendVote);
      require('./tagVote').setDefaultTagVote(defaultRoom.tagVote);
    }

    // Resume all overseers
    for (const room of this._rooms.values()) {
      await room.overseer.tryResume();
    }

    console.log(`[RoomManager] Initialised ${this._rooms.size} room(s), ${bots.length} bot(s)`);
  }

  _createServices(ctx) {
    const ps = this._pluginSocketDeps;

    // Room-scoped command sender: sends to all bots in this room
    const sendCommandToRoom = (command) => {
      let sent = false;
      for (const botId of ctx.botIds) {
        if (ps.sendCommandToBot(botId, command)) sent = true;
      }
      return sent;
    };

    // Connected bot IDs for this room only
    const getConnectedBotIdsForRoom = () => {
      const connected = new Set(ps.getConnectedBotIds());
      return [...ctx.botIds].filter(id => connected.has(id));
    };

    const getConnectedBotCountForRoom = () => {
      const connected = new Set(ps.getConnectedBotIds());
      let count = 0;
      for (const id of ctx.botIds) {
        if (connected.has(id)) count++;
      }
      return count;
    };

    const getOnlinePlayerCountForRoom = () => {
      return globalState.getOnlinePlayerCountForRoom(ctx.botIds);
    };

    // Overseer
    ctx.overseer = new TrackOverseerInstance(ctx.id, {
      sendCommandToRoom,
      sendCommandAwaitToBot: ps.sendCommandAwaitToBot,
      getConnectedBotIdsForRoom,
      roomState: ctx.roomState,
      globalState,
      fireTemplates: ps.fireTemplates,
    });

    // Shared deps for vote instances
    const voteDeps = {
      sendCommandToRoom,
      getOnlinePlayerCountForRoom,
      getConnectedBotCountForRoom,
      getOverseer: () => ctx.overseer,
      getRoomState: () => ctx.roomState,
    };

    ctx.skipVote = new SkipVoteInstance(ctx.id, voteDeps);
    ctx.extendVote = new ExtendVoteInstance(ctx.id, voteDeps);
    ctx.tagVote = new TagVoteInstance(ctx.id, {
      sendCommandToRoom,
      getOverseer: () => ctx.overseer,
    });

    // Cancel votes when overseer stops
    ctx.overseer.onStop(() => {
      ctx.skipVote.cancelSkipVote();
      ctx.extendVote.cancelExtendVote();
      ctx.tagVote.cancelVote();
    });
  }

  // ── Lookup ─────────────────────────────────────────────────────────────────

  getRoomForBot(botId) {
    const roomId = this._botToRoom.get(botId) || 'default';
    return this._rooms.get(roomId) || this._rooms.get('default');
  }

  getRoom(roomId) {
    return this._rooms.get(roomId) || null;
  }

  getAllRooms() {
    return [...this._rooms.values()];
  }

  getDefaultRoom() {
    return this._rooms.get('default');
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async addRoom(id, label, scoringMode) {
    if (this._rooms.has(id)) throw new Error(`Room "${id}" already exists`);
    await db.addRoom(id, label, scoringMode);
    const ctx = new RoomContext(id, { label, scoring_mode: scoringMode });
    this._createServices(ctx);
    this._rooms.set(id, ctx);
    console.log(`[RoomManager] Created room "${id}"`);
    return ctx;
  }

  async updateRoom(id, fields) {
    await db.updateRoom(id, fields);
    const ctx = this._rooms.get(id);
    if (ctx) {
      if (fields.label !== undefined) ctx.label = fields.label;
      if (fields.scoring_mode !== undefined) ctx.scoringMode = fields.scoring_mode;
    }
  }

  async removeRoom(id) {
    await db.removeRoom(id); // throws if bots still assigned or id=default
    const ctx = this._rooms.get(id);
    if (ctx) {
      ctx.overseer.stop();
      ctx.skipVote.cancelSkipVote();
      ctx.extendVote.cancelExtendVote();
      ctx.tagVote.cancelVote();
    }
    this._rooms.delete(id);
    console.log(`[RoomManager] Removed room "${id}"`);
  }

  async assignBotToRoom(botId, roomId) {
    if (!this._rooms.has(roomId)) throw new Error(`Room "${roomId}" not found`);

    // Remove from old room
    const oldRoomId = this._botToRoom.get(botId);
    if (oldRoomId) {
      const oldRoom = this._rooms.get(oldRoomId);
      if (oldRoom) oldRoom.botIds.delete(botId);
    }

    // Assign to new room
    await db.assignBotToRoom(botId, roomId);
    this._botToRoom.set(botId, roomId);
    const newRoom = this._rooms.get(roomId);
    if (newRoom) newRoom.botIds.add(botId);

    console.log(`[RoomManager] Bot "${botId}" assigned to room "${roomId}"`);
  }

  /**
   * Called when a new bot is registered (from admin API).
   * Ensures the bot-to-room mapping is in sync.
   */
  registerBot(botId, roomId = 'default') {
    this._botToRoom.set(botId, roomId);
    const room = this._rooms.get(roomId);
    if (room) room.botIds.add(botId);
  }

  /**
   * Called when a bot is removed (from admin API).
   */
  unregisterBot(botId) {
    const roomId = this._botToRoom.get(botId);
    if (roomId) {
      const room = this._rooms.get(roomId);
      if (room) room.botIds.delete(botId);
    }
    this._botToRoom.delete(botId);
  }

  // ── Snapshot (for live socket / admin state) ──────────────────────────────

  getRoomsSnapshot() {
    const rooms = [];
    for (const ctx of this._rooms.values()) {
      rooms.push({
        room_id: ctx.id,
        label: ctx.label,
        scoring_mode: ctx.scoringMode,
        bot_ids: [...ctx.botIds],
        current_track: ctx.roomState.getCurrentTrack(),
        track_since: ctx.roomState.getCurrentTrackSince(),
        online_players: globalState.getOnlinePlayersForRoom(ctx.botIds),
        overseer: ctx.overseer.getState(),
        tag_vote: ctx.tagVote.getState(),
      });
    }
    return rooms;
  }
}

// Singleton instance
const roomManager = new RoomManager();

module.exports = roomManager;
