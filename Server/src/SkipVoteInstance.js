/**
 * SkipVoteInstance — per-room skip voting.
 *
 * Extracted from the former singleton skipVote.js.
 * Each room gets its own instance with independent vote state.
 */

const SKIP_VOTE_TIMEOUT_MS = 180_000;

class SkipVoteInstance {
  /**
   * @param {string} roomId
   * @param {object} deps - { sendCommandToRoom, getOnlinePlayerCountForRoom, getConnectedBotCountForRoom, getOverseer }
   */
  constructor(roomId, deps) {
    this.roomId = roomId;
    this._deps = deps;

    this._vote = {
      active: false,
      voters: new Set(),
      timer: null,
    };
    this._skipDelayTimer = null;
  }

  init() {
    // No-op — deps injected via constructor
  }

  cancelSkipVote() {
    this._vote.active = false;
    this._vote.voters.clear();
    if (this._vote.timer) {
      clearTimeout(this._vote.timer);
      this._vote.timer = null;
    }
    if (this._skipDelayTimer) {
      clearTimeout(this._skipDelayTimer);
      this._skipDelayTimer = null;
    }
  }

  getSkipVoteInfo() {
    const total = this._deps.getOnlinePlayerCountForRoom();
    const botCount = this._deps.getConnectedBotCountForRoom() || 1;
    const realPlayers = Math.max(total - botCount, 0);
    const needed = realPlayers <= 1 ? 1 : Math.max(Math.floor(realPlayers / 2), 2);
    return { realPlayers, needed };
  }

  _getActiveRunner() {
    const overseer = this._deps.getOverseer();
    if (overseer.getState().running) return overseer;
    return null;
  }

  handleSkipVoteCommand(voterId) {
    const overseer = this._deps.getOverseer();
    if (!overseer.getState().skip_vote_enabled) {
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>SKIP</color> <color=#FFFF00>Skip voting is disabled.</color>' });
      return;
    }
    const runner = this._getActiveRunner();
    if (!runner) {
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>SKIP</color> <color=#FFFF00>No track rotation is running — nothing to skip.</color>' });
      return;
    }

    if (this._vote.active) {
      if (this._vote.voters.has(voterId)) {
        this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FFFF00>You have already voted.</color>' });
        return;
      }
      this._vote.voters.add(voterId);
      const { needed } = this.getSkipVoteInfo();
      const have = this._vote.voters.size;
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: `<color=#00BFFF>SKIP VOTE</color> <color=#00FF00>${have}/${needed}</color>` });
      this._checkThreshold();
      return;
    }

    // Start a new vote
    this._vote.active = true;
    this._vote.voters.clear();
    this._vote.voters.add(voterId);

    const { realPlayers, needed } = this.getSkipVoteInfo();
    this._deps.sendCommandToRoom({ cmd: 'send_chat', message: `<color=#00FF00>SKIP VOTE</color> <color=#FFFF00>Need</color> <color=#00BFFF>${needed}/${realPlayers}</color> <color=#FFFF00>— Type /next</color> <color=#FF0000>(3m)</color>` });

    this._checkThreshold();

    this._vote.timer = setTimeout(() => {
      if (this._vote.active) {
        this.cancelSkipVote();
        this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>SKIP VOTE</color> <color=#FFFF00>Skip vote expired.</color>' });
      }
    }, SKIP_VOTE_TIMEOUT_MS);
  }

  _checkThreshold() {
    const { realPlayers, needed } = this.getSkipVoteInfo();
    if (realPlayers === 0) return;
    if (this._vote.voters.size >= needed) {
      this.cancelSkipVote();
      const runner = this._getActiveRunner();
      if (!runner) {
        this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>SKIP</color> <color=#FFFF00>Vote passed but nothing is running.</color>' });
        return;
      }
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#00FF00>VOTE PASSED</color> <color=#FFFF00>Track will change in 10 seconds...</color>' });
      const roomState = this._deps.getRoomState();
      const trackToSkip = roomState ? roomState.getCurrentTrack() : null;
      this._skipDelayTimer = setTimeout(() => {
        this._skipDelayTimer = null;
        const current = this._getActiveRunner();
        if (!current) return;
        current.skipToNext();
      }, 10_000);
      if (trackToSkip && trackToSkip.env) {
        const db = require('./database');
        db.incrementSkipCount(trackToSkip.env, trackToSkip.track)
          .catch(err => console.error('[skipVote] persist skip count failed:', err));
      }
    }
  }

  isActive() {
    return this._vote.active;
  }
}

module.exports = SkipVoteInstance;
