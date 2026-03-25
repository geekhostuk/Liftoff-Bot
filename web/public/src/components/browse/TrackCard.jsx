import { Link } from 'react-router-dom';
import { browsePath, fmtNumber } from '../../lib/fmt';
import { imageProxyUrl } from '../../lib/api';
import './TrackCard.css';

export default function TrackCard({ track }) {
  const imgUrl = track.steam_preview_url ? imageProxyUrl(track.steam_preview_url) : null;
  const title = track.steam_title || track.track;
  const author = track.steam_author_name;

  return (
    <Link to={browsePath(track.env, track.track)} className="track-card">
      <div className="track-card-image">
        {imgUrl
          ? <img src={imgUrl} alt={title} loading="lazy" />
          : <div className="track-card-no-image">No Preview</div>
        }
      </div>
      <div className="track-card-body">
        <div className="track-card-env">{track.env}</div>
        <div className="track-card-name">{title}</div>
        {author && <div className="track-card-author">by {author}</div>}
        <div className="track-card-stats">
          <span className="track-card-stat">{fmtNumber(track.race_count)} races</span>
          <span className="track-card-stat">{fmtNumber(track.total_laps)} laps</span>
          {track.skip_count > 0 && (
            <span className="track-card-stat track-card-stat-skip">{fmtNumber(track.skip_count)} skips</span>
          )}
        </div>
      </div>
    </Link>
  );
}
