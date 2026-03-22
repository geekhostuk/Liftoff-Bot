import './PilotSearch.css';

export default function PilotSearch({ value, onChange }) {
  return (
    <div className="pilot-search">
      <input
        type="text"
        className="pilot-search-input"
        placeholder="Search pilots..."
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
