import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

function fmtPct(v) {
  if (v == null) return '';
  return `+${v.toFixed(1)}%`;
}

function weekLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PerformanceTrend({ weeklyTrend }) {
  if (!weeklyTrend || weeklyTrend.length < 2) return null;

  const data = weeklyTrend.map(w => ({
    week: weekLabel(w.week),
    avg: Math.round(w.avg_pct_off * 10) / 10,
    best: Math.round(w.best_pct_off * 10) / 10,
    laps: w.lap_count,
    tracks: w.tracks_flown,
  }));

  return (
    <div className="profile-chart-section">
      <h2>Performance Trend</h2>
      <p className="profile-chart-sub">% off track records — lower is better</p>
      <div className="profile-chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#888' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#888' }}
              tickFormatter={fmtPct}
              reversed
              domain={['dataMin - 1', 'dataMax + 1']}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8, fontSize: 13 }}
              formatter={(val, name) => [fmtPct(val), name]}
              labelFormatter={(label, payload) => {
                if (!payload?.[0]?.payload) return label;
                const d = payload[0].payload;
                return `${label} · ${d.laps} laps · ${d.tracks} track${d.tracks !== 1 ? 's' : ''}`;
              }}
              labelStyle={{ color: '#888' }}
            />
            <Line type="monotone" dataKey="avg" name="Avg Off Record" stroke="#888" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="best" name="Best Off Record" stroke="#00BFFF" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
