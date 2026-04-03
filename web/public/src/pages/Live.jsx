import useLiveState from '../hooks/useLiveState';
import ServerStatus from '../components/live/ServerStatus';
import TrackPanel from '../components/live/TrackPanel';
import PlaylistBar from '../components/live/PlaylistBar';
import RacePanel from '../components/live/RacePanel';
import PlayersPanel from '../components/live/PlayersPanel';
import ActivityFeed from '../components/live/ActivityFeed';
import CompetitionWidget from '../components/live/CompetitionWidget';
import ActivityStats from '../components/live/ActivityStats';
import './Live.css';

export default function Live() {
  const state = useLiveState();

  return (
    <div className="live-page">
      <div className="live-grid">
        <div className="live-area-status">
          <ServerStatus connected={state.connected} pluginConnected={state.pluginConnected} />
        </div>

        <div className="live-area-track">
          <TrackPanel
            currentTrack={state.currentTrack}
            trackSince={state.trackSince}
            trackRecord={state.trackRecord}
          />
        </div>

        <div className="live-area-playlist">
          <PlaylistBar playlist={state.playlist} />
        </div>

        <div className="live-area-race">
          <RacePanel
            raceId={state.raceId}
            raceStatus={state.raceStatus}
            pilots={state.pilots}
            raceResult={state.raceResult}
          />
        </div>

        <div className="live-area-players">
          <PlayersPanel players={state.players} playerStats={state.playerStats} connectedBots={state.connectedBots} botNicks={state.botNicks} />
        </div>

        <div className="live-area-feed">
          <ActivityFeed events={state.feedEvents} />
        </div>

        <div className="live-area-comp">
          <CompetitionWidget
            competition={state.competition}
            currentWeek={state.currentWeek}
            standings={state.compStandings}
          />
        </div>

        <div className="live-area-activity">
          <ActivityStats
            pilotActivity={state.pilotActivity}
            statsOverview={state.statsOverview}
          />
        </div>
      </div>
    </div>
  );
}
