import './StatCard.css';

export default function StatCard({ label, value, accent }) {
  return (
    <div className={`stat-card ${accent ? 'stat-card-accent' : ''}`}>
      <div className="stat-card-value">{value ?? '\u2014'}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
