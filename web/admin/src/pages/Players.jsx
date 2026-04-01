import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import DataTable from '../components/data/DataTable.jsx';
import SearchInput from '../components/data/SearchInput.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';
import EmptyState from '../components/data/EmptyState.jsx';
import { createColumnHelper } from '@tanstack/react-table';
import { fmtIdleTime } from '../lib/fmt.js';
import { Users, ShieldCheck, LogOut, UserCheck, UserX } from 'lucide-react';

const columnHelper = createColumnHelper();

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-lg)',
    padding: 'var(--space-lg)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-sm)',
    alignItems: 'center',
  },
  actorCell: {
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
  },
  nickCell: {
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  actionBtns: {
    display: 'flex',
    gap: 'var(--space-xs)',
    alignItems: 'center',
  },
};

function idleColor(ms, isWarned) {
  if (isWarned || ms >= 300000) return 'var(--color-danger, #ef4444)';
  if (ms >= 180000) return '#FF7A00';
  return 'var(--text-muted)';
}

export default function Players() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  const [players, setPlayers] = useState([]);
  const [idleTimes, setIdleTimes] = useState({});
  const [warned, setWarned] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [registrationStatus, setRegistrationStatus] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  // Fetch status data
  const fetchStatus = useCallback(async () => {
    try {
      const status = await apiFetch('GET', '/api/status');
      setPlayers(status.online_players || []);
    } catch {
      // handled by apiCall
    }
  }, [apiCall]);

  const fetchIdleStatus = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/idle-kick/status');
      setIdleTimes(data.idleTimes || {});
      setWarned(data.warned || []);
      setWhitelist(data.whitelist || []);
      setRegistrationStatus(data.registrationStatus || {});
    } catch {
      // handled by apiCall
    }
  }, [apiCall]);

  useEffect(() => {
    fetchStatus();
    fetchIdleStatus();
  }, [fetchStatus, fetchIdleStatus]);

  // Poll idle info every 10s
  useEffect(() => {
    const interval = setInterval(fetchIdleStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchIdleStatus]);

  // WS events
  useWsEvent('player_entered', (data) => {
    setPlayers((prev) => {
      if (prev.some((p) => p.actor === data.actor)) return prev;
      return [...prev, { actor: data.actor, nick: data.nick }];
    });
  });

  useWsEvent('player_left', (data) => {
    setPlayers((prev) => prev.filter((p) => p.actor !== data.actor));
  });

  useWsEvent('player_list', (data) => {
    setPlayers(data.players || data || []);
  });

  useWsEvent('state_snapshot', (data) => {
    if (data.online_players) setPlayers(data.online_players);
  });

  useWsEvent('kick_result', (data) => {
    if (data.success) {
      toast(`Kicked ${data.nick || data.actor}`, 'success');
      setPlayers((prev) => prev.filter((p) => p.actor !== data.actor));
    } else {
      toast(`Kick failed: ${data.error || 'Unknown error'}`, 'danger');
    }
  });

  // Actions
  const handleKick = useCallback(async (actor) => {
    try {
      await apiCall('POST', '/api/admin/players/kick', { actor }, 'Kick request sent');
    } catch {
      // handled by apiCall
    }
  }, [apiCall]);

  const handleWhitelistToggle = useCallback(async (nick, isWhitelisted) => {
    try {
      if (isWhitelisted) {
        await apiCall('DELETE', '/api/admin/idle-kick/whitelist', { nick }, `Removed ${nick} from whitelist`);
        setWhitelist((prev) => prev.filter((n) => n.toLowerCase() !== nick.toLowerCase()));
      } else {
        await apiCall('POST', '/api/admin/idle-kick/whitelist', { nick }, `Added ${nick} to whitelist`);
        setWhitelist((prev) => [...prev, nick]);
      }
    } catch {
      // handled by apiCall
    }
  }, [apiCall]);

  // Filter out jmt_bot, sort by actor
  const displayPlayers = useMemo(() => {
    return players
      .filter((p) => String(p.nick || '').toLowerCase() !== 'jmt_bot')
      .sort((a, b) => a.actor - b.actor);
  }, [players]);

  const whitelistLower = useMemo(
    () => new Set((whitelist || []).map((n) => n.toLowerCase())),
    [whitelist],
  );

  const warnedSet = useMemo(() => new Set(warned || []), [warned]);

  const columns = useMemo(() => [
    columnHelper.accessor('nick', {
      header: 'Pilot',
      cell: (info) => <span style={styles.nickCell}>{info.getValue()}</span>,
    }),
    columnHelper.accessor('actor', {
      header: 'Actor',
      cell: (info) => <span style={styles.actorCell}>{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'registered',
      header: 'Registered',
      cell: ({ row }) => {
        const isReg = registrationStatus[row.original.actor];
        if (isReg === undefined) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
        return isReg
          ? <UserCheck size={16} style={{ color: 'var(--color-success, #22c55e)' }} />
          : <UserX size={16} style={{ color: 'var(--text-muted)' }} />;
      },
    }),
    columnHelper.display({
      id: 'idle',
      header: 'Idle Time',
      cell: ({ row }) => {
        const actor = row.original.actor;
        const ms = idleTimes[actor];
        const isWarned = warnedSet.has(actor);
        if (ms == null) return <span style={{ color: 'var(--text-muted)' }}>--</span>;
        return (
          <span style={{ color: idleColor(ms, isWarned), fontWeight: isWarned ? 700 : 400 }}>
            {fmtIdleTime(ms)}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const { actor, nick } = row.original;
        const isWl = whitelistLower.has(nick.toLowerCase());
        return (
          <div style={styles.actionBtns}>
            <ConfirmButton
              className="btn btn-danger btn-sm"
              confirmText={`Kick ${nick}?`}
              onConfirm={() => handleKick(actor)}
            >
              <LogOut size={14} /> Kick
            </ConfirmButton>
            <button
              className={`btn btn-sm ${isWl ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => handleWhitelistToggle(nick, isWl)}
            >
              <ShieldCheck size={14} /> {isWl ? 'Whitelisted' : 'Whitelist'}
            </button>
          </div>
        );
      },
    }),
  ], [idleTimes, warnedSet, whitelistLower, registrationStatus, handleKick, handleWhitelistToggle]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Players</h1>
        <div style={styles.actions}>
          <SearchInput
            value={globalFilter}
            onChange={setGlobalFilter}
            placeholder="Search players..."
          />
        </div>
      </div>

      {displayPlayers.length === 0 ? (
        <EmptyState icon={Users} message="No players online" />
      ) : (
        <DataTable
          data={displayPlayers}
          columns={columns}
          emptyMessage="No players match your search"
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
        />
      )}
    </div>
  );
}
