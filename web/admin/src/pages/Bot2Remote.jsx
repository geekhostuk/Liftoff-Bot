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

export default function Bot2Remote() {
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Bot size={22} />
        <span style={styles.title}>Bot2 Remote Access</span>
      </div>
      <div style={styles.card}>
        <iframe
          src="https://gameserver2.jesusmctwos.co.uk/auth?token=89kk04tn2poochjj09y8vpicor8d4yy9cp84g0f9399zrq984q55u9yr5abaz27l"
          style={styles.iframe}
          title="Bot2 Remote"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
