import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { useWsEvent } from '../../context/WebSocketContext.jsx';
import './AppShell.css';

const routeTitles = {
  '/admin': 'Dashboard',
  '/admin/players': 'Players',
  '/admin/tracks': 'Tracks',
  '/admin/chat': 'Chat',
  '/admin/playlists': 'Playlists',
  '/admin/tags': 'Tags',
  '/admin/competition': 'Competition',
};

export default function AppShell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pluginConnected, setPluginConnected] = useState(false);
  const [searchItems, setSearchItems] = useState([]);

  const title = routeTitles[location.pathname] || 'Admin';

  // Close mobile sidebar on route change
  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Poll plugin status
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await fetch('/api/status').then(r => r.json());
        if (active) setPluginConnected(data.plugin_connected);
      } catch {}
      if (active) setTimeout(poll, 5000);
    };
    poll();
    return () => { active = false; };
  }, []);

  // Build search items from catalog
  const handleCatalog = useCallback(() => {
    fetch('/api/catalog').then(r => r.json()).then(catalog => {
      if (catalog.error) return;
      const items = [];
      for (const env of (catalog.environments || [])) {
        for (const t of (env.tracks || [])) {
          items.push({
            name: `${env.display_name || env.caption} / ${t.name}`,
            category: 'Track',
            path: '/admin/tracks',
          });
        }
      }
      setSearchItems(items);
    }).catch(() => {});
  }, []);

  useEffect(() => { handleCatalog(); }, [handleCatalog]);
  useWsEvent('track_catalog', handleCatalog);

  return (
    <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        pluginConnected={pluginConnected}
      />
      {mobileOpen && <div className="app-shell__overlay" onClick={() => setMobileOpen(false)} />}
      <div className="app-shell__main">
        <Topbar
          title={title}
          searchItems={searchItems}
          onMobileMenuToggle={() => setMobileOpen(o => !o)}
        />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
