import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Map, MessageSquare, ListMusic, Tag, Trophy, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useWs } from '../../context/WebSocketContext.jsx';
import StatusDot from '../feedback/StatusDot.jsx';
import './Sidebar.css';

const navItems = [
  { to: '/admin-v2', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin-v2/players', icon: Users, label: 'Players' },
  { to: '/admin-v2/tracks', icon: Map, label: 'Tracks' },
  { to: '/admin-v2/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/admin-v2/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/admin-v2/tags', icon: Tag, label: 'Tags' },
  { to: '/admin-v2/competition', icon: Trophy, label: 'Competition' },
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
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={20} />
            {!collapsed && <span>{label}</span>}
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
