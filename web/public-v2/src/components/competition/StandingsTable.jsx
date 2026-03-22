import { useRef, useEffect } from 'react';
import RankMedal from '../ui/RankMedal';
import './StandingsTable.css';

/**
 * Reusable standings table for both season and weekly views.
 * @param {object} props
 * @param {Array} props.standings – array of standing rows
 * @param {'season'|'weekly'} props.variant – controls which columns to show
 * @param {(pilotKey: string) => void} props.onPilotClick – pilot drill-down handler
 * @param {Set<string>} [props.flashKeys] – pilot_keys that just updated (for animation)
 */
export default function StandingsTable({ standings, variant = 'season', onPilotClick, flashKeys }) {
  const prevKeysRef = useRef(new Set());

  useEffect(() => {
    if (flashKeys) {
      prevKeysRef.current = flashKeys;
    }
  }, [flashKeys]);

  if (!standings || standings.length === 0) {
    return (
      <div className="table-wrap">
        <table className="data-table standings-table">
          <tbody>
            <tr className="empty-row">
              <td colSpan={variant === 'season' ? 9 : 9}>
                {variant === 'season' ? 'No competition data yet.' : 'No results for this week yet.'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const isSeason = variant === 'season';

  return (
    <div className="table-wrap">
      <table className="data-table standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pilot</th>
            <th>Total</th>
            {isSeason && <th>Wks</th>}
            <th>Pos</th>
            <th>Laps</th>
            <th>Con</th>
            {!isSeason && <th>Str</th>}
            <th>Imp</th>
            <th>Part</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const rank = isSeason ? i + 1 : s.rank;
            const shouldFlash = flashKeys && flashKeys.has(s.pilot_key);
            return (
              <tr key={s.pilot_key} className={shouldFlash ? 'row-flash' : ''}>
                <td className="rank">
                  <RankMedal rank={rank} />
                </td>
                <td
                  className="pilot-name"
                  onClick={() => onPilotClick && onPilotClick(s.pilot_key)}
                >
                  {s.display_name}
                </td>
                <td className="pts pts-highlight">{s.total_points}</td>
                {isSeason && <td className="pts-sub">{s.weeks_active || 0}</td>}
                <td className="pts-sub">{s.position_points}</td>
                <td className="pts-sub">{s.laps_points}</td>
                <td className="pts-sub">{s.consistency_points}</td>
                {!isSeason && <td className="pts-sub">{s.streak_points}</td>}
                <td className="pts-sub">{s.improved_points}</td>
                <td className="pts-sub">{s.participation_points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
