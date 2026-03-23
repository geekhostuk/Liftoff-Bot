import { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: '#ef4444', fontFamily: 'monospace', background: '#0B0F14', minHeight: '100vh' }}>
          <h1 style={{ color: '#FF7A00' }}>Admin V2 — Startup Error</h1>
          <pre style={{ marginTop: '1rem', whiteSpace: 'pre-wrap', color: '#F8FAFC' }}>{this.state.error.message}</pre>
          <pre style={{ marginTop: '0.5rem', color: '#6B7A8D', fontSize: '0.8rem' }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
