export default function StatusDot({ connected }) {
  return (
    <span className="status-indicator">
      <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
      <span className="status-label">{connected ? 'Live' : 'Reconnecting\u2026'}</span>
    </span>
  );
}
