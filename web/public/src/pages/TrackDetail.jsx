import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { getTrackDetail } from '../lib/api';
import { imageProxyUrl } from '../lib/api';
import { fmtMs, fmtNumber, fmtDate } from '../lib/fmt';
import { Loading, ErrorState } from '../components/ui/EmptyState';
import StatCard from '../components/ui/StatCard';
import TrackLeaderboard from '../components/browse/TrackLeaderboard';
import TrackComments from '../components/browse/TrackComments';
import UserTagCloud from '../components/browse/UserTagCloud';
import './TrackDetail.css';

export default function TrackDetail() {
  const { env: encodedEnv, track: encodedTrack } = useParams();
  const env = decodeURIComponent(encodedEnv);
  const track = decodeURIComponent(encodedTrack);

  const { data, loading, error } = useApi(
    () => getTrackDetail(env, track),
    [env, track]
  );

  if (loading) return <Loading message="Loading track..." />;
  if (error) return <ErrorState message="Track not found or failed to load." />;
  if (!data) return null;

  const title = data.steam_title || data.track;
  const imgUrl = data.steam_preview_url ? imageProxyUrl(data.steam_preview_url) : null;
  const steamScore = data.steam_score != null ? `${(data.steam_score * 100).toFixed(0)}%` : null;

  return (
    <div className="track-detail-page">
      <div className="track-detail-back">
        <Link to="/browse" className="back-link">← Browse</Link>
      </div>

      {/* Header */}
      <div className="track-detail-header">
        {imgUrl && (
          <div className="track-detail-image-wrap">
            <img className="track-detail-image" src={imgUrl} alt={title} />
          </div>
        )}
        <div className="track-detail-info">
          <div className="track-detail-env">{data.env}</div>
          <h1 className="track-detail-title">{title}</h1>
          {data.track !== data.steam_title && data.steam_title && (
            <div className="track-detail-internal-name">{data.track}</div>
          )}
          {data.steam_author_name && (
            <div className="track-detail-author">by {data.steam_author_name}</div>
          )}
          {data.steam_description && (
            <p className="track-detail-description">{data.steam_description}</p>
          )}
          <div className="track-detail-meta">
            {steamScore && (
              <span className="track-detail-badge">Steam {steamScore}</span>
            )}
            {data.steam_subscriptions != null && (
              <span className="track-detail-badge">{fmtNumber(data.steam_subscriptions)} subscribers</span>
            )}
            {data.steam_tags && data.steam_tags.length > 0 && (
              <span className="track-detail-badge">{data.steam_tags.slice(0, 4).join(', ')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="track-detail-stats">
        <StatCard label="Race Sessions" value={fmtNumber(data.race_count)} />
        <StatCard label="Total Laps" value={fmtNumber(data.total_laps)} />
        <StatCard label="Times Skipped" value={fmtNumber(data.skip_count ?? 0)} />
        <StatCard label="Times Extended" value={fmtNumber(data.extend_count ?? 0)} />
        {data.overall_best_lap_ms && (
          <StatCard label="Best Lap" value={fmtMs(data.overall_best_lap_ms)} accent />
        )}
      </div>

      {/* Leaderboard */}
      <section className="track-detail-section">
        <h2 className="track-detail-section-title">Leaderboard</h2>
        <TrackLeaderboard env={env} track={track} />
      </section>

      {/* Community tags */}
      <section className="track-detail-section">
        <h2 className="track-detail-section-title">Community Tags</h2>
        <p className="track-detail-section-hint">
          Click a tag to vote for it, or add your own.
        </p>
        <UserTagCloud env={env} track={track} />
      </section>

      {/* Comments */}
      <section className="track-detail-section">
        <h2 className="track-detail-section-title">Comments</h2>
        <TrackComments env={env} track={track} />
      </section>
    </div>
  );
}
