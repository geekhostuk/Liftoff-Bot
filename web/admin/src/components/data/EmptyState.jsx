export default function EmptyState({ icon: Icon, message = 'Nothing here yet' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-3xl) var(--space-lg)', color: 'var(--text-dim)', gap: 'var(--space-md)',
    }}>
      {Icon && <Icon size={40} strokeWidth={1} />}
      <span style={{ fontSize: '0.9rem' }}>{message}</span>
    </div>
  );
}
