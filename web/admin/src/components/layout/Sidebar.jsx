import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Map, MessageSquare, BotMessageSquare, ListMusic, Tag, Radio, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useWs } from '../../context/WebSocketContext.jsx';
import StatusDot from '../feedback/StatusDot.jsx';
import './Sidebar.css';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/players', icon: Users, label: 'Players' },
  { to: '/admin/tracks', icon: Map, label: 'Tracks' },
  { to: '/admin/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/admin/chat-beta', icon: MessageSquare, label: 'Chat', beta: true },
  { to: '/admin/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/admin/playlists-beta', icon: ListMusic, label: 'Playlists (beta)' },
  { to: '/admin/tags', icon: Tag, label: 'Tags' },
  { to: '/admin/overseer', icon: Radio, label: 'Track Overseer' },
  { to: '/admin/auto-messages', icon: BotMessageSquare, label: 'Auto Messages', beta: true },
];

export default function Sidebar({ collapsed, onToggle, pluginConnected }) {
  const { connected: wsConnected } = useWs();

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <span className="sidebar__logo-mark">JMT</span>
        {!collapsed && <span className="sidebar__logo-text">Admin</span>}
      </div>

      <nav className="sidebar__nav">
        {navItems.map(({ to, icon: Icon, label, end, beta }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={20} />
            {!collapsed && (
              <>
                <span>{label}</span>
                {beta && <span className="badge badge-beta" style={{ marginLeft: 'auto' }}>Beta</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__status">
          <StatusDot status={pluginConnected ? 'connected' : 'disconnected'} />
          {!collapsed && <span className="sidebar__status-label">Plugin</span>}
        </div>
        <div className="sidebar__status">
          <StatusDot status={wsConnected ? 'connected' : 'disconnected'} />
          {!collapsed && <span className="sidebar__status-label">Live WS</span>}
        </div>
        <button className="sidebar__toggle" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
    </aside>
  );
}
