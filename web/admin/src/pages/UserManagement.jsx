import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Roles state
  const [roles, setRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePerms, setNewRolePerms] = useState([]);
  const [roleError, setRoleError] = useState('');
  const [editingRole, setEditingRole] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRolePerms, setEditRolePerms] = useState([]);

  // Export popover state
  const [exportUserId, setExportUserId] = useState(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const exportRef = useRef(null);

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

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/roles');
      if (res.ok) setRoles(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadAdminUsers(); }, [loadAdminUsers]);
  useEffect(() => { loadSiteUsers(); }, [loadSiteUsers]);
  useEffect(() => { if (isSuperadmin) loadRoles(); }, [isSuperadmin, loadRoles]);

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

  // ── Role management ──────────────────────────────────────────────────────

  async function createRole(e) {
    e.preventDefault();
    setRoleError('');
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, permissions: newRolePerms }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create role');
      }
      setNewRoleName('');
      setNewRolePerms([]);
      loadRoles();
    } catch (err) {
      setRoleError(err.message);
    }
  }

  async function deleteRoleById(id) {
    if (!confirm('Delete this role? Users with this role will lose admin access.')) return;
    await fetch(`/api/admin/roles/${id}`, { method: 'DELETE' });
    loadRoles();
    loadSiteUsers();
  }

  function openEditRole(role) {
    setEditRoleName(role.name);
    setEditRolePerms([...(role.permissions || [])]);
    setEditingRole(role.id);
  }

  async function saveRole() {
    const res = await fetch(`/api/admin/roles/${editingRole}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editRoleName, permissions: editRolePerms }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to update role');
      return;
    }
    setEditingRole(null);
    loadRoles();
  }

  function toggleNewRolePerm(mod) {
    setNewRolePerms(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  }

  function toggleEditRolePerm(mod) {
    setEditRolePerms(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  }

  // ── Export helpers ───────────────────────────────────────────────────────

  useEffect(() => {
    if (exportUserId == null) return;
    function handleClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportUserId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportUserId]);

  function fmtDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function downloadExport(userId, type, from, to) {
    const params = new URLSearchParams({ from, to });
    window.open(`/api/admin/site-users/${userId}/export/${type}?${params}`, '_blank');
  }

  function openExport(userId) {
    const today = new Date();
    setCustomFrom(fmtDate(new Date(today.getTime() - 7 * 86400000)));
    setCustomTo(fmtDate(today));
    setExportUserId(exportUserId === userId ? null : userId);
  }

  function presetDownload(userId, type, days) {
    const today = new Date();
    const from = fmtDate(new Date(today.getTime() - days * 86400000));
    const to = fmtDate(today);
    downloadExport(userId, type, from, to);
  }

  async function assignSiteUserRole(userId, roleId) {
    await fetch(`/api/admin/site-users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId || null }),
    });
    loadSiteUsers();
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
        {isSuperadmin && (
          <button className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>
            Roles
          </button>
        )}
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
                {isSuperadmin && <th>Role</th>}
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
                  {isSuperadmin && (
                    <td>
                      <select
                        className="role-select"
                        value={u.role_id || ''}
                        onChange={e => assignSiteUserRole(u.id, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">No Role</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                  )}
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
                    {u.nickname && (
                      <span className="export-anchor" ref={exportUserId === u.id ? exportRef : undefined}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openExport(u.id)}>
                          Export
                        </button>
                        {exportUserId === u.id && (
                          <div className="export-popover">
                            <div className="export-row">
                              <span className="export-row-label">Last 7 days</span>
                              <span className="export-row-actions">
                                <button className="btn-export" onClick={() => presetDownload(u.id, 'laps', 7)}>Laps</button>
                                <button className="btn-export" onClick={() => presetDownload(u.id, 'races', 7)}>Races</button>
                              </span>
                            </div>
                            <div className="export-row">
                              <span className="export-row-label">Last 30 days</span>
                              <span className="export-row-actions">
                                <button className="btn-export" onClick={() => presetDownload(u.id, 'laps', 30)}>Laps</button>
                                <button className="btn-export" onClick={() => presetDownload(u.id, 'races', 30)}>Races</button>
                              </span>
                            </div>
                            <hr className="export-divider" />
                            <div className="export-custom-label">Custom range</div>
                            <div className="export-date-inputs">
                              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                              <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.75rem' }}>to</span>
                              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                            </div>
                            <div className="export-row">
                              <span />
                              <span className="export-row-actions">
                                <button className="btn-export" disabled={!customFrom || !customTo} onClick={() => downloadExport(u.id, 'laps', customFrom, customTo)}>Laps</button>
                                <button className="btn-export" disabled={!customFrom || !customTo} onClick={() => downloadExport(u.id, 'races', customFrom, customTo)}>Races</button>
                              </span>
                            </div>
                          </div>
                        )}
                      </span>
                    )}
                    <button className="btn btn-danger btn-xs" onClick={() => deleteSiteUser(u.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {siteUsers.rows.length === 0 && (
                <tr><td colSpan={isSuperadmin ? '7' : '6'} className="text-muted text-center">No registered users found</td></tr>
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

      {tab === 'roles' && isSuperadmin && (
        <div className="user-mgmt__section">
          <form onSubmit={createRole} className="user-mgmt__create role-create-form">
            <input
              type="text"
              placeholder="Role name"
              value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary btn-sm">Create Role</button>
            {roleError && <span className="user-mgmt__error">{roleError}</span>}
          </form>

          {newRoleName.trim() && (
            <div className="role-perm-picker">
              <p className="role-perm-hint">Select modules for the new role:</p>
              <div className="perm-grid">
                {ALL_MODULES.map(mod => (
                  <label key={mod} className="perm-checkbox">
                    <input
                      type="checkbox"
                      checked={newRolePerms.includes(mod)}
                      onChange={() => toggleNewRolePerm(mod)}
                    />
                    {MODULE_LABELS[mod]}
                  </label>
                ))}
              </div>
            </div>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Modules</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td>
                    <span className="perm-count">{(r.permissions || []).length}/{ALL_MODULES.length}</span>
                    {r.permissions.length > 0 && (
                      <span className="perm-list-hint" title={r.permissions.map(m => MODULE_LABELS[m] || m).join(', ')}>
                        {r.permissions.slice(0, 3).map(m => MODULE_LABELS[m] || m).join(', ')}
                        {r.permissions.length > 3 && ` +${r.permissions.length - 3} more`}
                      </span>
                    )}
                  </td>
                  <td className="text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button className="btn btn-ghost btn-xs" onClick={() => openEditRole(r)}>Edit</button>
                    <button className="btn btn-danger btn-xs" onClick={() => deleteRoleById(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr><td colSpan="4" className="text-muted text-center">No roles created yet</td></tr>
              )}
            </tbody>
          </table>

          {editingRole !== null && (
            <div className="perm-modal-overlay" onClick={() => setEditingRole(null)}>
              <div className="perm-modal" onClick={e => e.stopPropagation()}>
                <h3>Edit Role</h3>
                <div className="role-edit-name">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editRoleName}
                    onChange={e => setEditRoleName(e.target.value)}
                  />
                </div>
                <div className="perm-grid">
                  {ALL_MODULES.map(mod => (
                    <label key={mod} className="perm-checkbox">
                      <input
                        type="checkbox"
                        checked={editRolePerms.includes(mod)}
                        onChange={() => toggleEditRolePerm(mod)}
                      />
                      {MODULE_LABELS[mod]}
                    </label>
                  ))}
                </div>
                <div className="perm-modal-actions">
                  <button className="btn btn-primary btn-sm" onClick={saveRole}>Save</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingRole(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
