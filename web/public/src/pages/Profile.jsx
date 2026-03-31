import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAuth } from '../context/UserAuthContext';
import useApi from '../hooks/useApi';
import { getMyStats } from '../lib/api';
import ChangePassword from '../components/ChangePassword';
import StatsHeader from '../components/profile/StatsHeader';
import PilotRating from '../components/profile/PilotRating';
import PerformanceTrend from '../components/profile/PerformanceTrend';
import RacePositionChart from '../components/profile/RacePositionChart';
import RecentRaces from '../components/profile/RecentRaces';
import PersonalRecords from '../components/profile/PersonalRecords';
import Achievements from '../components/profile/Achievements';
import DataExport from '../components/profile/DataExport';
import './AuthPages.css';
import './Profile.css';

export default function Profile() {
  const { user, logout, refresh } = useUserAuth();
  const navigate = useNavigate();
  const [verifyCode, setVerifyCode] = useState('');
  const [nickError, setNickError] = useState('');
  const [nickLoading, setNickLoading] = useState(false);

  const canFetchStats = !!(user?.nick_verified);
  const { data: stats, loading: statsLoading } = useApi(
    () => canFetchStats ? getMyStats().catch(() => null) : Promise.resolve(null),
    [canFetchStats]
  );

  if (!user) {
    navigate('/login');
    return null;
  }

  async function handleGenerateCode() {
    setNickError('');
    setVerifyCode('');
    setNickLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate code');
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

  const hasData = stats?.summary?.races_entered > 0;

  return (
    <div className={`profile-page ${hasData ? 'profile-page-wide' : ''}`}>
      {/* Account card */}
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

        {!user.nick_verified && user.email_verified && (
          <div className="profile-section">
            <h2>Link Your In-Game Nickname</h2>
            <p className="auth-subtitle">
              Generate a verification code below, then type it in the Liftoff in-game chat. Your in-game name will be linked to this account automatically.
            </p>

            {nickError && <div className="auth-error">{nickError}</div>}
            <button onClick={handleGenerateCode} className="btn btn-primary auth-btn" disabled={nickLoading}>
              {nickLoading ? 'Generating...' : 'Generate Verification Code'}
            </button>

            {verifyCode && (
              <div className="verify-code-box">
                <p>Type this command in the <strong>Liftoff in-game chat</strong>:</p>
                <code className="verify-code">/verify {verifyCode}</code>
                <p className="auth-subtitle">This code expires in 1 hour.</p>
              </div>
            )}
          </div>
        )}

        {!user.nick_verified && !user.email_verified && (
          <div className="profile-section">
            <h2>Verify Your Email</h2>
            <p className="auth-subtitle">
              Check your inbox and verify your email address to unlock nickname linking.
            </p>
          </div>
        )}

        <ChangePassword />

        <button onClick={handleLogout} className="btn btn-secondary auth-btn" style={{ marginTop: '1.5rem' }}>
          Log Out
        </button>
      </div>

      {/* Dashboard */}
      {user.nick_verified && (
        <div className="profile-dashboard">
          {statsLoading && (
            <div className="profile-dashboard-loading">Loading your racing data...</div>
          )}

          {!statsLoading && !hasData && (
            <div className="profile-dashboard-empty">
              No racing data found for <strong>{user.nickname}</strong>. Get out there and fly!
            </div>
          )}

          {hasData && (
            <>
              <StatsHeader summary={stats.summary} />
              <PilotRating rating={stats.rating} />
              <PerformanceTrend weeklyTrend={stats.weeklyTrend} />
              <RacePositionChart recentRaces={stats.recentRaces} />
              <RecentRaces races={stats.recentRaces} />
              <PersonalRecords records={stats.personalRecords} />
              <Achievements data={stats} />
              <DataExport />
            </>
          )}

          {!statsLoading && !hasData && user.nick_verified && (
            <div className="profile-dashboard-hint">
              No stats yet for <strong>{user.nickname}</strong>. Race some laps and check back!
            </div>
          )}
        </div>
      )}

      {!user.nick_verified && (
        <div className="profile-dashboard-prompt">
          Verify your in-game nickname above to unlock your personal racing dashboard with stats, charts, and data exports.
        </div>
      )}
    </div>
  );
}
