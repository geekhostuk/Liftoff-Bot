import { Bot } from 'lucide-react';

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' },
  header: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' },
  title: { fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' },
  card: {
    background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-lg)', border: '1px solid var(--border-color)',
    flex: 1,
  },
  iframe: { width: '100%', height: 800, border: 'none', borderRadius: 'var(--radius-sm)' },
};

export default function BotRemote() {
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Bot size={22} />
        <span style={styles.title}>Bot1 Remote Access</span>
      </div>
      <div style={styles.card}>
        <iframe
          src="https://gs2.jesusmctwos.co.uk/?token=8d86c847460d6aef61e0d4e4e3f49ad3304076caab8ae77256bbbf0e0c9f5f6d"
          style={styles.iframe}
          title="Bot1 Remote"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
