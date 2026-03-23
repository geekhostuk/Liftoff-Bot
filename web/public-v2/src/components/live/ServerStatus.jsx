import StatusDot from '../ui/StatusDot';
import Badge from '../ui/Badge';
import './ServerStatus.css';

export default function ServerStatus({ connected, pluginConnected }) {
  return (
    <div className="server-status">
      <div className="server-status-item">
        <StatusDot connected={connected} />
      </div>
      <div className="server-status-item">
        <span className="status-indicator">
          <span className={`status-dot ${pluginConnected ? 'connected' : 'disconnected'}`} />
          <span className="status-label">{pluginConnected ? 'Plugin Online' : 'Plugin Offline'}</span>
        </span>
      </div>
      {connected && pluginConnected && (
        <Badge variant="success">All Systems Go</Badge>
      )}
      {connected && !pluginConnected && (
        <Badge variant="warning">Plugin Disconnected</Badge>
      )}
      {!connected && (
        <Badge variant="warning">Reconnecting</Badge>
      )}
    </div>
  );
}
