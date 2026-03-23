import './HowItWorks.css';

const SCORING = [
  {
    title: 'Position Points',
    desc: 'F1-style points based on race finish: 25, 18, 15, 12, 10, 8, 6, 4... Awarded at the end of each race with 2+ finishers.',
    icon: '\uD83C\uDFC1',
  },
  {
    title: 'Lap Volume',
    desc: '1 point per 5 laps completed in a race, capped at 10 points. Fly more laps, earn more points.',
    icon: '\uD83D\uDD04',
  },
  {
    title: 'Lap Leader',
    desc: '5 bonus points for completing the most laps in a single race (requires 3+ participants).',
    icon: '\uD83D\uDE80',
  },
  {
    title: 'Hot Streak',
    desc: '3 points for setting the fastest single lap in a race (requires 3+ participants).',
    icon: '\u26A1',
  },
  {
    title: 'Consistency',
    desc: '3 points if your lap time variance is below the race median. Drops the worst 20% of laps before calculating.',
    icon: '\uD83C\uDFAF',
  },
  {
    title: 'Personal Best',
    desc: '3 points per track where you beat your pre-week personal best. Awarded at week finalisation.',
    icon: '\u2B50',
  },
  {
    title: 'Most Improved',
    desc: 'Top 3 pilots by average improvement percentage earn 15, 10, and 5 points. Awarded at week finalisation.',
    icon: '\uD83D\uDCC8',
  },
  {
    title: 'Participation',
    desc: 'Based on active racing days and track variety: 7+ days = 30 pts, 5+ = 20 pts, 3+ = 10 pts. 3+ distinct tracks = +5 pts bonus.',
    icon: '\uD83D\uDCAA',
  },
];

const FAQ = [
  {
    q: 'Do I need to sign up?',
    a: 'No. If you race during an active competition week, your results are automatically tracked. Just fly in Liftoff on the league server.',
  },
  {
    q: 'When do weeks start and end?',
    a: 'Every week runs Monday 00:00 UTC to Sunday 23:59 UTC.',
  },
  {
    q: 'What happens between weeks?',
    a: 'Weeks can be Scheduled, Active, or Finalised. Between active weeks you can still fly, but points are only awarded during active weeks.',
  },
  {
    q: 'How are ties broken?',
    a: 'Pilots are ranked by total points. In a tie, the pilot with more weeks active is ranked higher.',
  },
  {
    q: 'What are real-time vs finalised points?',
    a: 'Position, laps, lap leader, hot streak, and consistency points are awarded in real-time after each race. Personal best, most improved, and participation are batch-calculated when a week is finalised.',
  },
  {
    q: 'Which tracks are in rotation?',
    a: 'The admin configures weekly playlists that rotate automatically. You race whatever track is active.',
  },
];

export default function HowItWorks() {
  return (
    <div className="hiw-page">
      <h1><span className="accent">How</span> It Works</h1>
      <p className="hiw-intro">
        JMT FPV League is a weekly competition that tracks your Liftoff race results automatically.
        Here's everything you need to know.
      </p>

      {/* Season Structure */}
      <section className="hiw-section">
        <h2>Season Structure</h2>
        <div className="hiw-text">
          <p>
            Each season contains multiple competition weeks. Weeks run from <strong>Monday 00:00 UTC</strong> to{' '}
            <strong>Sunday 23:59 UTC</strong>. During an active week, every race you complete on the league server
            earns you points towards your weekly and season standings.
          </p>
        </div>
      </section>

      {/* Weekly Lifecycle */}
      <section className="hiw-section">
        <h2>Weekly Lifecycle</h2>
        <div className="hiw-lifecycle">
          <div className="lifecycle-step">
            <span className="status-dot scheduled" />
            <strong>Scheduled</strong>
            <p>Week is planned but not yet active. No points awarded.</p>
          </div>
          <div className="lifecycle-arrow">&rarr;</div>
          <div className="lifecycle-step">
            <span className="status-dot active" />
            <strong>Active</strong>
            <p>Race results are tracked and real-time points are awarded after each race.</p>
          </div>
          <div className="lifecycle-arrow">&rarr;</div>
          <div className="lifecycle-step">
            <span className="status-dot finalised" />
            <strong>Finalised</strong>
            <p>Batch bonuses calculated (personal best, most improved, participation). Final standings locked.</p>
          </div>
        </div>
      </section>

      {/* Playlists */}
      <section className="hiw-section">
        <h2>Track Rotation</h2>
        <div className="hiw-text">
          <p>
            Each week has a playlist of tracks that rotate automatically. You race whatever track is currently active.
            The playlist cycles through all assigned tracks on a timer, ensuring variety throughout the week.
          </p>
        </div>
      </section>

      {/* Scoring */}
      <section className="hiw-section">
        <h2>Scoring Breakdown</h2>
        <div className="hiw-scoring-grid">
          {SCORING.map(s => (
            <div key={s.title} className="hiw-scoring-card">
              <div className="hiw-scoring-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Eligibility */}
      <section className="hiw-section">
        <h2>Eligibility</h2>
        <div className="hiw-text">
          <p>
            You are automatically included in the competition when you complete a race during an active week.
            There is no registration required. Simply join the Liftoff server and race.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="hiw-section">
        <h2>FAQ</h2>
        <div className="hiw-faq">
          {FAQ.map((f, i) => (
            <div key={i} className="faq-item">
              <h4>{f.q}</h4>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
