/**
 * Per-room state that was previously global in state.js.
 * Each RoomContext holds one RoomState instance.
 *
 * Global player tracking and bot track transitions remain in state.js
 * since they are keyed by botId (not room).
 */

const TRACK_CHANGE_CHAT_COOLDOWN_MS = 30_000;

class RoomState {
  constructor(roomId) {
    this.roomId = roomId;
    this.currentTrack = { env: null, track: null, race: null };
    this.currentTrackSince = null;
    this._chatCommandsAllowedFrom = 0;
    this._chatCooldownPerBot = new Map(); // botId → epoch ms
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  setCurrentTrack(info) {
    Object.assign(this.currentTrack, info);
    this.currentTrackSince = new Date().toISOString();
  }

  getCurrentTrackSince() {
    return this.currentTrackSince;
  }

  areChatCommandsAllowed(botId) {
    const now = Date.now();
    if (now < this._chatCommandsAllowedFrom) return false;
    if (botId) {
      const perBot = this._chatCooldownPerBot.get(botId) || 0;
      if (now < perBot) return false;
    }
    return true;
  }

  applyChatCooldown() {
    const until = Date.now() + TRACK_CHANGE_CHAT_COOLDOWN_MS;
    this._chatCommandsAllowedFrom = until;
    for (const [botId] of this._chatCooldownPerBot) {
      this._chatCooldownPerBot.set(botId, until);
    }
  }

  applyChatCooldownForBot(botId) {
    this._chatCooldownPerBot.set(botId, Date.now() + TRACK_CHANGE_CHAT_COOLDOWN_MS);
  }
}

module.exports = RoomState;
