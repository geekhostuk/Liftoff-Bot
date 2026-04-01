import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BotMessageSquare, Plus, Trash2, Pencil, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import DataTable from '../components/data/DataTable.jsx';
import Badge from '../components/feedback/Badge.jsx';
import EmptyState from '../components/data/EmptyState.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';

const TRIGGER_OPTIONS = ['track_change', 'race_start', 'race_end', 'player_joined', 'player_new', 'player_returned', 'player_unregistered', 'lobby_full'];
const CHAR_LIMIT = 255;

const columnHelper = createColumnHelper();

function fmtDelay(ms) {
  if (ms === 0) return 'Instant';
  const abs = Math.abs(ms);
  const prefix = ms < 0 ? '-' : '+';
  if (abs < 1000) return `${prefix}${abs}ms`;
  if (abs < 60000) return `${prefix}${(abs / 1000).toFixed(1)}s`;
  return `${prefix}${(abs / 60000).toFixed(1)}m`;
}

export default function AutoMessages() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  const [templates, setTemplates] = useState([]);
  const [variables, setVariables] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showVarRef, setShowVarRef] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({
    trigger: 'track_change',
    template: '',
    delay_ms: 0,
    enabled: true,
  });
  const templateRef = useRef(null);
  const previewTimer = useRef(null);

  // Load data
  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await apiFetch('GET', '/api/admin/chat/templates'));
    } catch {
      toast('Failed to load templates', 'error');
    }
  }, [apiFetch, toast]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    apiFetch('GET', '/api/admin/chat/template-variables')
      .then(setVariables)
      .catch(() => {});
  }, [apiFetch]);

  // Debounced live preview
  useEffect(() => {
    clearTimeout(previewTimer.current);
    if (!form.template.trim()) { setPreview(null); return; }
    previewTimer.current = setTimeout(async () => {
      try {
        const result = await apiFetch('POST', '/api/admin/chat/template-preview', { template: form.template });
        setPreview(result);
      } catch {
        setPreview(null);
      }
    }, 500);
    return () => clearTimeout(previewTimer.current);
  }, [form.template, apiFetch]);

  // Filter variables by selected trigger
  const filteredVars = variables.filter(
    (v) => v.triggers.includes('*') || v.triggers.includes(form.trigger)
  );

  // CRUD
  const handleToggleEnabled = async (row) => {
    const updated = { ...row, enabled: !row.enabled };
    try {
      await apiCall('PUT', `/api/admin/chat/templates/${row.id}`, updated, 'Template updated');
      setTemplates((prev) => prev.map((t) => (t.id === row.id ? updated : t)));
    } catch {}
  };

  const handleDelete = async (id) => {
    await apiCall('DELETE', `/api/admin/chat/templates/${id}`, null, 'Template deleted');
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (editingId === id) resetForm();
  };

  const handleEdit = (row) => {
    setEditingId(row.id);
    setForm({
      trigger: row.trigger,
      template: row.template,
      delay_ms: row.delay_ms,
      enabled: row.enabled,
    });
  };

  const handleTest = async (row) => {
    try {
      const result = await apiFetch('POST', '/api/admin/chat/template-preview', { template: row.template });
      toast(`Preview (${result.length} chars): ${result.resolved}`, 'success');
    } catch {
      toast('Preview failed', 'error');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ trigger: 'track_change', template: '', delay_ms: 0, enabled: true });
    setPreview(null);
  };

  const handleSave = async () => {
    if (!form.template.trim()) {
      toast('Message is required', 'warning');
      return;
    }
    const payload = {
      trigger: form.trigger,
      template: form.template.trim(),
      enabled: form.enabled,
      delay_ms: Number(form.delay_ms) || 0,
    };
    try {
      if (editingId) {
        const updated = await apiCall('PUT', `/api/admin/chat/templates/${editingId}`, payload, 'Template updated');
        if (updated) {
          setTemplates((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
        } else {
          await loadTemplates();
        }
      } else {
        const created = await apiCall('POST', '/api/admin/chat/templates', payload, 'Template added');
        if (created) {
          setTemplates((prev) => [...prev, created]);
        } else {
          await loadTemplates();
        }
      }
      resetForm();
    } catch {}
  };

  // Insert variable at cursor
  const insertVariable = (key) => {
    const el = templateRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const token = `{${key}}`;
    const next = form.template.slice(0, start) + token + form.template.slice(end);
    setForm((p) => ({ ...p, template: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const charCount = form.template.length;
  const charColor = charCount > CHAR_LIMIT ? 'var(--color-danger)' : charCount > 240 ? '#f97316' : charCount > 200 ? '#eab308' : 'var(--text-muted)';

  // Table columns
  const columns = [
    columnHelper.accessor('trigger', {
      header: 'Trigger',
      cell: (info) => <Badge variant="accent">{info.getValue()}</Badge>,
    }),
    columnHelper.accessor('template', {
      header: 'Message',
      cell: (info) => (
        <span style={{ color: 'var(--text-secondary)', maxWidth: 350, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('delay_ms', {
      header: 'Delay',
      cell: (info) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {fmtDelay(info.getValue())}
        </span>
      ),
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
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className="btn-icon"
            onClick={() => handleEdit(info.row.original)}
            title="Edit"
          >
            <Pencil size={15} />
          </button>
          <button
            className="btn-icon"
            onClick={() => handleTest(info.row.original)}
            title="Preview"
          >
            <Eye size={15} />
          </button>
          <ConfirmButton
            onConfirm={() => handleDelete(info.row.original.id)}
            className="btn-icon"
            confirmText="Delete?"
          >
            <Trash2 size={15} />
          </ConfirmButton>
        </div>
      ),
    }),
  ];

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>
        <BotMessageSquare size={22} style={{ marginRight: 8 }} />
        Auto Messages
      </h1>

      {/* Template List */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Templates</h2>
        <DataTable
          data={templates}
          columns={columns}
          emptyMessage="No templates configured"
        />
      </div>

      {/* Add / Edit Template */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>
          {editingId ? 'Edit Template' : 'Add Template'}
          {editingId && (
            <button className="btn-ghost btn-sm" onClick={resetForm} style={{ marginLeft: 8 }}>
              Cancel
            </button>
          )}
        </h2>

        <div style={styles.formGrid}>
          <div style={styles.formRow}>
            <label style={styles.label}>Trigger</label>
            <select
              value={form.trigger}
              onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value }))}
              style={styles.select}
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Delay</label>
            <div style={styles.delayRow}>
              <input
                type="number"
                value={form.delay_ms}
                onChange={(e) => setForm((p) => ({ ...p, delay_ms: e.target.value }))}
                style={{ ...styles.input, width: 120, flex: 'none' }}
                step={500}
              />
              <span style={styles.delayHint}>{fmtDelay(Number(form.delay_ms) || 0)}</span>
            </div>
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Enabled</label>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
                style={{ accentColor: 'var(--color-primary)', marginRight: 4 }}
              />
              Active
            </label>
          </div>
        </div>

        {/* Variable chips */}
        <div style={styles.varsSection}>
          <span style={styles.varsLabel}>Insert variable:</span>
          <div style={styles.varsChips}>
            {filteredVars.map((v) => (
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

        <textarea
          ref={templateRef}
          value={form.template}
          onChange={(e) => setForm((p) => ({ ...p, template: e.target.value }))}
          placeholder="Message template with {variables}..."
          rows={3}
          style={styles.textarea}
        />

        <div style={styles.formFooter}>
          <span style={{ ...styles.charCount, color: charColor }}>
            {charCount} / {CHAR_LIMIT}
          </span>
          <button
            className="btn-primary"
            style={styles.saveBtn}
            onClick={handleSave}
            disabled={!form.template.trim()}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            {editingId ? 'Save' : 'Add'}
          </button>
        </div>

        {/* Live Preview */}
        {preview && (
          <div style={styles.previewBox}>
            <span style={styles.previewLabel}>
              Live Preview ({preview.length} chars
              {preview.length > CHAR_LIMIT ? ' — over limit!' : ''}):
            </span>
            <span style={styles.previewText}>{preview.resolved}</span>
          </div>
        )}
      </div>

      {/* Variable Reference */}
      <div style={styles.card}>
        <button
          onClick={() => setShowVarRef((p) => !p)}
          style={styles.collapseBtn}
        >
          <h2 style={styles.cardTitle}>Variable Reference</h2>
          {showVarRef ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showVarRef && (
          <div style={styles.varRefTable}>
            <div style={styles.varRefGroup}>
              <h3 style={styles.varRefGroupTitle}>Universal (all triggers)</h3>
              {variables.filter((v) => v.triggers.includes('*')).map((v) => (
                <div key={v.key} style={styles.varRefRow}>
                  <code style={styles.varRefKey}>{`{${v.key}}`}</code>
                  <span style={styles.varRefDesc}>{v.description}</span>
                </div>
              ))}
            </div>
            {TRIGGER_OPTIONS.map((trigger) => {
              const triggerVars = variables.filter(
                (v) => !v.triggers.includes('*') && v.triggers.includes(trigger)
              );
              if (triggerVars.length === 0) return null;
              return (
                <div key={trigger} style={styles.varRefGroup}>
                  <h3 style={styles.varRefGroupTitle}>{trigger}</h3>
                  {triggerVars.map((v) => (
                    <div key={v.key} style={styles.varRefRow}>
                      <code style={styles.varRefKey}>{`{${v.key}}`}</code>
                      <span style={styles.varRefDesc}>{v.description}</span>
                    </div>
                  ))}
                </div>
              );
            })}
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
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  formGrid: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    marginBottom: '1rem',
    marginTop: '1rem',
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  label: {
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
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
  input: {
    padding: '0.5rem 0.75rem',
    background: 'var(--bg-surface-alt)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
  },
  delayRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  delayHint: {
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
  },
  checkLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    cursor: 'pointer',
    paddingTop: '0.35rem',
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
  formFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '0.5rem',
  },
  charCount: {
    fontSize: '0.8rem',
    fontFamily: 'monospace',
  },
  saveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.5rem 1rem',
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
  collapseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    padding: 0,
  },
  varRefTable: {
    marginTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  varRefGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  varRefGroupTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    margin: 0,
  },
  varRefRow: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'baseline',
    paddingLeft: '0.5rem',
  },
  varRefKey: {
    color: '#a78bfa',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    flexShrink: 0,
    minWidth: 90,
  },
  varRefDesc: {
    color: 'var(--text-secondary)',
    fontSize: '0.85rem',
  },
};
