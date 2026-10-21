/** Review browser-persisted submissions and maintain them without optimistic data loss. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { deleteSubmission, readSubmissions } from '../apply/submissions';
import EditSubmission from './EditSubmission';

/** Format a valid persisted timestamp using the specified US abbreviated date. */
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Display current records, accurate summaries, and confirmed maintenance actions.
 * Args:
 *   onLogout: The shared session-removal and redirect handler.
 * Returns:
 *   A dashboard with a scrollable full-detail table, retry feedback, and optional editor.
 * Notes:
 *   Each successful mutation is followed by a fresh storage read before updating UI.
 */
export default function Dashboard({ onLogout }) {
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    try {
      setRecords(readSubmissions());
      setLoaded(true);
    } catch (cause) {
      setError(cause.message);
    }
  }, []);

  /** Replace displayed data only after reading storage succeeds. */
  function refresh() {
    const current = readSubmissions();
    setRecords(current);
    setLoaded(true);
    setError('');
  }

  /** Retry an unavailable read without showing a false empty dataset. */
  function retry() {
    try {
      refresh();
    } catch (cause) {
      setError(cause.message);
    }
  }

  /** Requery persisted changes before closing the editor. */
  function handleSaved() {
    refresh();
    setEditing(null);
  }

  /** Close the dialog without changing records or storage. */
  function cancelEdit() {
    setEditing(null);
  }

  /** Confirm deletion and preserve the table if writing or requerying fails. */
  function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this submission?')) return;
    try {
      deleteSubmission(id);
      refresh();
    } catch (cause) {
      setError(cause.message);
    }
  }

  const departments = new Set(records.map((record) => record.department)).size;
  const latest = records.reduce((maximum, record) => Math.max(maximum, Date.parse(record.submittedAt)), -Infinity);

  return (
    <main id="main-content" className="dashboard-page">
      <div className="dashboard-heading">
        <h1>
          Submissions Dashboard
        </h1>
        <button className="session-control logout-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
      {error && (
        <div className="submission-storage-error">
          <p role="alert">
            {error}
          </p>
          <button className="cancel-button" type="button" onClick={retry}>
            Retry loading submissions
          </button>
        </div>
      )}
      {loaded && (
        <>
          <dl className="dashboard-stats" aria-label="Submission summary">
            <div className="stat-card stat-total">
              <dt>Total Submissions</dt>
              <dd>{records.length}</dd>
            </div>
            <div className="stat-card stat-departments">
              <dt>Departments</dt>
              <dd>{departments}</dd>
            </div>
            <div className="stat-card stat-latest">
              <dt>Latest Submission</dt>
              <dd>{records.length ? formatDate(latest) : 'N/A'}</dd>
            </div>
          </dl>
          <section className="dashboard-table-card" aria-label="Submission records">
            {records.length === 0 ? (
              <p className="dashboard-empty">
                No submissions yet.
              </p>
            ) : (
              <div className="table-scroll" role="region" aria-label="Submissions table, scroll horizontally" tabIndex={0}>
                <table className="submissions-table" aria-label="Submissions">
                  <thead>
                    <tr>
                      {['#', 'Full Name', 'Email', 'Mobile', 'Department', 'Submitted On', 'Actions'].map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, index) => (
                      <tr key={record.id}>
                        <td>{index + 1}</td>
                        <td>{record.fullName}</td>
                        <td>{record.email}</td>
                        <td>{record.mobile}</td>
                        <td>
                          <span className="department-badge">
                            {record.department}
                          </span>
                        </td>
                        <td>{formatDate(record.submittedAt)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-edit"
                              type="button"
                              aria-label={`Edit submission for ${record.fullName}, ${record.email}`}
                              onClick={() => setEditing(record)}
                            >
                              Edit
                            </button>
                            <button
                              className="row-delete"
                              type="button"
                              aria-label={`Delete submission for ${record.fullName}, ${record.email}`}
                              onClick={() => handleDelete(record.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {editing && (
        <EditSubmission submission={editing} onSaved={handleSaved} onCancel={cancelEdit} />
      )}
    </main>
  );
}

Dashboard.propTypes = {
  onLogout: PropTypes.func.isRequired,
};
