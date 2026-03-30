import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

function raceLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function RacePositionChart({ recentRaces }) {
  if (!recentRaces || recentRaces.length < 3) return null;

  const data = [...recentRaces].reverse().map(r => ({
    date: raceLabel(r.started_at),
    position: r.position,
    track: r.track,
    participants: r.participants,
  }));

  return (
    <div className="profile-chart-section">
      <h2>Race Positions</h2>
      <p className="profile-chart-sub">Finish position in recent races (lower is better)</p>
      <div className="profile-chart">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} />
            <YAxis
              reversed
              domain={[1, 'dataMax']}
              tick={{ fontSize: 11, fill: '#888' }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8, fontSize: 13 }}
              formatter={(val, name, props) => [`P${val} of ${props.payload.participants}`, props.payload.track]}
              labelStyle={{ color: '#888' }}
            />
            <Area
              type="monotone"
              dataKey="position"
              stroke="#00BFFF"
              fill="rgba(0,191,255,0.1)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
