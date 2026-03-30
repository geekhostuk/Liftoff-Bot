export default function PilotRating({ rating }) {
  if (!rating) return null;

  const BREAKDOWN = [
    { key: 'speed', label: 'Speed', hint: 'How close to track records across your tracks' },
    { key: 'consistency', label: 'Consistency', hint: 'Lap time repeatability within each track' },
    { key: 'competitive', label: 'Competitive', hint: 'Finish position vs other pilots' },
    { key: 'activity', label: 'Activity', hint: 'Days active in the last 30 days' },
  ];

  return (
    <div className="pilot-rating">
      <div className="rating-badge">
        <div className={`rating-circle tier-${rating.tier.toLowerCase()}`}>
          <span className="rating-score">{rating.score}</span>
        </div>
        <div className="rating-info">
          <span className="rating-tier">{rating.tier}</span>
          <span className="rating-percentile">Top {100 - rating.percentile}%</span>
        </div>
      </div>
      <div className="rating-breakdown">
        {BREAKDOWN.map(b => (
          <div key={b.key} className="rating-bar-row" title={b.hint}>
            <span className="rating-bar-label">{b.label}</span>
            <div className="rating-bar-track">
              <div
                className={`rating-bar-fill tier-${rating.tier.toLowerCase()}`}
                style={{ width: `${rating.breakdown[b.key]}%` }}
              />
            </div>
            <span className="rating-bar-value">{rating.breakdown[b.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
