const ACHIEVEMENTS = [
  { id: 'first_flight', icon: '\u2708\uFE0F', title: 'First Flight', desc: 'Complete your first race', check: d => d.summary.races_entered >= 1 },
  { id: 'century', icon: '\uD83D\uDD04', title: 'Century', desc: 'Fly 100 laps', check: d => d.summary.total_laps >= 100 },
  { id: 'thousand', icon: '\uD83C\uDFC6', title: 'Thousand Club', desc: 'Fly 1,000 laps', check: d => d.summary.total_laps >= 1000 },
  { id: 'veteran', icon: '\u2B50', title: 'Veteran', desc: 'Enter 50 races', check: d => d.summary.races_entered >= 50 },
  { id: 'explorer', icon: '\uD83C\uDF0D', title: 'Explorer', desc: 'Fly 10 different tracks', check: d => d.summary.tracks_flown >= 10 },
  { id: 'globetrotter', icon: '\uD83D\uDE80', title: 'Globetrotter', desc: 'Fly 25 different tracks', check: d => d.summary.tracks_flown >= 25 },
  { id: 'podium', icon: '\uD83E\uDD47', title: 'Podium', desc: 'Finish top 3 in a race', check: d => d.recentRaces.some(r => r.position <= 3) },
  { id: 'winner', icon: '\uD83C\uDFC1', title: 'Race Winner', desc: 'Win a race', check: d => d.recentRaces.some(r => r.position === 1) },
  { id: 'ace', icon: '\u26A1', title: 'Ace', desc: 'Reach Ace pilot rating', check: d => d.rating?.score >= 90 },
  { id: 'competitor', icon: '\uD83D\uDCC8', title: 'Season Competitor', desc: 'Be active in 4+ competition weeks', check: d => (d.competition?.weeklyStandings?.length || 0) >= 4 },
];

export default function Achievements({ data }) {
  if (!data?.summary) return null;

  return (
    <div className="achievements-section">
      <h2>Achievements</h2>
      <div className="achievements-grid">
        {ACHIEVEMENTS.map(a => {
          const unlocked = a.check(data);
          return (
            <div key={a.id} className={`achievement ${unlocked ? 'unlocked' : 'locked'}`} title={a.desc}>
              <span className="achievement-icon">{a.icon}</span>
              <span className="achievement-title">{a.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
