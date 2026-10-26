/** Review browser-persisted submissions and maintain them without optimistic data loss. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import { deleteSubmission, readSubmissions, STATUS_LABELS, SUBMISSION_STATUSES, updateSubmissionStatus } from '../apply/submissions';
import EditSubmission from './EditSubmission';
import ResumeDrawer from './ResumeDrawer';

const FILTER_DEPARTMENTS = ['Engineering', 'Design', 'Product', 'Marketing', 'Operations'];

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
  const [previewing, setPreviewing] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const selectedDepartment = FILTER_DEPARTMENTS.includes(searchParams.get('department')) ? searchParams.get('department') : '';
  const visibleRecords = records.filter((record) => {
    const term = query.trim().toLowerCase();
    return (!selectedDepartment || record.department === selectedDepartment)
      && (record.fullName.toLowerCase().includes(term) || record.email.toLowerCase().includes(term));
  });

  /** Preserve unrelated URL state and use history for refresh and Back navigation. */
  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  /** Persist a status without optimistic changes or overwriting current metadata. */
  function handleStatus(id, status) {
    try {
      updateSubmissionStatus(id, status);
      refresh();
    } catch (cause) {
      setError(cause.message);
    }
  }

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
          <section aria-label="Pipeline distribution">
            <h2>
              Pipeline distribution
            </h2>
            <dl>
              {SUBMISSION_STATUSES.map((status) => (
                <div key={status}>
                  <dt>
                    {STATUS_LABELS[status]}
                  </dt>
                  <dd>
                    {records.filter((record) => (record.status || 'applied') === status).length}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-label="Filter submissions">
            <label htmlFor="submission-search">
              Search by name or email
            </label>
            <input
              id="submission-search"
              type="search"
              value={query}
              onChange={(event) => updateFilter('q', event.target.value)}
            />
            <div role="group" aria-label="Department filters">
              {['', ...FILTER_DEPARTMENTS].map((department) => (
                <button
                  key={department}
                  type="button"
                  className="cancel-button department-filter"
                  aria-pressed={selectedDepartment === department}
                  onClick={() => updateFilter('department', department)}
                >
                  {department || 'All departments'}
                </button>
              ))}
            </div>
            <p role="status">
              {visibleRecords.length} of {records.length} submissions shown.
            </p>
          </section>
          <section className="dashboard-table-card" aria-label="Submission records">
            {records.length === 0 ? (
              <p className="dashboard-empty">
                No submissions yet.
              </p>
            ) : visibleRecords.length === 0 ? (
              <p className="dashboard-empty">
                No submissions match your search and department filter.
              </p>
            ) : (
              <div className="table-scroll" role="region" aria-label="Submissions table, scroll horizontally" tabIndex={0}>
                <table className="submissions-table" aria-label="Submissions">
                  <thead>
                    <tr>
                      {['#', 'Full Name', 'Email', 'Mobile', 'Department', 'Submitted On', 'Status', 'Actions'].map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.map((record, index) => (
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
                        <td>
                          {formatDate(record.submittedAt)}
                        </td>
                        <td>
                          <select
                            aria-label={`Status for ${record.fullName}, ${record.email}`}
                            value={record.status || 'applied'}
                            onChange={(event) => handleStatus(record.id, event.target.value)}
                          >
                            {SUBMISSION_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-edit"
                              type="button"
                              aria-label={`Preview resume and portfolio for ${record.fullName}, ${record.email}`}
                              onClick={() => setPreviewing(record)}
                            >
                              Preview
                            </button>
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
      {previewing && (
        <ResumeDrawer submission={previewing} onClose={() => setPreviewing(null)} />
      )}
    </main>
  );
}

Dashboard.propTypes = {
  onLogout: PropTypes.func.isRequired,
};
