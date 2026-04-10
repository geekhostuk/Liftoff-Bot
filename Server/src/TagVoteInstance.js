/**
 * TagVoteInstance — per-room tag voting.
 *
 * Extracted from the former singleton tagVote.js.
 * Each room gets its own instance with independent vote state.
 */

const broadcast = require('./broadcast');
const db = require('./database');

const DEFAULT_VOTE_DURATION_MS = 120_000;
const PLAYER_COOLDOWN_MS = 5 * 60 * 1000;

class TagVoteInstance {
  /**
   * @param {string} roomId
   * @param {object} deps - { sendCommandToRoom, getOverseer }
   */
  constructor(roomId, deps) {
    this.roomId = roomId;
    this._deps = deps;

    this._vote = {
      active: false,
      options: [],
      votes: new Map(),
      expiresAt: null,
      timer: null,
      source: null,
    };

    this._lastPlayerVoteAt = 0;
  }

  init() {}

  getState() {
    if (!this._vote.active) {
      return { active: false, options: [], votes: {}, expires_at: null, room_id: this.roomId };
    }

    const tallies = {};
    for (const opt of this._vote.options) tallies[opt] = 0;
    for (const idx of this._vote.votes.values()) {
      if (idx >= 0 && idx < this._vote.options.length) {
        tallies[this._vote.options[idx]]++;
      }
    }

    return {
      active: true,
      options: this._vote.options,
      votes: tallies,
      total_votes: this._vote.votes.size,
      expires_at: this._vote.expiresAt ? this._vote.expiresAt.toISOString() : null,
      source: this._vote.source,
      room_id: this.roomId,
    };
  }

  startVote(tagOptions, durationMs = DEFAULT_VOTE_DURATION_MS, source = 'admin') {
    if (!tagOptions || tagOptions.length < 2) {
      throw new Error('At least 2 tag options are required');
    }
    if (tagOptions.length > 4) {
      throw new Error('Maximum 4 tag options allowed');
    }

    this.cancelVote();

    this._vote.active = true;
    this._vote.options = tagOptions.slice(0, 4);
    this._vote.votes.clear();
    this._vote.expiresAt = new Date(Date.now() + durationMs);
    this._vote.source = source;

    if (source === 'player') {
      this._lastPlayerVoteAt = Date.now();
    }

    const optStr = this._vote.options
      .map((t, i) => `<color=#00FF00>/${i + 1}</color> <color=#FFFF00>${t}</color>`)
      .join('  ');
    const durSec = Math.round(durationMs / 1000);
    this._deps.sendCommandToRoom({
      cmd: 'send_chat',
      message: `<color=#00BFFF>TAG VOTE</color> ${optStr}  <color=#FF0000>(${durSec}s)</color>`,
    });

    this._vote.timer = setTimeout(() => this._resolveVote(), durationMs);
    this._broadcastState();
  }

  cancelVote() {
    if (this._vote.timer) {
      clearTimeout(this._vote.timer);
      this._vote.timer = null;
    }
    const wasActive = this._vote.active;
    this._vote.active = false;
    this._vote.options = [];
    this._vote.votes.clear();
    this._vote.expiresAt = null;
    this._vote.source = null;
    if (wasActive) {
      this._broadcastState();
    }
  }

