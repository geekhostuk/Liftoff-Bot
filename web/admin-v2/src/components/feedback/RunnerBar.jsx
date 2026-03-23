import { useState, useEffect } from 'react';
import { fmtCountdown } from '../../lib/fmt.js';
import './RunnerBar.css';

export default function RunnerBar({ state, label = 'Runner' }) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!state?.running || !state.next_change_at) {
      setCountdown('');
      return;
    }
    const tick = () => setCountdown(fmtCountdown(new Date(state.next_change_at).getTime()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.running, state?.next_change_at]);

  if (!state?.running) {
    return (
      <div className="runner-bar runner-bar--stopped">
        <span className="runner-bar__label">{label}</span>
        <span className="runner-bar__status">Stopped</span>
      </div>
    );
  }

  const track = state.current_track;
  const trackLabel = track ? `${track.env || track.environment || ''} / ${track.track || track.name || ''}` : '';

  return (
    <div className="runner-bar runner-bar--active">
      <span className="runner-bar__label">{label}</span>
      <span className="runner-bar__status">
        {state.playlist_name || state.tag_names?.join(', ') || 'Running'}
        {state.current_index != null && state.total != null && ` (${state.current_index + 1}/${state.total})`}
      </span>
      {trackLabel && <span className="runner-bar__track">{trackLabel}</span>}
      {countdown && <span className="runner-bar__countdown">next in {countdown}</span>}
    </div>
  );
}
