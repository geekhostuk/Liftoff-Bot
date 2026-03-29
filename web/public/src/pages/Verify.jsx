import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './AuthPages.css';

export default function Verify() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    fetch(`/api/verify?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully!');
        } else {
          setStatus('error');
          setMessage(data.error || 'Verification failed.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Something went wrong. Please try again.');
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Email Verification</h1>
        {status === 'loading' && <p className="auth-message">Verifying your email...</p>}
        {status === 'success' && (
          <>
            <p className="auth-message auth-success">{message}</p>
            <Link to="/login" className="btn btn-primary auth-btn">Log In</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="auth-message auth-error">{message}</p>
            <Link to="/register" className="btn btn-primary auth-btn">Register Again</Link>
          </>
        )}
      </div>
    </div>
  );
}
