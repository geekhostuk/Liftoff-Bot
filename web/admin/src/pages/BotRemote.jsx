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
          src="https://gameserver1.jesusmctwos.co.uk/auth?token=0013d777444d8863fcb13a88659a321401925ac75d0ba35dd326ab99538edeeb"
          style={styles.iframe}
          title="Bot1 Remote"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
