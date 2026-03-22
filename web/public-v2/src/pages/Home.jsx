import useApi from '../hooks/useApi';
import { getCompetitionCurrent, getSeasonStandings, getCurrentWeekStandings } from '../lib/api';
import Hero from '../components/home/Hero';
import CompSummary from '../components/home/CompSummary';
import TopPilots from '../components/home/TopPilots';
import WeekHighlights from '../components/home/WeekHighlights';
import HowItWorksPreview from '../components/home/HowItWorksPreview';
import CommunityCTA from '../components/home/CommunityCTA';

export default function Home() {
  const { data: compData } = useApi(() => getCompetitionCurrent().catch(() => null), []);
  const { data: seasonStandings } = useApi(() => getSeasonStandings().catch(() => []), []);
  const { data: weekStandings } = useApi(() => getCurrentWeekStandings().catch(() => []), []);

  const competition = compData?.competition;
  const currentWeek = compData?.current_week;

  return (
    <div className="home-page">
      <Hero />
      <CompSummary competition={competition} currentWeek={currentWeek} />
      <TopPilots standings={seasonStandings} />
      <WeekHighlights standings={weekStandings} />
      <HowItWorksPreview />
      <CommunityCTA />
    </div>
  );
}
