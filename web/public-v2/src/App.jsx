import { Routes, Route } from 'react-router-dom';
import Nav from './components/layout/Nav';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Competition from './pages/Competition';
import Pilots from './pages/Pilots';
import HowItWorks from './pages/HowItWorks';
import About from './pages/About';
import useLobbyCount from './hooks/useLobbyCount';

export default function App() {
  const lobby = useLobbyCount();

  return (
    <>
      <Nav lobby={lobby} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/competition" element={<Competition />} />
          <Route path="/pilots" element={<Pilots />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
