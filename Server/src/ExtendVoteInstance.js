/**
 * ExtendVoteInstance — per-room extend voting.
 *
 * Extracted from the former singleton extendVote.js.
 * Each room gets its own instance with independent vote state.
 */

const EXTEND_VOTE_TIMEOUT_MS = 180_000;
const EXTEND_AMOUNT_MS = 5 * 60 * 1000;

class ExtendVoteInstance {
  /**
   * @param {string} roomId
   * @param {object} deps - { sendCommandToRoom, getOnlinePlayerCountForRoom, getConnectedBotCountForRoom, getOverseer, getRoomState }
   */
  constructor(roomId, deps) {
    this.roomId = roomId;
    this._deps = deps;

    this._vote = {
      active: false,
      voters: new Set(),
      timer: null,
    };
  }

  init() {}

  cancelExtendVote() {
    this._vote.active = false;
    this._vote.voters.clear();
    if (this._vote.timer) {
      clearTimeout(this._vote.timer);
      this._vote.timer = null;
    }
  }

  getExtendVoteInfo() {
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

  handleExtendVoteCommand(voterId) {
    const overseer = this._deps.getOverseer();
    if (!overseer.getState().extend_vote_enabled) {
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>EXTEND</color> <color=#FFFF00>Extend voting is disabled.</color>' });
      return;
    }
    const runner = this._getActiveRunner();
    if (!runner) {
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>EXTEND</color> <color=#FFFF00>No track rotation is running — nothing to extend.</color>' });
      return;
    }

    if (this._vote.active) {
      if (this._vote.voters.has(voterId)) {
        this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FFFF00>You have already voted.</color>' });
        return;
      }
      this._vote.voters.add(voterId);
      const { needed } = this.getExtendVoteInfo();
      const have = this._vote.voters.size;
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: `<color=#00BFFF>EXTEND VOTE</color> <color=#00FF00>${have}/${needed}</color>` });
      this._checkThreshold();
      return;
    }

    this._vote.active = true;
    this._vote.voters.clear();
    this._vote.voters.add(voterId);

    const { realPlayers, needed } = this.getExtendVoteInfo();
    this._deps.sendCommandToRoom({ cmd: 'send_chat', message: `<color=#00FF00>EXTEND VOTE</color> <color=#FFFF00>Need</color> <color=#00BFFF>${needed}/${realPlayers}</color> <color=#FFFF00>— Type /extend</color> <color=#FF0000>(3m)</color>` });

    this._checkThreshold();

    this._vote.timer = setTimeout(() => {
      if (this._vote.active) {
        this.cancelExtendVote();
        this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>EXTEND VOTE</color> <color=#FFFF00>Extend vote expired.</color>' });
      }
    }, EXTEND_VOTE_TIMEOUT_MS);
  }

  _checkThreshold() {
    const { realPlayers, needed } = this.getExtendVoteInfo();
    if (realPlayers === 0) return;
    if (this._vote.voters.size >= needed) {
      this.cancelExtendVote();
      const runner = this._getActiveRunner();
      if (!runner) {
        this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#FF0000>EXTEND</color> <color=#FFFF00>Vote passed but nothing is running.</color>' });
        return;
      }
      this._deps.sendCommandToRoom({ cmd: 'send_chat', message: '<color=#00FF00>VOTE PASSED</color> <color=#FFFF00>Adding 5 minutes to the current track.</color>' });
      runner.extendTimer(EXTEND_AMOUNT_MS);
      const roomState = this._deps.getRoomState();
      const trackToExtend = roomState ? roomState.getCurrentTrack() : null;
      if (trackToExtend && trackToExtend.env) {
        const db = require('./database');
        db.incrementExtendCount(trackToExtend.env, trackToExtend.track)
          .catch(err => console.error('[extendVote] persist extend count failed:', err));
      }
    }
  }

  isActive() {
    return this._vote.active;
  }
}

module.exports = ExtendVoteInstance;
