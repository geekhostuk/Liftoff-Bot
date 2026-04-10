/**
 * Skip-vote — backward-compatible facade.
 *
 * All methods delegate to the default room's SkipVoteInstance via
 * RoomManager. Code that already does require('./skipVote') continues
 * to work unchanged.
 */

let _default = null;

function setDefaultSkipVote(instance) {
  _default = instance;
}

function _get() {
  return _default;
}

function init() {}
function isActive()                        { return _default ? _default.isActive() : false; }
function cancelSkipVote()                  { if (_default) _default.cancelSkipVote(); }
function handleSkipVoteCommand(voterId)    { if (_default) _default.handleSkipVoteCommand(voterId); }

module.exports = {
  init,
  isActive,
  cancelSkipVote,
  handleSkipVoteCommand,
  setDefaultSkipVote,
};
