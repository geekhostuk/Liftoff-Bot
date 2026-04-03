/**
 * Skip-vote module.
 *
 * Manages the in-game /next chat command that lets players collectively
 * vote to skip the current playlist track. The first /next starts a vote;
 * subsequent /next commands from other players count as additional votes.
 *
 * Dependencies are injected via init() so this module stays decoupled
 * from the WebSocket transport layer.
 */

const state = require('./state');

const SKIP_VOTE_TIMEOUT_MS = 180_000; // votes expire after 3 minutes

const skipVote = {
  active: false,
  voters: new Set(), // voter keys (user_id or nick) who have voted
  timer: null,
};

let _skipDelayTimer = null; // the 10-second delay after a successful vote

let _sendCommand = null;

/**
 * Initialise the module with a sendCommand function (from pluginSocket).
 */
function init(sendCommandFn) {
  _sendCommand = sendCommandFn;
}

function cancelSkipVote() {
  skipVote.active = false;
  skipVote.voters.clear();
  if (skipVote.timer) {
    clearTimeout(skipVote.timer);
    skipVote.timer = null;
  }
  if (_skipDelayTimer) {
    clearTimeout(_skipDelayTimer);
    _skipDelayTimer = null;
  }
}

function getSkipVoteInfo() {
  const total = state.getOnlinePlayerCount();
  const { getConnectedBotCount } = require('./pluginSocket');
  const botCount = getConnectedBotCount() || 1;
  const realPlayers = Math.max(total - botCount, 0); // exclude all bot host players
  const needed = realPlayers <= 1 ? 1 : Math.max(Math.floor(realPlayers / 2), 2);
  return { realPlayers, needed };
}

function _getActiveRunner() {
  const overseer = require('./trackOverseer');
  if (overseer.getState().running) return overseer;
  return null;
}

function handleSkipVoteCommand(voterId) {
  const overseer = require('./trackOverseer');
  if (!overseer.getState().skip_vote_enabled) {
    _sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>SKIP</color> <color=#FFFF00>Skip voting is disabled.</color>' });
    return;
  }
  const runner = _getActiveRunner();
  if (!runner) {
    _sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>SKIP</color> <color=#FFFF00>No track rotation is running — nothing to skip.</color>' });
    return;
  }

  if (skipVote.active) {
    if (skipVote.voters.has(voterId)) {
      _sendCommand({ cmd: 'send_chat', message: '<color=#FFFF00>You have already voted.</color>' });
      return;
    }
    skipVote.voters.add(voterId);
    const { needed } = getSkipVoteInfo();
    const have = skipVote.voters.size;
    _sendCommand({ cmd: 'send_chat', message: `<color=#00BFFF>SKIP VOTE</color> <color=#00FF00>${have}/${needed}</color>` });
    checkSkipVoteThreshold();
    return;
  }

  // Start a new vote
  skipVote.active = true;
  skipVote.voters.clear();
  skipVote.voters.add(voterId); // the initiator counts as a vote

  const { realPlayers, needed } = getSkipVoteInfo();
  _sendCommand({ cmd: 'send_chat', message: `<color=#00FF00>SKIP VOTE</color> <color=#FFFF00>Need</color> <color=#00BFFF>${needed}/${realPlayers}</color> <color=#FFFF00>— Type /next</color> <color=#FF0000>(3m)</color>` });

  // Check immediately in case threshold already met
  checkSkipVoteThreshold();

  skipVote.timer = setTimeout(() => {
    if (skipVote.active) {
      cancelSkipVote();
      _sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>SKIP VOTE</color> <color=#FFFF00>Skip vote expired.</color>' });
    }
  }, SKIP_VOTE_TIMEOUT_MS);
}

function checkSkipVoteThreshold() {
  const { realPlayers, needed } = getSkipVoteInfo();
  if (realPlayers === 0) return;
  if (skipVote.voters.size >= needed) {
    cancelSkipVote();
    const runner = _getActiveRunner();
    if (!runner) {
      _sendCommand({ cmd: 'send_chat', message: '<color=#FF0000>SKIP</color> <color=#FFFF00>Vote passed but nothing is running.</color>' });
      return;
    }
    _sendCommand({ cmd: 'send_chat', message: '<color=#00FF00>VOTE PASSED</color> <color=#FFFF00>Track will change in 10 seconds...</color>' });
    const trackToSkip = state.getCurrentTrack();
    _skipDelayTimer = setTimeout(() => {
      _skipDelayTimer = null;
      const current = _getActiveRunner();
      if (!current) return;
      current.skipToNext();
    }, 10_000);
    if (trackToSkip) {
      const db = require('./database');
      db.incrementSkipCount(trackToSkip.env, trackToSkip.track)
        .catch(err => console.error('[skipVote] persist skip count failed:', err));
    }
  }
}

/**
 * Whether a skip vote is currently active.
 */
function isActive() {
  return skipVote.active;
}

module.exports = {
  init,
  isActive,
  cancelSkipVote,
  handleSkipVoteCommand,
};
