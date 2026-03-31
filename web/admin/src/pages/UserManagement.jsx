import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import './UserManagement.css';

const ALL_MODULES = [
  'dashboard', 'players', 'tracks', 'chat', 'playlists',
  'tags', 'track_manager', 'overseer', 'scoring',
  'competitions', 'auto_messages', 'users', 'idle_kick',
];

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  players: 'Players',
  tracks: 'Tracks',
  chat: 'Chat',
  playlists: 'Playlists',
  tags: 'Tags',
  track_manager: 'Track Manager',
  overseer: 'Track Overseer',
  scoring: 'Scoring',
  competitions: 'Competitions',
  auto_messages: 'Auto Messages',
  users: 'User Management',
  idle_kick: 'Idle Kick',
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState('admin');
  const [adminUsers, setAdminUsers] = useState([]);
  const [siteUsers, setSiteUsers] = useState({ rows: [], total: 0 });
  const [siteSearch, setSiteSearch] = useState('');
  const [sitePage, setSitePage] = useState(0);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [editingNick, setEditingNick] = useState(null);
  const [editNickValue, setEditNickValue] = useState('');
  const [editingPerms, setEditingPerms] = useState(null);
  const [editPerms, setEditPerms] = useState([]);
  const isSuperadmin = currentUser?.role === 'superadmin' || currentUser?.userId === 0;

  const loadAdminUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) setAdminUsers(await res.json());
    } catch {}
  }, []);

  const loadSiteUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(sitePage * 50) });
      if (siteSearch) params.set('search', siteSearch);
      const res = await fetch(`/api/admin/site-users?${params}`);
      if (res.ok) setSiteUsers(await res.json());
    } catch {}
  }, [siteSearch, sitePage]);

  useEffect(() => { loadAdminUsers(); }, [loadAdminUsers]);
  useEffect(() => { loadSiteUsers(); }, [loadSiteUsers]);

  async function createAdminUser(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create user');
      }
      setNewUsername('');
      setNewPassword('');
      loadAdminUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteAdminUser(id) {
    if (!confirm('Delete this admin user?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    loadAdminUsers();
  }

  async function deleteSiteUser(id) {
    if (!confirm('Delete this registered user?')) return;
    await fetch(`/api/admin/site-users/${id}`, { method: 'DELETE' });
    loadSiteUsers();
  }

  async function verifySiteUser(id) {
    await fetch(`/api/admin/site-users/${id}/verify`, { method: 'POST' });
    loadSiteUsers();
  }

  async function verifyNick(id) {
    await fetch(`/api/admin/site-users/${id}/verify-nick`, { method: 'POST' });
    loadSiteUsers();
  }

  async function saveNickname(id) {
    const nick = editNickValue.trim();
    if (!nick) return;
    const res = await fetch(`/api/admin/site-users/${id}/nickname`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nick }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to update nickname');
      return;
    }
    setEditingNick(null);
    loadSiteUsers();
  }

  async function openPermissions(userId) {
    const res = await fetch(`/api/admin/users/${userId}/permissions`);
    if (res.ok) {
      setEditPerms(await res.json());
      setEditingPerms(userId);
    }
  }

  async function savePermissions() {
    await fetch(`/api/admin/users/${editingPerms}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: editPerms }),
    });
    setEditingPerms(null);
    loadAdminUsers();
  }

  async function setRole(userId, role) {
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    loadAdminUsers();
  }

  function togglePerm(mod) {
    setEditPerms(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  }

  return (
    <div className="user-mgmt">
      <div className="user-mgmt__tabs">
        <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>
          Admin Users
        </button>
        <button className={`tab ${tab === 'site' ? 'active' : ''}`} onClick={() => setTab('site')}>
          Registered Users
        </button>
      </div>

      {tab === 'admin' && (
        <div className="user-mgmt__section">
          {isSuperadmin && (
            <form onSubmit={createAdminUser} className="user-mgmt__create">
              <input
                type="text"
                placeholder="Username"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password (min 6)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <button type="submit" className="btn btn-primary btn-sm">Create Admin</button>
              {error && <span className="user-mgmt__error">{error}</span>}
            </form>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.map(u => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>
                    {isSuperadmin && u.id !== currentUser?.userId ? (
                      <select
                        value={u.role}
                        onChange={e => setRole(u.id, e.target.value)}
                        className="role-select"
                      >
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                    ) : (
                      <span className={`role-badge role-${u.role}`}>{u.role}</span>
                    )}
                  </td>
                  <td>
                    {u.role === 'superadmin' ? (
                      <span className="perm-all">All</span>
                    ) : (
                      <>
                        <span className="perm-count">{(u.permissions || []).length}/{ALL_MODULES.length}</span>
                        {isSuperadmin && (
                          <button className="btn btn-ghost btn-xs" onClick={() => openPermissions(u.id)}>
                            Edit
                          </button>
                        )}
                      </>
                    )}
                  </td>
                  <td className="text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    {isSuperadmin && u.id !== currentUser?.userId && (
                      <button className="btn btn-danger btn-xs" onClick={() => deleteAdminUser(u.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {editingPerms !== null && (
            <div className="perm-modal-overlay" onClick={() => setEditingPerms(null)}>
              <div className="perm-modal" onClick={e => e.stopPropagation()}>
                <h3>Edit Permissions</h3>
                <div className="perm-grid">
                  {ALL_MODULES.map(mod => (
                    <label key={mod} className="perm-checkbox">
                      <input
                        type="checkbox"
                        checked={editPerms.includes(mod)}
                        onChange={() => togglePerm(mod)}
                      />
                      {MODULE_LABELS[mod]}
                    </label>
                  ))}
                </div>
                <div className="perm-modal-actions">
                  <button className="btn btn-primary btn-sm" onClick={savePermissions}>Save</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingPerms(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'site' && (
        <div className="user-mgmt__section">
          <div className="user-mgmt__search">
            <input
              type="text"
              placeholder="Search by email or nickname..."
              value={siteSearch}
              onChange={e => { setSiteSearch(e.target.value); setSitePage(0); }}
            />
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nickname</th>
                <th>Email Verified</th>
                <th>Nick Verified</th>
                <th>Registered</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {siteUsers.rows.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    {editingNick === u.id ? (
                      <span className="inline-edit">
                        <input
                          type="text"
                          value={editNickValue}
                          onChange={e => setEditNickValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveNickname(u.id)}
                          autoFocus
                        />
                        <button className="btn btn-primary btn-xs" onClick={() => saveNickname(u.id)}>Save</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditingNick(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="inline-edit">
                        {u.nickname || '-'}
                        <button className="btn btn-ghost btn-xs" onClick={() => { setEditingNick(u.id); setEditNickValue(u.nickname || ''); }}>Edit</button>
                      </span>
                    )}
                  </td>
                  <td>
                    {u.email_verified ? (
                      <span className="badge badge-success">Yes</span>
                    ) : (
                      <span className="badge badge-warning">No</span>
                    )}
                  </td>
                  <td>
                    {u.nick_verified ? (
                      <span className="badge badge-success">Yes</span>
                    ) : (
                      <span className="badge badge-muted">No</span>
                    )}
                  </td>
                  <td className="text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    {!u.email_verified && (
                      <button className="btn btn-ghost btn-xs" onClick={() => verifySiteUser(u.id)}>
                        Verify Email
                      </button>
                    )}
                    {u.nickname && !u.nick_verified && (
                      <button className="btn btn-ghost btn-xs" onClick={() => verifyNick(u.id)}>
                        Verify Nick
                      </button>
                    )}
                    <button className="btn btn-danger btn-xs" onClick={() => deleteSiteUser(u.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {siteUsers.rows.length === 0 && (
                <tr><td colSpan="6" className="text-muted text-center">No registered users found</td></tr>
              )}
            </tbody>
          </table>

          {siteUsers.total > 50 && (
            <div className="pagination">
              <button disabled={sitePage === 0} onClick={() => setSitePage(p => p - 1)}>Prev</button>
              <span>Page {sitePage + 1} of {Math.ceil(siteUsers.total / 50)}</span>
              <button disabled={(sitePage + 1) * 50 >= siteUsers.total} onClick={() => setSitePage(p => p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
