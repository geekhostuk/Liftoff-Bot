import './AwardCards.css';

const AWARD_DEFS = [
  { key: 'overall', icon: '\uD83C\uDFC6', title: 'Overall Leader', field: 'total_points', suffix: 'pts' },
  { key: 'speed', icon: '\u26A1', title: 'Speed Demon', field: 'position_points', suffix: 'position pts' },
  { key: 'laps', icon: '\uD83D\uDE80', title: 'Most Laps', field: 'laps_points', suffix: 'lap pts' },
  { key: 'consistency', icon: '\uD83C\uDFAF', title: 'Most Consistent', field: 'consistency_points', suffix: 'consistency pts' },
  { key: 'streak', icon: '\uD83D\uDD25', title: 'Hot Streak', field: 'streak_points', suffix: 'streak pts' },
  { key: 'participation', icon: '\uD83D\uDCAA', title: 'Iron Pilot', field: 'participation_points', suffix: 'participation pts' },
];

export default function AwardCards({ standings }) {
  if (!standings || standings.length === 0) {
    return (
      <div className="awards-empty">No awards yet for this week.</div>
    );
  }

  const cards = AWARD_DEFS.map(def => {
    if (def.key === 'overall') {
      const pilot = standings[0];
      return { ...def, pilot, value: pilot[def.field] };
    }
    const sorted = [...standings].sort((a, b) => (b[def.field] || 0) - (a[def.field] || 0));
    const pilot = sorted[0];
    return { ...def, pilot, value: pilot[def.field] || 0 };
  }).filter(c => c.pilot && c.value > 0);

  if (cards.length === 0) {
    return <div className="awards-empty">No awards yet.</div>;
  }

  return (
    <div className="awards-grid">
      {cards.map(c => (
        <div key={c.key} className="award-card">
          <div className="award-card-icon">{c.icon}</div>
          <div className="award-card-title">{c.title}</div>
          <div className="award-card-name">{c.pilot.display_name}</div>
          <div className="award-card-stat">{c.value} {c.suffix}</div>
        </div>
      ))}
    </div>
  );
}
