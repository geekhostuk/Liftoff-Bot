import { useState, useEffect } from 'react';

export default function CascadeSelect({ catalog, onSelect, showMode = true }) {
  const [env, setEnv] = useState('');
  const [track, setTrack] = useState('');
  const [mode, setMode] = useState('');

  const environments = catalog?.environments || [];
  const selectedEnv = environments.find(e => (e.internal_name || e.caption) === env);
  const tracks = selectedEnv?.tracks || [];
  const gameModes = (catalog?.game_modes || []).filter(m => m.name !== 'None');

  useEffect(() => { setTrack(''); }, [env]);

  const handleSelect = () => {
    if (env && track) {
      onSelect({ env, track, race: mode });
    }
  };

  return (
    <div className="form-row" style={{ flexWrap: 'wrap' }}>
      <div className="form-group" style={{ flex: '1 1 180px' }}>
        <label className="form-label">Environment</label>
        <select className="form-select" value={env} onChange={e => setEnv(e.target.value)}>
          <option value="">— Select environment —</option>
          {environments.map(e => (
            <option key={e.internal_name || e.caption} value={e.internal_name || e.caption}>
              {e.display_name || e.caption}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group" style={{ flex: '1 1 180px' }}>
        <label className="form-label">Track</label>
        <select className="form-select" value={track} onChange={e => setTrack(e.target.value)} disabled={!env}>
          <option value="">— Select track —</option>
          {tracks.map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>
      {showMode && (
        <div className="form-group" style={{ flex: '1 1 140px' }}>
          <label className="form-label">Game Mode</label>
          <select className="form-select" value={mode} onChange={e => setMode(e.target.value)}>
            <option value="">— Any mode —</option>
            {gameModes.map(m => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSelect} disabled={!env || !track}>
          Select
        </button>
      </div>
    </div>
  );
}
