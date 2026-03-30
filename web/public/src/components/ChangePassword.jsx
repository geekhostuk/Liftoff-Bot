import { useState } from 'react';

export default function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPw !== confirmPw) {
      setError('Passwords do not match');
      return;
    }
    if (newPw.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setSuccess('Password updated');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="profile-section">
      <h2>Password</h2>
      {success && <p className="auth-message auth-success" style={{ marginBottom: '0.5rem' }}>{success}</p>}
      {!open ? (
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
          Change Password
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <label className="auth-label">
            Current Password
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required className="auth-input" />
          </label>
          <label className="auth-label">
            New Password
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6} className="auth-input" />
          </label>
          <label className="auth-label">
            Confirm New Password
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required className="auth-input" />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setError(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
