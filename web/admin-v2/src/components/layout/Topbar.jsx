import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Fuse from 'fuse.js';
import './Topbar.css';

const staticActions = [
  { name: 'Kick player', category: 'Action', path: '/admin/players' },
  { name: 'Send chat message', category: 'Action', path: '/admin/chat' },
  { name: 'Refresh catalog', category: 'Action', path: '/admin/tracks' },
  { name: 'Create playlist', category: 'Action', path: '/admin/playlists' },
  { name: 'Create tag', category: 'Action', path: '/admin/tags' },
  { name: 'Create competition', category: 'Action', path: '/admin/competition' },
  { name: 'Set track', category: 'Action', path: '/admin/tracks' },
  { name: 'Start playlist', category: 'Action', path: '/admin/playlists' },
  { name: 'Start tag runner', category: 'Action', path: '/admin/tags' },
  { name: 'Start tag vote', category: 'Action', path: '/admin/tags' },
];

export default function Topbar({ title, searchItems = [], onMobileMenuToggle }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const allItems = useMemo(() => [...searchItems, ...staticActions], [searchItems]);

  const fuse = useMemo(
    () => new Fuse(allItems, { keys: ['name'], threshold: 0.35 }),
    [allItems],
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 8).map(r => r.item);
  }, [fuse, query]);

  useEffect(() => setSelectedIdx(0), [results]);

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectResult = useCallback((item) => {
    if (item.path) navigate(item.path);
    setOpen(false);
    setQuery('');
  }, [navigate]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      selectResult(results[selectedIdx]);
    }
  };

  return (
    <header className="topbar">
      <button className="topbar__mobile-menu" onClick={onMobileMenuToggle}>
        <Menu size={20} />
      </button>
      <h1 className="topbar__title">{title}</h1>

      <div className="topbar__search" ref={wrapRef}>
        <Search size={16} className="topbar__search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="topbar__search-input"
          placeholder="Search… (Ctrl+K)"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button className="topbar__search-clear" onClick={() => { setQuery(''); setOpen(false); }}>
            <X size={14} />
          </button>
        )}
        {open && results.length > 0 && (
          <div className="topbar__search-results">
            {results.map((item, i) => (
              <button
                key={i}
                className={`topbar__search-result ${i === selectedIdx ? 'topbar__search-result--active' : ''}`}
                onClick={() => selectResult(item)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="topbar__search-result-name">{item.name}</span>
                <span className="badge badge-muted">{item.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-ghost btn-sm" onClick={logout}>
        <LogOut size={16} /> Logout
      </button>
    </header>
  );
}
