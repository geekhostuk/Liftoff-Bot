import useCountdown from '../../hooks/useCountdown';
import './CountdownBlock.css';

export default function CountdownBlock({ endDate, label = 'remaining' }) {
  const { days, hours, minutes, expired } = useCountdown(endDate);

  if (expired) {
    return <div className="countdown-block expired">Week ended</div>;
  }

  return (
    <div className="countdown-block">
      <div className="countdown-value">{days}</div>
      <div className="countdown-label">{days === 1 ? 'day' : 'days'} {label}</div>
      {days === 0 && (
        <div className="countdown-detail">{hours}h {minutes}m</div>
      )}
    </div>
  );
}
