/**
 * Tag-vote — backward-compatible facade.
 *
 * All methods delegate to the default room's TagVoteInstance via
 * RoomManager. Code that already does require('./tagVote') continues
 * to work unchanged.
 */

let _default = null;

function setDefaultTagVote(instance) {
  _default = instance;
}

function init() {}
function getState()                                 { return _default ? _default.getState() : { active: false, options: [], votes: {}, expires_at: null }; }
function isActive()                                 { return _default ? _default.isActive() : false; }
function startVote(opts, dur, src)                  { if (_default) return _default.startVote(opts, dur, src); }
function cancelVote()                               { if (_default) _default.cancelVote(); }
function handleNumberedVote(idx, voterId)           { if (_default) _default.handleNumberedVote(idx, voterId); }
function handleTagVoteCommand(voterId)              { if (_default) _default.handleTagVoteCommand(voterId); }
function handleTagsInfoCommand()                    { if (_default) _default.handleTagsInfoCommand(); }

module.exports = {
  init,
  getState,
  isActive,
  startVote,
  cancelVote,
  handleNumberedVote,
  handleTagVoteCommand,
  handleTagsInfoCommand,
  setDefaultTagVote,
};
