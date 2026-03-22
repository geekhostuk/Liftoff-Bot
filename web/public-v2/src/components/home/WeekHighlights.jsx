import AwardCards from '../competition/AwardCards';

export default function WeekHighlights({ standings }) {
  if (!standings || standings.length === 0) return null;

  return (
    <section className="week-highlights" style={{ marginBottom: 'var(--space-2xl)' }}>
      <h2 className="section-title"><span className="accent">Week</span> Highlights</h2>
      <AwardCards standings={standings} />
    </section>
  );
}
