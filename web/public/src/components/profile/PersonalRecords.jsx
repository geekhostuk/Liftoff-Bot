import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { fmtMs } from '../../lib/fmt';
import { getMyTrackTrend } from '../../lib/api';

function fmtMsShort(ms) {
  if (ms == null) return '';
  const sec = ms / 1000;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
}

function dateLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function TrackTrendChart({ data }) {
  if (!data || data.length < 2) {
    return <p className="text-muted" style={{ padding: '1rem' }}>Not enough data yet</p>;
  }

  const chartData = data.map(d => ({
    date: dateLabel(d.session_date),
    best: Number(d.best_lap_ms),
    avg: d.avg_lap_ms,
    laps: d.lap_count,
  }));

  return (
    <div style={{ padding: '0.75rem 1rem 1rem' }}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#888' }}
            tickFormatter={fmtMsShort}
            domain={['dataMin - 500', 'dataMax + 500']}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8, fontSize: 12 }}
            formatter={(val, name) => [fmtMsShort(val), name]}
            labelFormatter={(label, payload) => {
              if (!payload?.[0]?.payload) return label;
              return `${label} · ${payload[0].payload.laps} laps`;
            }}
            labelStyle={{ color: '#888' }}
          />
          <Line type="monotone" dataKey="avg" name="Avg" stroke="#888" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="best" name="Best" stroke="#00BFFF" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PersonalRecords({ records }) {
  const [sortKey, setSortKey] = useState('best_lap_ms');
  const [sortAsc, setSortAsc] = useState(true);
  const [expanded, setExpanded] = useState(null); // "env|track"
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);

  if (!records || records.length === 0) return null;

  function handleSort(key) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  async function handleRowClick(r) {
    const key = `${r.env}|${r.track}`;
    if (expanded === key) {
      setExpanded(null);
      setTrendData(null);
      return;
    }
    setExpanded(key);
    setTrendData(null);
    setTrendLoading(true);
    try {
      const res = await getMyTrackTrend(r.env, r.track);
      setTrendData(res.trend);
    } catch {
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  }

  const sorted = [...records].sort((a, b) => {
    const va = a[sortKey] ?? Infinity;
    const vb = b[sortKey] ?? Infinity;
    return sortAsc ? va - vb : vb - va;
  });

  const arrow = (key) => sortKey === key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  return (
    <div className="profile-table-section">
      <h2>Personal Records</h2>
      <p className="profile-chart-sub">Click a track to see your improvement over time</p>
      <div className="profile-table-wrap">
        <table className="profile-table">
          <thead>
            <tr>
              <th>Track</th>
              <th className="sortable" onClick={() => handleSort('best_lap_ms')}>
                Best Lap{arrow('best_lap_ms')}
              </th>
              <th className="sortable" onClick={() => handleSort('global_best_ms')}>
                Track Record{arrow('global_best_ms')}
              </th>
              <th className="sortable" onClick={() => handleSort('pct_off_record')}>
                Off Record{arrow('pct_off_record')}
              </th>
              <th className="sortable" onClick={() => handleSort('laps_on_track')}>
                Laps{arrow('laps_on_track')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const key = `${r.env}|${r.track}`;
              const isExpanded = expanded === key;
              return [
                <tr
                  key={key}
                  className={isExpanded ? 'row-expanded' : 'row-clickable'}
                  onClick={() => handleRowClick(r)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{r.track}</td>
                  <td>{fmtMs(r.best_lap_ms)}</td>
                  <td className="text-muted">{fmtMs(r.global_best_ms)}</td>
                  <td>
                    {r.pct_off_record != null ? (
                      <span className={r.pct_off_record === 0 ? 'text-accent' : 'text-muted'}>
                        {r.pct_off_record === 0 ? 'RECORD' : `+${r.pct_off_record}%`}
                      </span>
                    ) : '\u2014'}
                  </td>
                  <td>{r.laps_on_track}</td>
                </tr>,
                isExpanded && (
                  <tr key={`${key}-trend`} className="trend-row">
                    <td colSpan={5}>
                      {trendLoading
                        ? <p className="text-muted" style={{ padding: '1rem' }}>Loading...</p>
                        : <TrackTrendChart data={trendData} />
                      }
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
