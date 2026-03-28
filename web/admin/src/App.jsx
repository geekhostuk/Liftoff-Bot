import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { WebSocketProvider } from './context/WebSocketContext.jsx';
import { ToastProvider } from './components/feedback/Toast.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginOverlay from './components/layout/LoginOverlay.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Players from './pages/Players.jsx';
import Tracks from './pages/Tracks.jsx';
import Chat from './pages/Chat.jsx';
import Playlists from './pages/Playlists.jsx';
import PlaylistsBeta from './pages/PlaylistsBeta.jsx';
import Tags from './pages/Tags.jsx';
import Overseer from './pages/Overseer.jsx';
import ChatBeta from './pages/ChatBeta.jsx';
import AutoMessages from './pages/AutoMessages.jsx';
import TrackManager from './pages/TrackManager.jsx';
import Scoring from './pages/Scoring.jsx';

function AuthGate({ children }) {
  const { user, checking } = useAuth();
  if (checking) return null;
  if (!user) return <LoginOverlay />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AuthGate>
            <WebSocketProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/admin" element={<Dashboard />} />
                  <Route path="/admin/players" element={<Players />} />
                  <Route path="/admin/tracks" element={<Tracks />} />
                  <Route path="/admin/chat" element={<Chat />} />
                  <Route path="/admin/playlists" element={<Playlists />} />
                  <Route path="/admin/playlists-beta" element={<PlaylistsBeta />} />
                  <Route path="/admin/tags" element={<Tags />} />
                  <Route path="/admin/overseer" element={<Overseer />} />
                  <Route path="/admin/chat-beta" element={<ChatBeta />} />
                  <Route path="/admin/auto-messages" element={<AutoMessages />} />
                  <Route path="/admin/track-manager" element={<TrackManager />} />
                  <Route path="/admin/scoring" element={<Scoring />} />
                </Route>
              </Routes>
            </WebSocketProvider>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
