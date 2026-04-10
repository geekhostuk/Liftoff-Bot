/**
 * Extend-vote — backward-compatible facade.
 *
 * All methods delegate to the default room's ExtendVoteInstance via
 * RoomManager. Code that already does require('./extendVote') continues
 * to work unchanged.
 */

let _default = null;

function setDefaultExtendVote(instance) {
  _default = instance;
}

function init() {}
function isActive()                          { return _default ? _default.isActive() : false; }
function cancelExtendVote()                  { if (_default) _default.cancelExtendVote(); }
function handleExtendVoteCommand(voterId)    { if (_default) _default.handleExtendVoteCommand(voterId); }

module.exports = {
  init,
  isActive,
  cancelExtendVote,
  handleExtendVoteCommand,
  setDefaultExtendVote,
};
