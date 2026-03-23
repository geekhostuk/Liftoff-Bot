import { useState, useEffect } from 'react';
import { fmtCountdown } from '../../lib/fmt.js';
import './RunnerBar.css';

export default function RunnerBar({ state, label = 'Runner', extra, actions }) {
  const [countdown, setCountdown] = useState('');

  const running = typeof state === 'object' ? state?.running : state === 'running';

  useEffect(() => {
    if (!running || !state?.next_change_at) {
      setCountdown('');
      return;
    }
    const tick = () => setCountdown(fmtCountdown(new Date(state.next_change_at).getTime()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, state?.next_change_at]);

  if (!running) {
    return (
      <div className="runner-bar runner-bar--stopped">
        <span className="runner-bar__label">{label}</span>
        <span className="runner-bar__status">Stopped</span>
        {actions && <span className="runner-bar__actions">{actions}</span>}
      </div>
    );
  }

  const track = state?.current_track;
  const trackLabel = track ? `${track.env || track.environment || ''} / ${track.track || track.name || ''}` : '';

  return (
    <div className="runner-bar runner-bar--active">
      <span className="runner-bar__label">{label}</span>
      <span className="runner-bar__status">
        {state?.playlist_name || state?.tag_names?.join(', ') || 'Running'}
        {state?.current_index != null && state?.track_count != null && ` (${state.current_index + 1}/${state.track_count})`}
      </span>
      {trackLabel && <span className="runner-bar__track">{trackLabel}</span>}
      {extra && <span className="runner-bar__extra">{extra}</span>}
      {countdown && <span className="runner-bar__countdown">next in {countdown}</span>}
      {actions && <span className="runner-bar__actions">{actions}</span>}
    </div>
  );
}
