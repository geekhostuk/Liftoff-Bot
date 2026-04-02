import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, UserCog, Map, MessageSquare, BotMessageSquare, ListMusic, Tag, Radio, Library, Trophy, Award, UserX, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useWs } from '../../context/WebSocketContext.jsx';
import StatusDot from '../feedback/StatusDot.jsx';
import './Sidebar.css';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true, module: 'dashboard' },
  { to: '/admin/players', icon: Users, label: 'Players', module: 'players' },
  { to: '/admin/tracks', icon: Map, label: 'Tracks', module: 'tracks' },
  { to: '/admin/chat', icon: MessageSquare, label: 'Chat', module: 'chat' },
  { to: '/admin/playlists', icon: ListMusic, label: 'Playlists', module: 'playlists' },
  { to: '/admin/tags', icon: Tag, label: 'Tags', module: 'tags' },
  { to: '/admin/track-manager', icon: Library, label: 'Track Manager', module: 'track_manager' },
  { to: '/admin/overseer', icon: Radio, label: 'Track Overseer', module: 'overseer' },
  { to: '/admin/scoring', icon: Trophy, label: 'Scoring', module: 'scoring' },
  { to: '/admin/competitions', icon: Award, label: 'Competitions', module: 'competitions' },
  { to: '/admin/auto-messages', icon: BotMessageSquare, label: 'Auto Messages', module: 'auto_messages' },
  { to: '/admin/idle-kick', icon: UserX, label: 'Idle Kick', module: 'idle_kick' },
  { to: '/admin/users', icon: UserCog, label: 'Users', module: 'users' },
];

export default function Sidebar({ collapsed, onToggle, pluginConnected }) {
  const { user } = useAuth();
  const { connected: wsConnected } = useWs();
  const permissions = user?.permissions || [];

  const visibleItems = navItems.filter(item =>
    permissions.includes(item.module)
  );

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <span className="sidebar__logo-mark">JMT</span>
        {!collapsed && <span className="sidebar__logo-text">Admin</span>}
      </div>

      <nav className="sidebar__nav">
        {visibleItems.map(({ to, icon: Icon, label, end, beta }) => (
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
