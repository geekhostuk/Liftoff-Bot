import { useState } from 'react';
import useApi from '../../hooks/useApi';
import { getTrackComments, postTrackComment } from '../../lib/api';
import { timeAgo } from '../../lib/fmt';
import { Loading, ErrorState, Empty } from '../ui/EmptyState';
import Badge from '../ui/Badge';
import './TrackComments.css';

export default function TrackComments({ env, track }) {
  const { data, loading, error, refetch } = useApi(
    () => getTrackComments(env, track),
    [env, track]
  );

  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [optimistic, setOptimistic] = useState([]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    setSubmitting(true);
    setSubmitError(null);

    const tempComment = {
      id: `temp-${Date.now()}`,
      author_name: name.trim(),
      is_known_pilot: false,
      body: body.trim(),
      created_at: new Date().toISOString(),
      _pending: true,
    };

    setOptimistic(prev => [tempComment, ...prev]);
    setBody('');

    try {
      await postTrackComment(env, track, { authorName: tempComment.author_name, body: tempComment.body });
      setOptimistic(prev => prev.filter(c => c.id !== tempComment.id));
      refetch();
    } catch (err) {
      setOptimistic(prev => prev.filter(c => c.id !== tempComment.id));
      setSubmitError(err.message);
      setBody(tempComment.body);
    } finally {
      setSubmitting(false);
    }
  }

  const comments = [
    ...optimistic,
    ...(data?.comments || []),
  ];

  return (
    <div className="track-comments">
      <form className="comment-form" onSubmit={handleSubmit}>
        <div className="comment-form-fields">
          <input
            className="comment-input comment-name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
            required
          />
          <textarea
            className="comment-input comment-body"
            placeholder="Leave a comment..."
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            required
          />
        </div>
        {submitError && <p className="comment-error">{submitError}</p>}
        <button className="btn btn-primary comment-submit" type="submit" disabled={submitting}>
          {submitting ? 'Posting...' : 'Post Comment'}
        </button>
      </form>

      {loading && !data && <Loading message="Loading comments..." />}
      {error && <ErrorState message="Failed to load comments." onRetry={refetch} />}

      {comments.length === 0 && !loading && (
        <Empty message="No comments yet — be the first!" />
      )}

      <div className="comment-list">
        {comments.map(c => (
          <div key={c.id} className={`comment-item${c._pending ? ' comment-pending' : ''}`}>
            <div className="comment-meta">
              <span className="comment-author">{c.author_name}</span>
              {c.is_known_pilot && (
                <Badge variant="primary">Pilot</Badge>
              )}
              <span className="comment-time">{timeAgo(c.created_at)}</span>
            </div>
            <div className="comment-body">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
