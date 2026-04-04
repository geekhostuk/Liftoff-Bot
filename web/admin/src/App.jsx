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
import Tags from './pages/Tags.jsx';
import Overseer from './pages/Overseer.jsx';
import AutoMessages from './pages/AutoMessages.jsx';
import TrackManager from './pages/TrackManager.jsx';
import Scoring from './pages/Scoring.jsx';
import Competitions from './pages/Competitions.jsx';
import UserManagement from './pages/UserManagement.jsx';
import IdleKick from './pages/IdleKick.jsx';
import BotRemote from './pages/BotRemote.jsx';
import Bot2Remote from './pages/Bot2Remote.jsx';

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
                  <Route path="/admin/tags" element={<Tags />} />
                  <Route path="/admin/overseer" element={<Overseer />} />
                  <Route path="/admin/auto-messages" element={<AutoMessages />} />
                  <Route path="/admin/track-manager" element={<TrackManager />} />
                  <Route path="/admin/scoring" element={<Scoring />} />
                  <Route path="/admin/competitions" element={<Competitions />} />
                  <Route path="/admin/users" element={<UserManagement />} />
                  <Route path="/admin/idle-kick" element={<IdleKick />} />
                  <Route path="/admin/bot-remote" element={<BotRemote />} />
                  <Route path="/admin/bot2-remote" element={<Bot2Remote />} />
                </Route>
              </Routes>
            </WebSocketProvider>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
