import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Search, X } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import EmptyState from '../components/data/EmptyState.jsx';

const MAX_MESSAGES = 100;
const CHAR_LIMIT = 255;

export default function Chat() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  // Chat log
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('');
  const logEndRef = useRef(null);

  // Send message
  const [sendText, setSendText] = useState('');
  const textareaRef = useRef(null);

  // Variables
  const [variables, setVariables] = useState([]);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useWsEvent('chat_message', useCallback((data) => {
    setMessages((prev) => {
      const next = [...prev, { ...data, ts: new Date() }];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
  }, []));

  // Load available variables
  useEffect(() => {
    apiFetch('GET', '/api/admin/chat/template-variables')
      .then(setVariables)
      .catch(() => {});
  }, [apiFetch]);

  const filteredMessages = filter
    ? messages.filter((m) => {
        const q = filter.toLowerCase();
        return m.nick?.toLowerCase().includes(q) || m.message?.toLowerCase().includes(q);
      })
    : messages;

  // Send
  const handleSend = async () => {
    const text = sendText.trim();
    if (!text) return;
    await apiCall('POST', '/api/admin/chat/send', { message: text }, 'Message sent');
    setSendText('');
    setPreview(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Insert variable at cursor
  const insertVariable = (key) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const token = `{${key}}`;
    const next = sendText.slice(0, start) + token + sendText.slice(end);
    setSendText(next);
    setPreview(null);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  // Preview
  const handlePreview = async () => {
    if (!sendText.trim()) return;
    try {
      const result = await apiFetch('POST', '/api/admin/chat/template-preview', { template: sendText });
      setPreview(result);
    } catch {
      toast('Preview failed', 'error');
    }
  };

  const charCount = sendText.length;
  const charColor = charCount > CHAR_LIMIT ? 'var(--color-danger)' : charCount > 240 ? '#f97316' : charCount > 200 ? '#eab308' : 'var(--text-muted)';

  const fmtTime = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>
        <MessageSquare size={22} style={{ marginRight: 8 }} />
        Chat
      </h1>

      {/* Chat Log */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Chat Log</h2>
          <div style={styles.filterWrap}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter messages..."
              style={styles.filterInput}
            />
            {filter && (
              <button onClick={() => setFilter('')} style={styles.filterClear}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {filteredMessages.length === 0 ? (
          <EmptyState icon={MessageSquare} message={filter ? 'No matching messages' : 'No chat messages yet'} />
        ) : (
          <div style={styles.chatLog}>
            {filteredMessages.map((m, i) => (
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

      {/* Send Message */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Send Message</h2>

        {/* Variable chips */}
        {variables.length > 0 && (
          <div style={styles.varsSection}>
            <span style={styles.varsLabel}>Insert variable:</span>
            <div style={styles.varsChips}>
              {variables.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  style={styles.varChip}
                  title={v.description}
                >
                  {`{${v.key}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={sendText}
          onChange={(e) => { setSendText(e.target.value); setPreview(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={3}
          style={styles.textarea}
        />

        <div style={styles.sendFooter}>
          <span style={{ ...styles.charCount, color: charColor }}>
            {charCount} / {CHAR_LIMIT}
          </span>
          <div style={styles.sendActions}>
            <button
              className="btn-outline"
              style={styles.previewBtn}
              onClick={handlePreview}
              disabled={!sendText.trim()}
            >
              Preview
            </button>
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

        {preview && (
          <div style={styles.previewBox}>
            <span style={styles.previewLabel}>Preview ({preview.length} chars):</span>
            <span style={styles.previewText}>{preview.resolved}</span>
          </div>
        )}
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
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
    gap: '1rem',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
    flexShrink: 0,
  },
  filterWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.35rem 0.6rem',
    background: 'var(--bg-surface-alt)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    maxWidth: 240,
    flex: 1,
  },
  filterInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    outline: 'none',
  },
  filterClear: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
  },
  chatLog: {
    maxHeight: 500,
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
  varsSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
    flexWrap: 'wrap',
  },
  varsLabel: {
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    flexShrink: 0,
  },
  varsChips: {
    display: 'flex',
    gap: '0.35rem',
    flexWrap: 'wrap',
  },
  varChip: {
    padding: '0.2rem 0.5rem',
    background: 'rgba(139, 92, 246, 0.12)',
    color: '#a78bfa',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    background: 'var(--bg-surface-alt)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  sendFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '0.5rem',
  },
  charCount: {
    fontSize: '0.8rem',
    fontFamily: 'monospace',
  },
  sendActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  previewBtn: {
    padding: '0.4rem 0.8rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  sendBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.4rem 1rem',
    cursor: 'pointer',
  },
  previewBox: {
    marginTop: '0.75rem',
    padding: '0.6rem 0.75rem',
    background: 'var(--bg-surface-alt)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  previewLabel: {
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  previewText: {
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    wordBreak: 'break-word',
  },
};
