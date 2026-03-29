import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '../context/UserAuthContext';
import ChangePassword from '../components/ChangePassword';
import './AuthPages.css';

export default function Profile() {
  const { user, logout, refresh } = useUserAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [nickError, setNickError] = useState('');
  const [nickLoading, setNickLoading] = useState(false);

  if (!user) {
    navigate('/login');
    return null;
  }

  async function handleNickname(e) {
    e.preventDefault();
    setNickError('');
    setVerifyCode('');
    setNickLoading(true);
    try {
      const res = await fetch('/api/auth/nickname', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set nickname');
      setVerifyCode(data.verify_code);
      await refresh();
    } catch (err) {
      setNickError(err.message);
    } finally {
      setNickLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="auth-page">
      <div className="auth-card profile-card">
        <h1>Your Profile</h1>

        <div className="profile-info">
          <div className="profile-row">
            <span className="profile-label">Email</span>
            <span className="profile-value">{user.email}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Nickname</span>
            <span className="profile-value">
              {user.nickname || 'Not set'}
              {user.nickname && (
                <span className={`profile-badge ${user.nick_verified ? 'verified' : 'unverified'}`}>
                  {user.nick_verified ? 'Verified' : 'Unverified'}
                </span>
              )}
            </span>
          </div>
        </div>

        {!user.nick_verified && (
          <div className="profile-section">
            <h2>{user.nickname ? 'Verify Your Nickname' : 'Set Your Nickname'}</h2>
            <p className="auth-subtitle">
              Enter your in-game Liftoff nickname.
              {user.nickname && !verifyCode && ' You can re-claim to get a new verification code.'}
            </p>

            <form onSubmit={handleNickname} className="auth-form">
              {nickError && <div className="auth-error">{nickError}</div>}
              <label className="auth-label">
                In-Game Nickname
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder={user.nickname || 'Your Liftoff nickname'}
                  required
                  maxLength={30}
                  className="auth-input"
                />
              </label>
              <button type="submit" className="btn btn-primary auth-btn" disabled={nickLoading}>
                {nickLoading ? 'Setting...' : user.nickname ? 'Update Nickname' : 'Set Nickname'}
              </button>
            </form>

            {verifyCode && (
              <div className="verify-code-box">
                <p>Type this command in the <strong>Liftoff in-game chat</strong>:</p>
                <code className="verify-code">/verify {verifyCode}</code>
                <p className="auth-subtitle">This code expires in 1 hour.</p>
              </div>
            )}
          </div>
        )}

        <ChangePassword />

        <button onClick={handleLogout} className="btn btn-secondary auth-btn" style={{ marginTop: '1.5rem' }}>
          Log Out
        </button>
      </div>
    </div>
  );
}
