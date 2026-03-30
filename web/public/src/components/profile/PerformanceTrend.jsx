import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

function fmtMsShort(ms) {
  if (ms == null) return '';
  const sec = ms / 1000;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
}

function weekLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function PerformanceTrend({ weeklyTrend }) {
  if (!weeklyTrend || weeklyTrend.length < 2) return null;

  const data = weeklyTrend.map(w => ({
    week: weekLabel(w.week),
    avg: Math.round(w.avg_lap_ms),
    best: Number(w.best_lap_ms),
    laps: w.lap_count,
  }));

  return (
    <div className="profile-chart-section">
      <h2>Lap Time Trend</h2>
      <p className="profile-chart-sub">Weekly average and best lap times</p>
      <div className="profile-chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#888' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#888' }}
              tickFormatter={fmtMsShort}
              domain={['dataMin - 500', 'dataMax + 500']}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8, fontSize: 13 }}
              formatter={(val) => [fmtMsShort(val)]}
              labelStyle={{ color: '#888' }}
            />
            <Line type="monotone" dataKey="avg" name="Avg" stroke="#888" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="best" name="Best" stroke="#00BFFF" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
