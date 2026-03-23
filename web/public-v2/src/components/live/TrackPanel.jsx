import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import RankMedal from '../ui/RankMedal';
import Badge from '../ui/Badge';
import { fmtMs } from '../../lib/fmt';
import './TrackPanel.css';

function useElapsed(since) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!since) { setElapsed(''); return; }
    function update() {
      const diff = Math.max(0, Date.now() - new Date(since).getTime());
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setElapsed(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [since]);
  return elapsed;
}

export default function TrackPanel({ currentTrack, trackSince, trackRecord }) {
  const elapsed = useElapsed(trackSince);

  if (!currentTrack?.track) {
    return (
      <div className="track-panel card">
        <h3 className="track-panel-title">Current Track</h3>
        <p className="track-panel-empty">No track loaded</p>
      </div>
    );
  }

  const { env, track, race } = currentTrack;

  // trackRecord can be an array of leaderboard entries — take the first
  const record = Array.isArray(trackRecord) && trackRecord.length > 0 ? trackRecord[0] : null;

  return (
    <div className="track-panel card">
      <div className="track-panel-header">
        <h3 className="track-panel-title">Current Track</h3>
        {race && <Badge variant="secondary">{race}</Badge>}
      </div>
      <div className="track-panel-track">
        {env && <span className="track-panel-env">{env}</span>}
        <Link to="/tracks" className="track-panel-name track-panel-link">{track}</Link>
      </div>
      <div className="track-panel-meta">
        {elapsed && (
          <span className="track-panel-elapsed">
            Playing for <strong>{elapsed}</strong>
          </span>
        )}
        {record && (
          <span className="track-panel-record">
            Track record: <span className="track-panel-record-nick">{record.nick}</span>
            <span className="track-panel-record-time">{fmtMs(record.best_lap_ms || record.lap_ms)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
