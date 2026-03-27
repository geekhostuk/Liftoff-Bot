/**
 * Tag Vote module.
 *
 * Manages chat-based category voting where players (or admins) can trigger a
 * vote between tag options. Players type /1, /2, /3, /4 to cast their vote.
 * When the timer expires, the winning tag loads a random track.
 *
 * Dependencies are injected via init() so this module stays decoupled
 * from the WebSocket transport layer.
 */

const state = require('./state');
const broadcast = require('./broadcast');
const db = require('./database');

const DEFAULT_VOTE_DURATION_MS = 120_000; // 2 minutes
const PLAYER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between player-triggered votes

const vote = {
  active: false,
  options: [],       // tag name strings, max 4
  votes: new Map(),  // voterId → optionIndex (0-based)
  expiresAt: null,   // Date
  timer: null,
  source: null,      // 'admin' | 'player'
};

let _lastPlayerVoteAt = 0; // epoch ms of last player-triggered vote
let _sendCommand = null;

/**
 * Initialise the module with a sendCommand function (from pluginSocket).
 */
function init(sendCommandFn) {
  _sendCommand = sendCommandFn;
}

function getState() {
  if (!vote.active) {
    return { active: false, options: [], votes: {}, expires_at: null };
  }

  // Tally votes per option
  const tallies = {};
  for (const opt of vote.options) tallies[opt] = 0;
  for (const idx of vote.votes.values()) {
    if (idx >= 0 && idx < vote.options.length) {
      tallies[vote.options[idx]]++;
    }
  }

  return {
    active: true,
    options: vote.options,
    votes: tallies,
    total_votes: vote.votes.size,
    expires_at: vote.expiresAt ? vote.expiresAt.toISOString() : null,
    source: vote.source,
  };
}

/**
 * Start a tag vote.
 * @param {string[]} tagOptions - tag names to offer (max 4)
 * @param {number} durationMs - vote duration
 * @param {'admin'|'player'} source - who triggered it
 */
function startVote(tagOptions, durationMs = DEFAULT_VOTE_DURATION_MS, source = 'admin') {
  if (!tagOptions || tagOptions.length < 2) {
    throw new Error('At least 2 tag options are required');
  }
  if (tagOptions.length > 4) {
    throw new Error('Maximum 4 tag options allowed');
  }

  cancelVote();

  vote.active = true;
  vote.options = tagOptions.slice(0, 4);
  vote.votes.clear();
  vote.expiresAt = new Date(Date.now() + durationMs);
  vote.source = source;

  if (source === 'player') {
    _lastPlayerVoteAt = Date.now();
  }

  // Announce in chat
  const optStr = vote.options
    .map((t, i) => `<color=#00FF00>/${i + 1}</color> <color=#FFFF00>${t}</color>`)
    .join('  ');
  const durSec = Math.round(durationMs / 1000);
  _sendCommand({
    cmd: 'send_chat',
    message: `<color=#00BFFF>TAG VOTE</color> ${optStr}  <color=#FF0000>(${durSec}s)</color>`,
  });

  vote.timer = setTimeout(() => _resolveVote(), durationMs);

  _broadcastState();
}

/**
 * Cancel any active vote without resolving.
 */
function cancelVote() {
  if (vote.timer) {
    clearTimeout(vote.timer);
    vote.timer = null;
  }
  const wasActive = vote.active;
  vote.active = false;
  vote.options = [];
  vote.votes.clear();
  vote.expiresAt = null;
  vote.source = null;
  if (wasActive) {
    _broadcastState();
  }
}

/**
 * Handle a numbered vote command (/1, /2, /3, /4).
 * @param {number} optionIndex - 0-based index
 * @param {string} voterId - user_id or nick
 */
function handleNumberedVote(optionIndex, voterId) {
  if (!vote.active) return;
  if (optionIndex < 0 || optionIndex >= vote.options.length) return;

  const previousVote = vote.votes.get(voterId);
  vote.votes.set(voterId, optionIndex);

  if (previousVote === undefined) {
    // New vote — show tally
    const tallies = _getTallies();
    const tallyStr = vote.options
      .map((t, i) => `<color=#FFFF00>${t}</color>:<color=#00FF00>${tallies[i]}</color>`)
      .join(' ');
    _sendCommand({
      cmd: 'send_chat',
      message: `<color=#00BFFF>VOTE</color> ${tallyStr}`,
    });
  }

  _broadcastState();
}

/**
 * Handle the /tagvote chat command (player-triggered).
 * Starts a vote using all available tags.
 */
