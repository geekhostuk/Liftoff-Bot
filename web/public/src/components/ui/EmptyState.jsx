import './EmptyState.css';

export function Loading({ message = 'Loading...' }) {
  return (
    <div className="empty-state">
      <div className="empty-state-spinner" />
      <p>{message}</p>
    </div>
  );
}

export function Empty({ message = 'No data available.' }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="empty-state error">
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}
