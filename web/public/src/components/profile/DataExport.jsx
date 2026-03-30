export default function DataExport() {
  return (
    <div className="data-export-section">
      <h2>Export Your Data</h2>
      <p className="text-muted">Download your complete racing data as CSV files.</p>
      <div className="data-export-actions">
        <a href="/api/auth/my-laps/csv" className="btn btn-outline" download>
          Download Lap History
        </a>
        <a href="/api/auth/my-races/csv" className="btn btn-outline" download>
          Download Race Results
        </a>
      </div>
    </div>
  );
}
