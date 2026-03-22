export default function RankMedal({ rank }) {
  const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
  return <span className={`rank ${cls}`}>{rank}</span>;
}
