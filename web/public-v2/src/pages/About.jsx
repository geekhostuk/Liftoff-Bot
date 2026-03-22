import { Link } from 'react-router-dom';
import useApi from '../hooks/useApi';
import { getStatsOverview } from '../lib/api';
import { fmtNumber } from '../lib/fmt';
import StatCard from '../components/ui/StatCard';
import './About.css';

export default function About() {
  const { data: stats } = useApi(() => getStatsOverview().catch(() => null), []);

  return (
    <div className="about-page">
      <h1><span className="accent">About</span> JMT FPV League</h1>

      {/* Stats banner */}
      {stats && (
        <div className="about-stats grid-3">
          <StatCard label="Total Laps" value={fmtNumber(stats.total_laps)} />
          <StatCard label="Pilots" value={fmtNumber(stats.total_pilots)} />
          <StatCard label="Races" value={fmtNumber(stats.total_races)} />
        </div>
      )}

      {/* Mission */}
      <section className="about-section">
        <h2>What Is JMT FPV League?</h2>
        <p>
          JMT FPV League is a weekly FPV drone racing competition run through{' '}
          <a href="https://store.steampowered.com/app/410340/Liftoff_FPV_Drone_Racing/" target="_blank" rel="noopener noreferrer">Liftoff</a>.
          Every race you fly on the league server is automatically tracked, scored, and ranked against other pilots.
        </p>
        <p>
          The league is designed to be accessible and community-driven. There's no registration required &mdash;
          just join the server, fly, and your results appear in the standings. Whether you're a casual flyer or a
          competitive racer, there's a place for you on the leaderboard.
        </p>
      </section>

      {/* Founder */}
      <section className="about-section">
        <h2>Behind the League</h2>
        <p>
          The league is created and run by <strong>JMT (Jesus McTwos)</strong> &mdash; a Liftoff enthusiast who
          wanted to bring structured, automated competition to the FPV sim community. The entire platform, from
          real-time race tracking to automated scoring, is custom-built to make competitive FPV as frictionless
          as possible.
        </p>
      </section>

      {/* Community */}
      <section className="about-section">
        <h2>Community First</h2>
        <p>
          This isn't a corporate esports operation. It's a community project built by a pilot, for pilots.
          The goal is to make weekly FPV competition fun, fair, and easy to follow. Every feature is designed
          around what makes the racing experience better.
        </p>
      </section>

      {/* Links */}
      <section className="about-section">
        <h2>Connect</h2>
        <div className="about-links">
          <a
            href="https://store.steampowered.com/app/410340/Liftoff_FPV_Drone_Racing/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            Liftoff on Steam
          </a>
          <Link to="/competition" className="btn btn-primary">
            View Competition
          </Link>
        </div>
      </section>

      {/* Powered by */}
      <div className="about-powered">
        Race data powered by Liftoff &middot; Platform built with care by JMT
      </div>
    </div>
  );
}
