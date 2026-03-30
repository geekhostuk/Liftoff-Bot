import { useState } from 'react';
import { fmtMs } from '../../lib/fmt';

export default function PersonalRecords({ records }) {
  const [sortKey, setSortKey] = useState('best_lap_ms');
  const [sortAsc, setSortAsc] = useState(true);

  if (!records || records.length === 0) return null;

  function handleSort(key) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
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
            {sorted.map(r => (
              <tr key={`${r.env}|${r.track}`}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