  handleNumberedVote(optionIndex, voterId) {
    if (!this._vote.active) return;
    if (optionIndex < 0 || optionIndex >= this._vote.options.length) return;

    const previousVote = this._vote.votes.get(voterId);
    this._vote.votes.set(voterId, optionIndex);

    if (previousVote === undefined) {
      const tallies = this._getTallies();
      const tallyStr = this._vote.options
        .map((t, i) => `<color=#FFFF00>${t}</color>:<color=#00FF00>${tallies[i]}</color>`)
        .join(' ');
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: `<color=#00BFFF>VOTE</color> ${tallyStr}`,
      });
    }

    this._broadcastState();
  }

  async handleTagVoteCommand(voterId) {
    if (this._vote.active) {
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: '<color=#FFFF00>A tag vote is already in progress.</color>',
      });
      return;
    }

    const elapsed = Date.now() - this._lastPlayerVoteAt;
    if (elapsed < PLAYER_COOLDOWN_MS) {
      const remaining = Math.ceil((PLAYER_COOLDOWN_MS - elapsed) / 1000);
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: `<color=#FFFF00>Tag vote cooldown — try again in ${remaining}s.</color>`,
      });
      return;
    }

    const overseer = this._deps.getOverseer();
    if (!overseer.getState().running) {
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>No track rotation is active — nothing to change.</color>',
      });
      return;
    }

    let tags;
    try {
      tags = await db.getTags();
    } catch {
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>Failed to load tags.</color>',
      });
      return;
    }

    if (tags.length < 2) {
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>Not enough tags defined (need at least 2).</color>',
      });
      return;
    }

    const shuffled = tags.sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, 4).map(t => t.name);
    this.startVote(options, DEFAULT_VOTE_DURATION_MS, 'player');
  }

  async handleTagsInfoCommand() {
    let tags;
    try {
      tags = await db.getTags();
    } catch {
      return;
    }

    if (tags.length === 0) {
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: '<color=#00BFFF>TAGS</color> <color=#FFFF00>No tags defined yet.</color>',
      });
      return;
    }

    const tagStr = tags.map(t => `<color=#00FF00>${t.name}</color>`).join(', ');
    this._deps.sendCommandToRoom({
      cmd: 'send_chat',
      message: `<color=#00BFFF>TAGS</color> ${tagStr}`,
    });
  }

  isActive() {
    return this._vote.active;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  _getTallies() {
    const tallies = new Array(this._vote.options.length).fill(0);
    for (const idx of this._vote.votes.values()) {
      if (idx >= 0 && idx < this._vote.options.length) {
        tallies[idx]++;
      }
    }
    return tallies;
  }

  async _resolveVote() {
    if (!this._vote.active) return;

    const tallies = this._getTallies();
    const maxVotes = Math.max(...tallies);

    if (maxVotes === 0) {
      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: '<color=#FF0000>TAG VOTE</color> <color=#FFFF00>No votes cast — vote cancelled.</color>',
      });
      this.cancelVote();
      return;
    }

    const winners = [];
    for (let i = 0; i < tallies.length; i++) {
      if (tallies[i] === maxVotes) winners.push(i);
    }

    const winnerIdx = winners[Math.floor(Math.random() * winners.length)];
    const winnerTag = this._vote.options[winnerIdx];
    const winnerVotes = tallies[winnerIdx];

    const tallyStr = this._vote.options
      .map((t, i) => `<color=#FFFF00>${t}</color>:<color=#00FF00>${tallies[i]}</color>`)
      .join(' ');
    this._deps.sendCommandToRoom({
      cmd: 'send_chat',
      message: `<color=#00FF00>TAG VOTE WON</color> <color=#00BFFF>${winnerTag}</color> <color=#FFFF00>(${winnerVotes} votes)</color> | ${tallyStr}`,
    });

    this.cancelVote();
    await this._loadTrackFromTag(winnerTag);
  }

  async _loadTrackFromTag(tagName) {
    try {
      const track = await db.getRandomTrackByTags([tagName], [], null);
      if (!track) {
        this._deps.sendCommandToRoom({
          cmd: 'send_chat',
          message: `<color=#FF0000>TAG VOTE</color> <color=#FFFF00>No tracks found for tag "${tagName}".</color>`,
        });
        return;
      }

      const overseer = this._deps.getOverseer();
      await overseer.enqueueTrack({
        env: track.env,
        track: track.track,
        race: 'InfiniteRace',
        local_id: track.local_id || '',
      });

      this._deps.sendCommandToRoom({
        cmd: 'send_chat',
        message: `<color=#00BFFF>TAG VOTE</color> <color=#FFFF00>Queued:</color> <color=#00FF00>${track.track}</color> <color=#FFFF00>(${track.env})</color>`,
      });
    } catch (err) {
      console.error(`[tag-vote:${this.roomId}] Error loading track from winning tag:`, err.message);
    }
  }

  _broadcastState() {
    broadcast.broadcastAll({ event_type: 'tag_vote_state', ...this.getState() });
  }
}

module.exports = TagVoteInstance;
