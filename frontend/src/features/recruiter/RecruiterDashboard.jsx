/** Present the browser-local pipeline with URL-backed filters and verified updates. */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requireRole } from '../access/accounts';
import { DEPARTMENTS, STATUS_LABELS, readRecruiterRecords, updateStatus } from './recruiter';
import RecordDialog from './RecordDialog';

/** Render all records or the combined search/filter view; never persist a filtered array. */
export default function RecruiterDashboard() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const department = params.get('department') || 'All';
  const [result, setResult] = useState(() => readRecruiterRecords());
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [active, setActive] = useState(null);
  const close = useCallback(() => setActive(null), []);
  const identity = requireRole('admin');

  /** Requery actual storage after navigation, retry, or another tab's update. */
  const refresh = useCallback(() => {
    setResult(readRecruiterRecords({ search, department }));
  }, [search, department]);
  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  /** Preserve unrelated query parameters and omit default filter values. */
  function filter(key, value) {
    const next = new URLSearchParams(params);
    if (!value || value === 'All') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key === 'search' });
  }

  /** Retain existing rows on save failure while surfacing the failure immediately. */
  function status(id, value) {
    const saved = updateStatus(id, value);
    setSaveError(!saved.success);
    if (!saved.success) setMessage(saved.error);
    else {
      setMessage(saved.warning || 'Status saved.');
      refresh();
    }
  }

  /** Close only after a successful service result and requery the persisted view. */
  function saved(result) {
    setSaveError(false);
    setMessage(result.warning || 'Changes saved.');
    close();
    refresh();
  }

  return (
    <main id="main-content" className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <h1>Recruiter Access</h1>
          <h2>Recruiter Dashboard</h2>
          {identity.success && (
            <p>Welcome, {identity.data.displayName}.</p>
          )}
          <p>Review every local application, including public interest records.</p>
        </div>
      </div>
      <label htmlFor="recruiter-search">Search name or email</label>
      <input id="recruiter-search" type="search" value={search} onChange={(event) => filter('search', event.target.value)} />
      <div role="group" aria-label="Department filters">
        {['All', ...DEPARTMENTS].map((item) => (
          <button key={item} className="cancel-button" aria-pressed={department === item} onClick={() => filter('department', item)}>{item}</button>
        ))}
      </div>
      {message && (
        <p role={saveError ? 'alert' : 'status'} aria-live={saveError ? 'assertive' : 'polite'}>{message}</p>
      )}
      {result.warning && (
        <p role="status">{result.warning}</p>
      )}
      {!result.success ? (
        <div className="submission-storage-error" role="alert">
          <p>{result.error}</p>
          <button className="cancel-button" onClick={refresh}>Retry</button>
          <button className="cancel-button" onClick={() => { filter('department', 'All'); }}>Show all departments</button>
        </div>
      ) : (
        <>
          <p role="status">{result.data.length} matching applications</p>
          {result.data.length === 0 ? (
            <p className="dashboard-empty">No applications match this view.</p>
          ) : (
            <div className="dashboard-table-card table-scroll" tabIndex={0} role="region" aria-label="Recruiter applications">
              <table className="submissions-table">
                <caption>Application pipeline</caption>
                <thead>
                  <tr>
                    {['Candidate', 'Department', 'Status', 'Actions'].map((heading) => (
                      <th key={heading} scope="col">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.fullName}</strong>
                        <p>{record.email}</p>
                        <p>{record.mobile}</p>
                      </td>
                      <td>{record.department}</td>
                      <td>
                        <select aria-label={`Status for ${record.fullName} ${record.department} ${record.id}`} value={record.status || 'applied'} onChange={(event) => status(record.id, event.target.value)}>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        {record.interview && (
                          <p>Mock interview schedule: {record.interview.date} at {record.interview.time} ({record.interview.timezone}) — {record.interview.location}</p>
                        )}
                      </td>
                      <td>
                        {['edit', 'notes', 'materials', 'delete'].map((mode) => (
                          <button key={mode} className={mode === 'delete' ? 'row-delete cancel-button' : 'row-edit cancel-button'} aria-label={`${mode} ${record.fullName} ${record.department} ${record.id}`} onClick={() => setActive({ record, mode })}>{mode[0].toUpperCase() + mode.slice(1)}</button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {active && (
        <RecordDialog key={`${active.record.id}-${active.mode}`} {...active} onClose={close} onSaved={saved} />
      )}
    </main>
  );
}
