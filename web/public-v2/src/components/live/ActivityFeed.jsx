import { useRef, useEffect, useState } from 'react';
import './ActivityFeed.css';

const typeConfig = {
  lap:    { color: 'var(--color-primary)', label: 'LAP' },
  join:   { color: 'var(--color-success)', label: 'JOIN' },
  leave:  { color: 'var(--text-muted)',    label: 'LEFT' },
  track:  { color: 'var(--color-secondary)', label: 'TRACK' },
  race:   { color: 'var(--color-primary)', label: 'RACE' },
  finish: { color: 'var(--color-success)', label: 'DONE' },
  reset:  { color: 'var(--text-muted)',    label: 'RESET' },
  comp:   { color: 'var(--color-secondary)', label: 'COMP' },
};

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ActivityFeed({ events }) {
  const listRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to top (newest first) — not needed since newest are at top
  // But we track scroll position to know if user scrolled away

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  function handleScroll() {
    if (!listRef.current) return;
    // If user scrolled away from top, disable auto-scroll
    setAutoScroll(listRef.current.scrollTop < 20);
  }

  return (
    <div className="activity-feed card">
      <div className="activity-feed-header">
        <h3 className="activity-feed-title">Activity Feed</h3>
        <span className="activity-feed-count">{events.length} events</span>
      </div>
      <div
        className="activity-feed-list"
        ref={listRef}
        onScroll={handleScroll}
      >
        {events.length === 0 ? (
          <p className="activity-feed-empty">Waiting for events…</p>
        ) : (
          events.map(ev => {
            const cfg = typeConfig[ev.type] || typeConfig.race;
            return (
              <div key={ev.id} className="feed-event">
                <span className="feed-event-time">{formatTime(ev.ts)}</span>
                <span className="feed-event-tag" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="feed-event-msg">{ev.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
