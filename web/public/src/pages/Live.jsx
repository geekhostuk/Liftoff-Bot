import { useState } from 'react';
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
  const [selectedRoom, setSelectedRoom] = useState(null); // null = all rooms (default view)

  const hasMultipleRooms = state.rooms && state.rooms.length > 1;

  return (
    <div className="live-page">
      {/* Room tabs — only shown when there are multiple rooms */}
      {hasMultipleRooms && (
        <div className="live-room-tabs" style={{ display: 'flex', gap: '8px', padding: '8px 0', marginBottom: '8px' }}>
          <button
            className={`room-tab ${!selectedRoom ? 'room-tab--active' : ''}`}
            style={{
              padding: '6px 16px', borderRadius: '20px', border: '1px solid var(--border-color, #333)',
              background: !selectedRoom ? 'var(--accent, #FF7A00)' : 'var(--bg-surface, #1a1a2e)',
              color: !selectedRoom ? '#fff' : 'var(--text-muted, #888)',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
            onClick={() => setSelectedRoom(null)}
          >
            All Rooms
          </button>
          {state.rooms.map(r => (
            <button
              key={r.room_id}
              className={`room-tab ${selectedRoom === r.room_id ? 'room-tab--active' : ''}`}
              style={{
                padding: '6px 16px', borderRadius: '20px', border: '1px solid var(--border-color, #333)',
                background: selectedRoom === r.room_id ? 'var(--accent, #FF7A00)' : 'var(--bg-surface, #1a1a2e)',
                color: selectedRoom === r.room_id ? '#fff' : 'var(--text-muted, #888)',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}
              onClick={() => setSelectedRoom(r.room_id)}
            >
              {r.label || r.room_id} ({(r.online_players || []).length})
            </button>
          ))}
        </div>
      )}

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
