import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { Trophy, RefreshCw } from 'lucide-react';

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' },
  panel: { background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', border: '1px solid var(--border-color)' },
  panelTitle: { fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--border-color)' },
  label: { fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 },
  value: { fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 },
  btnRow: { display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: '#FF7A00', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem' },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' },
  tdNum: { padding: '8px 10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  empty: { color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: 'var(--space-md) 0' },
};

function fmtDate(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Scoring() {
  const { apiFetch, apiCall } = useApi();
  const [week, setWeek] = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/scoring/current-week');
      setWeek(data.week);
      setStandings(data.standings || []);
    } catch {
      setWeek(null);
      setStandings([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRecalculate = async () => {
    if (!week) return;
    setRecalculating(true);
    try {
      const result = await apiCall('POST', `/api/admin/scoring/recalculate/${week.id}`, null, 'Scores recalculated');
      if (result.standings) setStandings(result.standings);
      else await fetchData();
    } catch { /* apiCall already toasts */ }
    setRecalculating(false);
  };

  if (loading) return <div style={styles.page}><p style={styles.empty}>Loading...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.panel}>
        <div style={styles.panelTitle}><Trophy size={18} /> Current Competition Week</div>
        {week ? (
          <>
            <div style={styles.row}>
              <span style={styles.label}>Week</span>
              <span style={styles.value}>{week.week_number}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Start</span>
              <span style={styles.value}>{fmtDate(week.starts_at)}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>End</span>
              <span style={styles.value}>{fmtDate(week.ends_at)}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>Status</span>
              <span style={styles.value}>{week.status}</span>
            </div>
            <div style={styles.btnRow}>
              <button style={styles.btn} onClick={handleRecalculate} disabled={recalculating}>
                <RefreshCw size={14} /> {recalculating ? 'Recalculating...' : 'Recalculate Scores'}
              </button>
            </div>
          </>
        ) : (
          <p style={styles.empty}>No active scoring period</p>
        )}
      </div>

      <div style={styles.panel}>
        <div style={styles.panelTitle}><Trophy size={18} /> Standings</div>
        {standings.length === 0 ? (
          <p style={styles.empty}>No standings yet</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Pilot</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Position</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Laps</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Consistency</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Streak</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Improved</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Participation</th>
              </tr>
            </thead>
            <tbody>
              {standings.map(s => (
                <tr key={s.pilot_key}>
                  <td style={styles.td}>{s.rank}</td>
                  <td style={styles.td}>{s.display_name}</td>
                  <td style={{ ...styles.tdNum, fontWeight: 700 }}>{s.total_points}</td>
                  <td style={styles.tdNum}>{s.position_points || 0}</td>
                  <td style={styles.tdNum}>{s.laps_points || 0}</td>
                  <td style={styles.tdNum}>{s.consistency_points || 0}</td>
                  <td style={styles.tdNum}>{s.streak_points || 0}</td>
                  <td style={styles.tdNum}>{s.improved_points || 0}</td>
                  <td style={styles.tdNum}>{s.participation_points || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
