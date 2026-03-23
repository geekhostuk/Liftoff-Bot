import { Search, X } from 'lucide-react';
import './SearchInput.css';

export default function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search-input-wrap">
      <Search size={16} className="search-input-icon" />
      <input
        type="text"
        className="form-input search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button className="search-input-clear" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
