import { fmtMs, fmtNumber } from '../../lib/fmt';
import './PlayersPanel.css';

const MAX_PLAYERS = 8;

export default function PlayersPanel({ players, playerStats }) {
  const onlineCount = players.filter(p => p.status !== 'leaving').length;

  return (
    <div className="players-panel card">
      <div className="players-panel-header">
        <h3 className="players-panel-title">Players Online</h3>
        <span className={`players-panel-count ${onlineCount >= MAX_PLAYERS ? 'full' : ''}`}>
          {onlineCount}/{MAX_PLAYERS}
        </span>
      </div>

      {players.length === 0 ? (
        <p className="players-panel-empty">No players in lobby</p>
      ) : (
        <div className="players-panel-list">
          {players.map(p => {
            const stats = playerStats?.[p.nick];
            return (
              <div
                key={p.actor}
                className={`player-row ${p.status === 'joining' ? 'player-joining' : ''} ${p.status === 'leaving' ? 'player-leaving' : ''}`}
              >
                <div className="player-row-main">
                  <span className={`player-dot ${p.status === 'leaving' ? 'leaving' : 'online'}`} />
                  <span className="player-nick">{p.nick}</span>
                </div>
                {stats && (
                  <div className="player-row-stats">
                    <span className="player-stat" title="Best lap">
                      {fmtMs(stats.best_lap_ms)}
                    </span>
                    <span className="player-stat" title="Total laps">
                      {fmtNumber(stats.total_laps)} laps
                    </span>
                    <span className="player-stat" title="Races entered">
                      {fmtNumber(stats.races_entered)} races
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
