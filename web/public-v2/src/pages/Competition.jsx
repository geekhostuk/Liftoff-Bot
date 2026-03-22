import { useState, useCallback } from 'react';
import useApi from '../hooks/useApi';
import useWebSocket from '../hooks/useWebSocket';
import { getCompetitionCurrent, getCompetitionWeeks, getSeasonStandings, getWeeklyStandings } from '../lib/api';
import CompBanner from '../components/competition/CompBanner';
import WeekTabs from '../components/competition/WeekTabs';
import StandingsTable from '../components/competition/StandingsTable';
import AwardCards from '../components/competition/AwardCards';
import PilotDetail from '../components/competition/PilotDetail';
import StatusDot from '../components/ui/StatusDot';
import { Loading, ErrorState } from '../components/ui/EmptyState';
import './Competition.css';

export default function Competition() {
  const [selectedWeekId, setSelectedWeekId] = useState(null);
  const [weeklyStandings, setWeeklyStandings] = useState(null);
  const [flashKeys, setFlashKeys] = useState(null);
  const [selectedPilot, setSelectedPilot] = useState(null);

  // Fetch competition info
  const { data: compData, loading: compLoading, error: compError, refetch: refetchComp } = useApi(
    () => getCompetitionCurrent(), []
  );

  // Fetch weeks
  const { data: weeks, refetch: refetchWeeks } = useApi(
    () => getCompetitionWeeks().catch(() => []), []
  );

  // Fetch season standings
  const { data: seasonStandings, refetch: refetchSeason } = useApi(
    () => getSeasonStandings().catch(() => []), []
  );

  // Load weekly standings when a week is selected
  const loadWeekly = useCallback(async (weekId) => {
    setSelectedWeekId(weekId);
    try {
      const data = await getWeeklyStandings(weekId);
      setWeeklyStandings(data);
    } catch {
      setWeeklyStandings([]);
    }
  }, []);

  // Auto-select the best week once weeks are loaded
  const weeksLoaded = weeks && weeks.length > 0;
  if (weeksLoaded && selectedWeekId === null) {
    const active = weeks.find(w => w.status === 'active');
    const fallback = [...weeks].reverse().find(w => w.status === 'finalised');
    const target = active || fallback || weeks[0];
    if (target) {
      // Schedule to avoid setState during render
      setTimeout(() => loadWeekly(target.id), 0);
    }
  }

  // WebSocket for live updates
  const { connected } = useWebSocket(useCallback((event) => {
    if (event.event_type === 'competition_standings_update') {
      if (event.week_id === selectedWeekId) {
        getWeeklyStandings(selectedWeekId)
          .then(data => {
            setWeeklyStandings(data);
            // Flash updated rows
            const keys = new Set(data.map(s => s.pilot_key));
            setFlashKeys(keys);
            setTimeout(() => setFlashKeys(null), 1100);
          })
          .catch(() => {});
      }
      refetchSeason();
    } else if (event.event_type === 'competition_week_started' || event.event_type === 'competition_week_finalised') {
      refetchComp();
      refetchWeeks();
      refetchSeason();
    }
  }, [selectedWeekId, refetchComp, refetchWeeks, refetchSeason]));

  if (compLoading) return <Loading message="Loading competition..." />;
  if (compError) return <ErrorState message="Failed to load competition data." onRetry={refetchComp} />;

  const competition = compData?.competition;
  const currentWeek = compData?.current_week;

  return (
    <div className="competition-page">
      <div className="comp-page-status">
        <StatusDot connected={connected} />
      </div>

      <CompBanner competition={competition} currentWeek={currentWeek} />

      {competition && (
        <>
          {/* Season Standings */}
          <section className="comp-section">
            <h2 className="section-title">
              <span className="accent">Season</span> Standings
            </h2>
            <StandingsTable
              standings={seasonStandings || []}
              variant="season"
              onPilotClick={setSelectedPilot}
              flashKeys={flashKeys}
            />
          </section>

          {/* Weekly Standings */}
          <section className="comp-section">
            <h2 className="section-title">
              <span className="accent">Weekly</span> Standings
            </h2>
            <WeekTabs weeks={weeks || []} selectedWeekId={selectedWeekId} onSelect={loadWeekly} />
            <StandingsTable
              standings={weeklyStandings || []}
              variant="weekly"
              onPilotClick={setSelectedPilot}
              flashKeys={flashKeys}
            />
          </section>

          {/* Awards */}
          <section className="comp-section">
            <h2 className="section-title">
              <span className="accent">Award</span> Highlights
            </h2>
            <AwardCards standings={weeklyStandings || []} />
          </section>
        </>
      )}

      {/* Pilot Detail Modal */}
      {selectedPilot && (
        <PilotDetail pilotKey={selectedPilot} onClose={() => setSelectedPilot(null)} />
      )}
    </div>
  );
}
