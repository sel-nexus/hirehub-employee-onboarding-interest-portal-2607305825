/** Review browser-persisted submissions and maintain them without optimistic data loss. */
import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import { deleteSubmission } from '../apply/submissions';
import EditSubmission from './EditSubmission';
import ReviewSubmission from './ReviewSubmission';
import {
  readRecruiterSubmissions as readSubmissions, filterSubmissions, requireRecruiter,
  RECRUITER_DEPARTMENTS, STATUS_LABELS, updateRecruiterSubmission,
} from './recruiterService';

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
  const [reviewing, setReviewing] = useState(null);
  const [notice, setNotice] = useState('');
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const department = params.get('department') || '';
  const status = params.get('status') || '';
  const visible = filterSubmissions(records, { search, department, status });

  /** Preserve unrelated URL state and history for Back/Forward and reload. */
  function changeFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  /** Save a quick stage change, then requery; never show an optimistic success. */
  function handleStatus(record, value) {
    setNotice('');
    try {
      updateRecruiterSubmission(record.id, { status: value });
      refresh();
      setNotice(`Stage saved for ${record.fullName}.`);
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
  const cancelEdit = useCallback(() => setEditing(null), []);
  const cancelReview = useCallback(() => setReviewing(null), []);

  /** Confirm deletion and preserve the table if writing or requerying fails. */
  function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this submission?')) return;
    setNotice('');
    try {
      requireRecruiter();
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
          <section className="submission-form" aria-label="Submission filters">
            <div className="submission-field">
              <label htmlFor="recruiter-search">
                Search candidate name or email
              </label>
              <input
                id="recruiter-search"
                type="search"
                value={search}
                onChange={(event) => changeFilter('search', event.target.value)}
              />
            </div>
            <div aria-label="Department filters" role="group" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['All', ...RECRUITER_DEPARTMENTS].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={department === (value === 'All' ? '' : value)}
                  className={department === (value === 'All' ? '' : value) ? 'submission-button' : 'cancel-button'}
                  onClick={() => changeFilter('department', value === 'All' ? '' : value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="submission-field">
              <label htmlFor="recruiter-stage">
                Filter by stage
              </label>
              <select id="recruiter-stage" value={status} onChange={(event) => changeFilter('status', event.target.value)}>
                <option value="">
                  All stages
                </option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </section>
          {notice && (
            <p role="status" className="submission-success">
              {notice}
            </p>
          )}
          <section className="dashboard-table-card" aria-label="Submission records">
            {records.length === 0 ? (
              <p className="dashboard-empty">
                No submissions yet.
              </p>
            ) : visible.length === 0 ? (
              <p className="dashboard-empty" role="status">
                No submissions match your filters.
              </p>
            ) : (
              <div className="table-scroll" role="region" aria-label="Submissions table, scroll horizontally" tabIndex={0}>
                <table className="submissions-table" aria-label="Submissions">
                  <thead>
                    <tr>
                      {['#', 'Full Name', 'Email', 'Mobile', 'Department', 'Submitted On', 'Stage', 'Actions'].map((column) => (
                        <th key={column} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((record, index) => (
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
                          <span className={`status-badge status-${record.status || 'received'}`} role="status">
                            {STATUS_LABELS[record.status || 'received']}
                          </span>
                          <select
                            aria-label={`Change stage for ${record.fullName}, ${record.email}, ${record.id}`}
                            value={record.status || 'received'}
                            onChange={(event) => handleStatus(record, event.target.value)}
                          >
                            {Object.entries(STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-edit"
                              type="button"
                              aria-label={`Review submission for ${record.fullName}, ${record.email}`}
                              onClick={() => setReviewing(record)}
                            >
                              Review
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
      {reviewing && (
        <ReviewSubmission
          key={reviewing.id}
          submission={reviewing}
          onSaved={refresh}
          onCancel={cancelReview}
        />
      )}
    </main>
  );
}

Dashboard.propTypes = {
  onLogout: PropTypes.func.isRequired,
};
