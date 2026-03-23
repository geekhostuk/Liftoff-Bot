import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Plus, Trash2 } from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import DataTable from '../components/data/DataTable.jsx';
import Badge from '../components/feedback/Badge.jsx';
import EmptyState from '../components/data/EmptyState.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';
import { fmtMs } from '../lib/fmt.js';

const MAX_MESSAGES = 100;

const TRIGGER_OPTIONS = ['track_change', 'race_start', 'race_end'];

const columnHelper = createColumnHelper();

export default function Chat() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  // Chat log state
  const [messages, setMessages] = useState([]);
  const logEndRef = useRef(null);

  // Send message state
  const [sendText, setSendText] = useState('');

  // Templates state
  const [templates, setTemplates] = useState([]);
  const [newTemplate, setNewTemplate] = useState({
    trigger: 'track_change',
    template: '',
    delay_ms: 0,
    enabled: true,
  });

  // Auto-scroll on new messages
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WS chat messages
  useWsEvent('chat_message', useCallback((data) => {
    setMessages((prev) => {
      const next = [...prev, { ...data, ts: new Date() }];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
  }, []));

  // Load templates on mount
  const loadTemplates = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/chat/templates');
      setTemplates(data);
    } catch {
      toast('Failed to load templates', 'error');
    }
  }, [apiFetch, toast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Send chat message
  const handleSend = async () => {
    const text = sendText.trim();
    if (!text) return;
    await apiCall('POST', '/api/admin/chat/send', { message: text }, 'Message sent');
    setSendText('');
  };

  const handleSendKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Toggle template enabled
  const handleToggleEnabled = async (row) => {
    const updated = { ...row, enabled: !row.enabled };
    try {
      await apiCall('PUT', `/api/admin/chat/templates/${row.id}`, updated, 'Template updated');
      setTemplates((prev) => prev.map((t) => (t.id === row.id ? updated : t)));
    } catch { /* toast handled by apiCall */ }
  };

  // Delete template
  const handleDelete = async (id) => {
    await apiCall('DELETE', `/api/admin/chat/templates/${id}`, null, 'Template deleted');
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  // Add template
  const handleAdd = async () => {
    if (!newTemplate.template.trim()) {
      toast('Message is required', 'warning');
      return;
    }
    try {
      const created = await apiCall('POST', '/api/admin/chat/templates', {
        trigger: newTemplate.trigger,
        template: newTemplate.template.trim(),
        enabled: newTemplate.enabled,
        delay_ms: Number(newTemplate.delay_ms) || 0,
      }, 'Template added');
      if (created) {
        setTemplates((prev) => [...prev, created]);
      } else {
        await loadTemplates();
      }
      setNewTemplate({ trigger: 'track_change', template: '', delay_ms: 0, enabled: true });
    } catch { /* toast handled by apiCall */ }
  };

  // Table columns
  const columns = [
    columnHelper.accessor('trigger', {
      header: 'Trigger',
      cell: (info) => <Badge variant="accent">{info.getValue()}</Badge>,
    }),
    columnHelper.accessor('template', {
      header: 'Message',
      cell: (info) => <span style={{ color: 'var(--text-secondary)' }}>{info.getValue()}</span>,
    }),
    columnHelper.accessor('delay_ms', {
      header: 'Delay',
      cell: (info) => <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{fmtMs(info.getValue())}</span>,
    }),
    columnHelper.accessor('enabled', {
      header: 'Enabled',
      cell: (info) => (
        <input
          type="checkbox"
          checked={info.getValue()}
          onChange={() => handleToggleEnabled(info.row.original)}
          style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
        />
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: (info) => (
        <ConfirmButton
          onConfirm={() => handleDelete(info.row.original.id)}
          className="btn-icon"
          confirmText="Delete?"
        >
          <Trash2 size={15} />
        </ConfirmButton>
      ),
    }),
  ];

  // Format timestamp as HH:MM:SS
  const fmtTime = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>
        <MessageSquare size={22} style={{ marginRight: 8 }} />
        Chat Management
      </h1>

      {/* Card 1: Chat Log */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Chat Log</h2>
        {messages.length === 0 ? (
          <EmptyState icon={MessageSquare} message="No chat messages yet" />
        ) : (
          <div style={styles.chatLog}>
            {messages.map((m, i) => (
              <div key={i} style={styles.chatMessage}>
                <span style={styles.chatTime}>{fmtTime(m.ts)}</span>
                <span style={styles.chatNick}>{m.nick}</span>
                <span style={styles.chatText}>{m.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Card 2: Send Message */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Send Message</h2>
        <div style={styles.sendRow}>
          <input
            type="text"
            value={sendText}
            onChange={(e) => setSendText(e.target.value)}
            onKeyDown={handleSendKeyDown}
            placeholder="Type a message..."
            style={styles.input}
          />
          <button
            className="btn-primary"
            style={styles.sendBtn}
            onClick={handleSend}
            disabled={!sendText.trim()}
          >
            <Send size={14} style={{ marginRight: 6 }} />
            Send
          </button>
        </div>
      </div>

      {/* Card 3: Automated Templates */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Automated Templates</h2>

        <DataTable
          data={templates}
          columns={columns}
          emptyMessage="No templates configured"
        />

        <div style={styles.addForm}>
          <h3 style={styles.addFormTitle}>Add Template</h3>
          <div style={styles.addRow}>
            <select
              value={newTemplate.trigger}
              onChange={(e) => setNewTemplate((p) => ({ ...p, trigger: e.target.value }))}
              style={styles.select}
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Message template"
              value={newTemplate.template}
              onChange={(e) => setNewTemplate((p) => ({ ...p, template: e.target.value }))}
              style={{ ...styles.input, flex: 2 }}
            />

            <input
              type="number"
              placeholder="Delay (ms)"
              value={newTemplate.delay_ms}
              onChange={(e) => setNewTemplate((p) => ({ ...p, delay_ms: e.target.value }))}
              style={{ ...styles.input, width: 110, flex: 'none' }}
              min={0}
              step={500}
            />

            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={newTemplate.enabled}
                onChange={(e) => setNewTemplate((p) => ({ ...p, enabled: e.target.checked }))}
                style={{ accentColor: 'var(--color-primary)', marginRight: 4 }}
              />
              Enabled
            </label>

            <button
              className="btn-primary"
              style={styles.addBtn}
              onClick={handleAdd}
            >
              <Plus size={14} style={{ marginRight: 4 }} />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1.5rem',
    maxWidth: 960,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    padding: '1.25rem 1.5rem',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 1rem 0',
  },

  /* Chat log */
  chatLog: {
    maxHeight: 400,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    padding: '0.5rem',
    background: 'var(--bg-surface-alt)',
    borderRadius: 'var(--radius-md)',
  },
  chatMessage: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'baseline',
    lineHeight: 1.5,
  },
  chatTime: {
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  chatNick: {
    color: 'var(--color-primary)',
    fontWeight: 600,
    fontSize: '0.9rem',
    flexShrink: 0,
  },
  chatText: {
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    wordBreak: 'break-word',
  },

  /* Send */
  sendRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '0.5rem 0.75rem',
    background: 'var(--bg-surface-alt)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
  },
  sendBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    flexShrink: 0,
  },

  /* Templates add form */
  addForm: {
    marginTop: '1.25rem',
    paddingTop: '1rem',
    borderTop: '1px solid var(--border-color)',
  },
  addFormTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 0.75rem 0',
  },
  addRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.6rem',
    alignItems: 'center',
  },
  select: {
    padding: '0.5rem 0.75rem',
    background: 'var(--bg-surface-alt)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
  },
  checkLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    flexShrink: 0,
  },
};
