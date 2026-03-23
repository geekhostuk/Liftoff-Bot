import { Link } from 'react-router-dom';
import Badge from '../ui/Badge';
import useCountdown from '../../hooks/useCountdown';
import './PlaylistBar.css';

export default function PlaylistBar({ playlist }) {
  const countdown = useCountdown(playlist?.next_change_at);

  if (!playlist?.running) {
    return (
      <div className="playlist-bar card">
        <div className="playlist-bar-header">
          <h3 className="playlist-bar-title">Playlist</h3>
          <Badge variant="secondary">Inactive</Badge>
        </div>
        <p className="playlist-bar-empty">No playlist running</p>
      </div>
    );
  }

  const { playlist_name, current_index, track_count, next_change_at } = playlist;
  const trackNum = (current_index ?? 0) + 1;

  // Format countdown — playlist changes are typically minutes away, not days
  let countdownStr = '';
  if (!countdown.expired) {
    const parts = [];
    if (countdown.hours > 0) parts.push(`${countdown.hours}h`);
    parts.push(`${countdown.minutes}m`);
    countdownStr = parts.join(' ');
  }

  return (
    <div className="playlist-bar card">
      <div className="playlist-bar-header">
        <h3 className="playlist-bar-title">Playlist</h3>
        <Badge variant="success">Active</Badge>
      </div>
      <Link to="/tracks" className="playlist-bar-name playlist-bar-link">{playlist_name}</Link>
      <div className="playlist-bar-info">
        <span className="playlist-bar-progress">
          Track {trackNum} of {track_count}
        </span>
        {next_change_at && !countdown.expired && (
          <span className="playlist-bar-countdown">
            Next track in <strong>{countdownStr}</strong>
          </span>
        )}
        {next_change_at && countdown.expired && (
          <span className="playlist-bar-countdown changing">Changing track…</span>
        )}
      </div>
      <div className="playlist-bar-track">
        <div className="playlist-bar-track-fill" style={{ width: `${(trackNum / track_count) * 100}%` }} />
      </div>
    </div>
  );
}