async function handleTagVoteCommand(voterId) {
  if (vote.active) {
    _sendCommand({
      cmd: 'send_chat',
      message: '<color=#FFFF00>A tag vote is already in progress.</color>',
    });
    return;
  }

  // Cooldown check
  const elapsed = Date.now() - _lastPlayerVoteAt;
  if (elapsed < PLAYER_COOLDOWN_MS) {
    const remaining = Math.ceil((PLAYER_COOLDOWN_MS - elapsed) / 1000);
    _sendCommand({
      cmd: 'send_chat',
      message: `<color=#FFFF00>Tag vote cooldown — try again in ${remaining}s.</color>`,
    });
    return;
  }

  // Check overseer is active
  const overseer = require('./trackOverseer');
  if (!overseer.getState().running) {
    _sendCommand({
      cmd: 'send_chat',
      message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>No track rotation is active — nothing to change.</color>',
    });
    return;
  }

  // Get all tags that have at least one track
  let tags;
  try {
    tags = await db.getTags();
  } catch {
    _sendCommand({
      cmd: 'send_chat',
      message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>Failed to load tags.</color>',
    });
    return;
  }

  if (tags.length < 2) {
    _sendCommand({
      cmd: 'send_chat',
      message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>Not enough tags defined (need at least 2).</color>',
    });
    return;
  }

  // Pick up to 4 random tags
  const shuffled = tags.sort(() => Math.random() - 0.5);
  const options = shuffled.slice(0, 4).map(t => t.name);

  startVote(options, DEFAULT_VOTE_DURATION_MS, 'player');
}

/**
 * Handle the /tags chat command — list available tags.
 */
async function handleTagsInfoCommand() {
  let tags;
  try {
    tags = await db.getTags();
  } catch {
    return;
  }

  if (tags.length === 0) {
    _sendCommand({
      cmd: 'send_chat',
      message: '<color=#00BFFF>TAGS</color> <color=#FFFF00>No tags defined yet.</color>',
    });
    return;
  }

  const tagStr = tags.map(t => `<color=#00FF00>${t.name}</color>`).join(', ');
  _sendCommand({
    cmd: 'send_chat',
    message: `<color=#00BFFF>TAGS</color> ${tagStr}`,
  });
}

/**
 * Whether a tag vote is currently active.
 */
function isActive() {
  return vote.active;
}

// ── Internals ────────────────────────────────────────────────────────────────

function _getTallies() {
  const tallies = new Array(vote.options.length).fill(0);
  for (const idx of vote.votes.values()) {
    if (idx >= 0 && idx < vote.options.length) {
      tallies[idx]++;
    }
  }
  return tallies;
}

async function _resolveVote() {
  if (!vote.active) return;

  const tallies = _getTallies();
  const maxVotes = Math.max(...tallies);

  if (maxVotes === 0) {
    // No votes cast
    _sendCommand({
      cmd: 'send_chat',
      message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>No votes cast — vote cancelled.</color>',
    });
    cancelVote();
    return;
  }

  // Find winners (may be tied)
  const winners = [];
  for (let i = 0; i < tallies.length; i++) {
    if (tallies[i] === maxVotes) winners.push(i);
  }

  // Random tiebreak
  const winnerIdx = winners[Math.floor(Math.random() * winners.length)];
  const winnerTag = vote.options[winnerIdx];
  const winnerVotes = tallies[winnerIdx];

  // Announce winner
  const tallyStr = vote.options
    .map((t, i) => `<color=#FFFF00>${t}</color>:<color=#00FF00>${tallies[i]}</color>`)
    .join(' ');
  _sendCommand({
    cmd: 'send_chat',
    message: `<color=#00FF00>TAG VOTE WON</color> <color=#00BFFF>${winnerTag}</color> <color=#FFFF00>(${winnerVotes} votes)</color> | ${tallyStr}`,
  });

  cancelVote();

  // Load a random track from the winning tag
  await _loadTrackFromTag(winnerTag);
}

async function _loadTrackFromTag(tagName) {
  try {
    const track = await db.getRandomTrackByTags([tagName], [], null);
    if (!track) {
      _sendCommand({
        cmd: 'send_chat',
        message: `<color=#FF0000>TAG VOTE</color> <color=#FFFF00>No tracks found for tag "${tagName}".</color>`,
      });
      return;
    }

    // Queue the winning track via the overseer — it plays next
    const overseer = require('./trackOverseer');
    await overseer.enqueueTrack({
      env: track.env,
      track: track.track,
      race: 'InfiniteRace',
      local_id: track.local_id || '',
    });

    _sendCommand({
      cmd: 'send_chat',
      message: `<color=#00BFFF>TAG VOTE</color> <color=#FFFF00>Queued:</color> <color=#00FF00>${track.track}</color> <color=#FFFF00>(${track.env})</color>`,
    });
  } catch (err) {
    console.error('[tag-vote] Error loading track from winning tag:', err.message);
  }
}

function _broadcastState() {
  broadcast.broadcastAll({ event_type: 'tag_vote_state', ...getState() });
}

module.exports = {
  init,
  getState,
  isActive,
  startVote,
  cancelVote,
  handleNumberedVote,
  handleTagVoteCommand,
  handleTagsInfoCommand,
};
