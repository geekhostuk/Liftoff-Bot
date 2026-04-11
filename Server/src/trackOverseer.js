/**
 * Track Overseer — backward-compatible facade.
 *
 * All methods delegate to the default room's TrackOverseerInstance via
 * RoomManager.  Code that already does require('./trackOverseer') continues
 * to work unchanged.
 *
 * For room-scoped access, use RoomManager directly:
 *   roomManager.getRoom(roomId).overseer
 */

const { setCatalogCache, clearCatalogCache } = require('./TrackOverseerInstance');

// Lazy reference — set by RoomManager.init() via setDefaultOverseer()
let _default = null;
let _pendingOnStopCb = null;

function setDefaultOverseer(instance) {
  _default = instance;
  // Apply any onStop callback that was registered before init
  if (_pendingOnStopCb) {
    instance.onStop(_pendingOnStopCb);
    _pendingOnStopCb = null;
  }
}

function _get() {
  if (!_default) throw new Error('Track overseer not initialised — RoomManager.init() has not run');
  return _default;
}

// Retained for call-site compatibility (realtime/index.js calls init())
function init() {}

function getState()                    { return _get().getState(); }
function startPlaylist(...args)        { return _get().startPlaylist(...args); }
function startTagMode(...args)         { return _get().startTagMode(...args); }
function stop()                        { return _get().stop(); }
function onStop(cb) {
  if (_default) return _default.onStop(cb);
  // Store for later — RoomManager hasn't initialized yet
  _pendingOnStopCb = cb;
}
function skipToNext()                  { return _get().skipToNext(); }
function skipToIndex(idx)              { return _get().skipToIndex(idx); }
function extendTimer(ms)               { return _get().extendTimer(ms); }
function enqueueTrack(info)            { return _get().enqueueTrack(info); }
function addToPlaylistQueue(...args)   { return _get().addToPlaylistQueue(...args); }
function removeFromPlaylistQueue(id)   { return _get().removeFromPlaylistQueue(id); }
function reorderPlaylistQueue(id, d)   { return _get().reorderPlaylistQueue(id, d); }
function clearPlaylistQueue()          { return _get().clearPlaylistQueue(); }
function getUpcoming(count)            { return _get().getUpcoming(count); }
function tryResume()                   { return _get().tryResume(); }
function setSkipVoteEnabled(e)         { return _get().setSkipVoteEnabled(e); }
function setExtendVoteEnabled(e)       { return _get().setExtendVoteEnabled(e); }

module.exports = {
  init,
  getState,
  startPlaylist,
  startTagMode,
  stop,
  onStop,
  skipToNext,
  skipToIndex,
  extendTimer,
  enqueueTrack,
  addToPlaylistQueue,
  removeFromPlaylistQueue,
  reorderPlaylistQueue,
  clearPlaylistQueue,
  getUpcoming,
  tryResume,
  setSkipVoteEnabled,
  setExtendVoteEnabled,
  setCatalogCache,
  clearCatalogCache,
  // Used by RoomManager to wire up the default instance
  setDefaultOverseer,
};
