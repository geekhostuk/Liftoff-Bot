import { useState } from 'react';
import useApi from '../../hooks/useApi';
import { getTrackUserTags, postUserTagVote } from '../../lib/api';
import { Empty } from '../ui/EmptyState';
import './UserTagCloud.css';

export default function UserTagCloud({ env, track }) {
  const { data, loading, refetch } = useApi(
    () => getTrackUserTags(env, track),
    [env, track]
  );

  const [newTag, setNewTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tagError, setTagError] = useState(null);
  const [localVotes, setLocalVotes] = useState({});

  async function vote(label) {
    try {
      const result = await postUserTagVote(env, track, label);
      if (result.voted) {
        setLocalVotes(prev => ({ ...prev, [label]: (prev[label] || 0) + 1 }));
      }
    } catch {
      // silently ignore — the tag still shows
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    const label = newTag.trim().toLowerCase();
    if (!label) return;
    setSubmitting(true);
    setTagError(null);
    try {
      await postUserTagVote(env, track, label);
      setNewTag('');
      refetch();
    } catch (err) {
      setTagError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const tags = data || [];

  return (
    <div className="user-tag-cloud">
      {tags.length === 0 && !loading && (
        <Empty message="No community tags yet." />
      )}
      <div className="user-tag-list">
        {tags.map(t => {
          const bonus = localVotes[t.label] || 0;
          return (
            <button
              key={t.label}
              className="user-tag"
              onClick={() => vote(t.label)}
              title="Click to vote for this tag"
            >
              {t.label}
              <span className="user-tag-count">{t.votes + bonus}</span>
            </button>
          );
        })}
      </div>
      <form className="user-tag-form" onSubmit={handleAdd}>
        <input
          className="user-tag-input"
          type="text"
          placeholder="Add a tag..."
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          maxLength={30}
        />
        <button className="btn btn-outline user-tag-submit" type="submit" disabled={submitting || !newTag.trim()}>
          Add
        </button>
      </form>
      {tagError && <p className="user-tag-error">{tagError}</p>}
    </div>
  );
}
