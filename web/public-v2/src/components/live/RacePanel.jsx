import RankMedal from '../ui/RankMedal';
import Badge from '../ui/Badge';
import { fmtMs, fmtDelta } from '../../lib/fmt';
import './RacePanel.css';

const statusConfig = {
  waiting: { label: 'Waiting', variant: 'warning' },
  racing:  { label: 'Racing',  variant: 'success' },
  ended:   { label: 'Finished', variant: 'secondary' },
};

export default function RacePanel({ raceId, raceStatus, pilots, raceResult }) {
  const cfg = statusConfig[raceStatus] || statusConfig.waiting;

  return (
    <div className="race-panel card">
      <div className="race-panel-header">
        <div className="race-panel-header-left">
          <h3 className="race-panel-title">Live Race</h3>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {raceStatus === 'racing' && <span className="race-panel-pulse" />}
        </div>
        {raceId && (
          <span className="race-panel-id">#{raceId.slice(0, 8)}</span>
        )}
      </div>

      {/* Winner banner */}
      {raceStatus === 'ended' && raceResult && (
        <div className="race-panel-winner">
          <span className="race-panel-winner-label">Winner</span>
          <span className="race-panel-winner-nick">{raceResult.winner_nick || 'Unknown'}</span>
          {raceResult.winner_total_ms && (
            <span className="race-panel-winner-time">{fmtMs(raceResult.winner_total_ms)}</span>
          )}
          <span className="race-panel-winner-meta">
            {raceResult.completed}/{raceResult.participants} finished
          </span>
        </div>
      )}

      {/* Leaderboard table */}
      {pilots.length > 0 ? (
        <div className="race-panel-table-wrap">
          <table className="data-table race-table">
            <thead>
              <tr>
                <th className="col-rank">Pos</th>
                <th className="col-pilot">Pilot</th>
                <th className="col-laps">Laps</th>
                <th className="col-best">Best</th>
                <th className="col-last">Last</th>
                <th className="col-delta">Delta</th>
              </tr>
            </thead>
            <tbody>
              {pilots.map((p, i) => {
                const deltaClass = p.lastDelta != null
                  ? (p.lastDelta < 0 ? 'delta-neg' : p.lastDelta > 0 ? 'delta-pos' : '')
                  : '';
                return (
                  <tr key={p.key} className={`${p.flash ? 'row-flash' : ''} ${p.finished ? 'row-finished' : ''}`}>
                    <td className="col-rank"><RankMedal rank={i + 1} /></td>
                    <td className="col-pilot pilot-name">{p.nick}</td>
                    <td className="col-laps">{p.laps.length}</td>
                    <td className="col-best best-time">{fmtMs(p.bestMs)}</td>
                    <td className="col-last">{fmtMs(p.lastMs)}</td>
                    <td className={`col-delta ${deltaClass}`}>{fmtDelta(p.lastDelta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="race-panel-empty">
          <p>{raceStatus === 'waiting' ? 'Waiting for first lap\u2026' : 'No laps recorded'}</p>
        </div>
      )}
    </div>
  );
}
