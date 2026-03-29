import { Routes, Route } from 'react-router-dom';
import { UserAuthProvider } from './context/UserAuthContext';
import Nav from './components/layout/Nav';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Competition from './pages/Competition';
import Pilots from './pages/Pilots';
import HowItWorks from './pages/HowItWorks';
import About from './pages/About';
import Live from './pages/Live';
import Tracks from './pages/Tracks';
import TrackBrowse from './pages/TrackBrowse';
import TrackDetail from './pages/TrackDetail';
import Register from './pages/Register';
import Login from './pages/Login';
import Verify from './pages/Verify';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import useLobbyCount from './hooks/useLobbyCount';

export default function App() {
  const lobby = useLobbyCount();

  return (
    <UserAuthProvider>
      <Nav lobby={lobby} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live" element={<Live />} />
          <Route path="/tracks" element={<Tracks />} />
          <Route path="/browse" element={<TrackBrowse />} />
          <Route path="/browse/:env/:track" element={<TrackDetail />} />
          <Route path="/competition" element={<Competition />} />
          <Route path="/pilots" element={<Pilots />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </main>
      <Footer />
    </UserAuthProvider>
  );
}
