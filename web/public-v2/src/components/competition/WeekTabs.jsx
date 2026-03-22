import './WeekTabs.css';

export default function WeekTabs({ weeks, selectedWeekId, onSelect }) {
  if (!weeks || weeks.length === 0) return null;

  return (
    <div className="week-tabs">
      {weeks.map(w => (
        <button
          key={w.id}
          className={`week-tab ${selectedWeekId === w.id ? 'active' : ''}`}
          onClick={() => onSelect(w.id)}
        >
          Week {w.week_number}
          <span className={`status-dot ${w.status}`} />
        </button>
      ))}
    </div>
  );
}
